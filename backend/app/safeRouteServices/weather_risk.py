"""
SafeRoute - weather-based obstruction prediction (hackathon MVP)
================================================================
Turns weather (rain, humidity, pressure trend, wind, visibility, soil
moisture) into the probability that each road is obstructed, now and over
the next hours. The probabilities feed your route cost and the CP solver's
route reliability.

Pipeline
  weather hours  ->  hazard index H (0..1)  ->  per-road probability p
  p + road travel times -> route reliability / risk-weighted cost
  -> cp_assignment.solve_assignment(...)

IMPORTANT: the weights below are hand-tuned, explainable rules, NOT a model
trained on flood data. Say "risk model based on rainfall, soil saturation,
humidity, pressure trend and road vulnerability" in your pitch. If you get
historical flood records, replace hazard_components() with a trained model.
"""
import json
import math
import urllib.request

# Centre of the monsoon_demo scenario (Amritsar area)
DEFAULT_LAT, DEFAULT_LON = 31.633, 74.873

K_RISK = 3.0          # how strongly probability inflates a road's cost
STEEPNESS = 13.0      # how sharply risk rises with exposure
THRESHOLD = 0.35      # exposure at which a road is ~50% likely to be obstructed

# how much each weather factor contributes to the hazard index (sum = 1)
WEIGHTS = {
    "rain": 0.40,        # rain over the last 3 hours (mm)
    "antecedent": 0.20,  # rain over the last 24 hours (already wet ground)
    "forecast": 0.13,    # rain expected in the next 3 hours x chance of rain
    "saturation": 0.12,  # soil moisture, or humidity when soil data is missing
    "pressure": 0.10,    # falling pressure = approaching storm
    "wind": 0.05,        # storm winds / debris
}


def _clip(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def _sigmoid(z):
    return 1.0 / (1.0 + math.exp(-z))


_P0 = _sigmoid(-STEEPNESS * THRESHOLD)   # baseline so dry weather -> exactly 0


# ---------------------------------------------------------- weather series
class WeatherSeries:
    """Hourly weather. hours[i] is a dict with keys (all optional):
    rain_mm, precip_prob (%), humidity (%), pressure_hpa, wind_kmh,
    visibility_m, soil_moisture.  hours[now_index] is the current hour."""

    def __init__(self, hours, now_index, source="custom"):
        self.hours, self.now, self.source = hours, now_index, source

    def _h(self, i):
        return self.hours[min(max(i, 0), len(self.hours) - 1)]

    def _rain(self, j):
        return (self.hours[j].get("rain_mm") or 0.0) if 0 <= j < len(self.hours) else 0.0

    def components(self, i):
        h = self._h(i)
        rain_3h = sum(self._rain(j) for j in range(i - 2, i + 1))
        rain_24h = sum(self._rain(j) for j in range(i - 23, i + 1))
        rain_next3 = sum(self._rain(j) for j in range(i + 1, i + 4))
        humidity = h.get("humidity") if h.get("humidity") is not None else 60.0
        pressure = h.get("pressure_hpa") if h.get("pressure_hpa") is not None else 1010.0
        prev = self._h(i - 3).get("pressure_hpa")
        drop = (prev - pressure) if prev is not None else 0.0
        wind = h.get("wind_kmh") or 0.0
        prob = (h.get("precip_prob") or 0.0) / 100.0
        soil = h.get("soil_moisture")
        saturation = (_clip((soil - 0.15) / 0.25) if soil is not None
                      else _clip((humidity - 60.0) / 40.0))
        terms = {
            "rain": _clip(rain_3h / 30.0),
            "antecedent": _clip(rain_24h / 80.0),
            "forecast": _clip(prob) * _clip(rain_next3 / 20.0),
            "saturation": saturation,
            "pressure": _clip(drop / 6.0),
            "wind": _clip(wind / 60.0),
        }
        hazard = sum(WEIGHTS[k] * v for k, v in terms.items())
        return {"hazard": hazard, "terms": terms, "rain_3h_mm": rain_3h,
                "rain_24h_mm": rain_24h, "rain_next_3h_mm": rain_next3,
                "humidity": humidity, "pressure_drop_hpa": drop, "wind_kmh": wind}

    def hazard_at(self, minutes_from_now):
        """Hazard index (0..1) at a moment, interpolated between hours."""
        pos = self.now + minutes_from_now / 60.0
        lo = math.floor(pos)
        w = pos - lo
        return ((1 - w) * self.components(lo)["hazard"]
                + w * self.components(lo + 1)["hazard"])

    def visibility_factor(self, minutes_from_now):
        """Travel-time multiplier: fog/smog/heavy rain slow people down."""
        vis = self._h(round(self.now + minutes_from_now / 60.0)).get("visibility_m")
        if vis is None:
            return 1.0
        return 1.0 + 0.5 * _clip((2000.0 - vis) / 2000.0)

    def explain(self, minutes_from_now=0):
        """Human-readable reasons, e.g. for a dashboard tooltip."""
        c = self.components(round(self.now + minutes_from_now / 60.0))
        t, why = c["terms"], []
        if t["rain"] > 0.3:
            why.append(f"heavy rain ({c['rain_3h_mm']:.0f} mm in 3 h)")
        if t["antecedent"] > 0.3:
            why.append(f"ground already wet ({c['rain_24h_mm']:.0f} mm in 24 h)")
        if t["forecast"] > 0.2:
            why.append(f"more rain coming ({c['rain_next_3h_mm']:.0f} mm in next 3 h)")
        if t["saturation"] > 0.5:
            why.append(f"saturated air/soil (humidity {c['humidity']:.0f}%)")
        if t["pressure"] > 0.3:
            why.append(f"pressure falling ({c['pressure_drop_hpa']:.1f} hPa in 3 h)")
        if t["wind"] > 0.4:
            why.append(f"strong wind ({c['wind_kmh']:.0f} km/h)")
        return why or ["no significant weather hazard"]


# ----------------------------------------------------- per-road probability
def default_vulnerability(edge_id):
    """How flood-prone a road is (0..1). Override per road with real data
    (elevation, near river, underpass, past flooding)."""
    e = edge_id.upper()
    if "UNDERPASS" in e or "UNDER" in e:
        return 0.95
    if "BRIDGE" in e:
        return 0.80
    if "STAIRS" in e:
        return 0.25
    return 0.35


def combine(p_weather, p_observed):
    """Merge predicted risk with what the backend already observes."""
    return 1.0 - (1.0 - p_weather) * (1.0 - p_observed)


def edge_probability(series, edge_id, minutes_from_now, vulnerability=None, observed_p=0.0):
    v = (vulnerability or {}).get(edge_id, default_vulnerability(edge_id))
    exposure = series.hazard_at(minutes_from_now) * (0.15 + 0.8 * v)
    p = _sigmoid(STEEPNESS * (exposure - THRESHOLD))
    p = _clip((p - _P0) / (1 - _P0))
    return combine(p, observed_p)


def predict_edges(series, edge_ids, minutes_list, vulnerability=None):
    """{edge_id: {minute: probability}} - for a timeline/heat-map view."""
    return {e: {m: round(edge_probability(series, e, m, vulnerability), 3)
                for m in minutes_list} for e in edge_ids}


def route_metrics(series, edge_ids, edge_times_s, start_minute=0, vulnerability=None,
                  observed=None, k=K_RISK):
    """Walk a route minute by minute: each road is judged when people reach it.
    Returns {"cost", "reliability", "time_s", "edges"} - exactly what
    cp_assignment expects in `pairs`."""
    elapsed, rel, cost = 0.0, 1.0, 0.0
    for eid, tt in zip(edge_ids, edge_times_s):
        t = start_minute + elapsed / 60.0
        p = edge_probability(series, eid, t, vulnerability, (observed or {}).get(eid, 0.0))
        tt_eff = tt * series.visibility_factor(t)
        rel *= 1.0 - p
        cost += tt_eff * (1.0 + k * p)
        elapsed += tt_eff
    return {"cost": cost, "reliability": rel, "time_s": elapsed, "edges": list(edge_ids)}


# ------------------------------------------------------------ weather sources
def custom_weather(rain_mm_h=0.0, humidity=50.0, pressure_drop_hpa=0.0, wind_kmh=10.0,
                   ramp_hours=3, visibility_m=10000.0, past_hours=24, future_hours=12,
                   prior_rain_mm_h=0.0, source="custom"):
    """Build a scenario: rain ramps from 0 to rain_mm_h over `ramp_hours`
    starting now; pressure falls by pressure_drop_hpa; humidity rises."""
    hours = []
    for i in range(-past_hours, future_hours + 1):
        if i <= 0:
            rain, f = prior_rain_mm_h, 0.0
        else:
            f = _clip(i / max(ramp_hours, 1))
            rain = rain_mm_h * f
        hours.append({
            "rain_mm": rain,
            "precip_prob": 100.0 if rain > 0.5 else (60.0 if i > -2 and rain_mm_h > 0 else 5.0),
            "humidity": humidity if i > -3 else max(40.0, humidity - 25),
            "pressure_hpa": 1012.0 - pressure_drop_hpa * _clip((i + 3) / (ramp_hours + 3)),
            "wind_kmh": wind_kmh * (0.6 + 0.4 * f),
            "visibility_m": visibility_m if rain < 15 else 3000.0,
        })
    return WeatherSeries(hours, now_index=past_hours, source=source)


PRESETS = {
    "clear": dict(rain_mm_h=0, humidity=45, pressure_drop_hpa=0, wind_kmh=8),
    "monsoon_building": dict(rain_mm_h=14, humidity=90, pressure_drop_hpa=6, wind_kmh=30,
                             ramp_hours=3, prior_rain_mm_h=2),
    "cloudburst": dict(rain_mm_h=45, humidity=97, pressure_drop_hpa=9, wind_kmh=50,
                       ramp_hours=1, prior_rain_mm_h=4),
}


def preset_weather(name):
    return custom_weather(source=f"preset:{name}", **PRESETS[name])


def parse_open_meteo(data, past_hours=24):
    """Open-Meteo JSON -> WeatherSeries (hourly arrays; index past_hours = now)."""
    h = data["hourly"]
    n = len(h["time"])

    def col(name, i, default=None):
        arr = h.get(name)
        return arr[i] if arr and arr[i] is not None else default

    hours = [{
        "rain_mm": col("precipitation", i, 0.0),
        "precip_prob": col("precipitation_probability", i, 0.0),
        "humidity": col("relative_humidity_2m", i),
        "pressure_hpa": col("surface_pressure", i),
        "wind_kmh": col("wind_speed_10m", i, 0.0),
        "visibility_m": col("visibility", i),
        "soil_moisture": col("soil_moisture_0_to_1cm", i),
    } for i in range(n)]
    return WeatherSeries(hours, now_index=min(past_hours, n - 1), source="open-meteo")


def fetch_open_meteo(lat=DEFAULT_LAT, lon=DEFAULT_LON, past_hours=24, forecast_hours=12, timeout=10):
    """Live weather + forecast from Open-Meteo (free, no API key)."""
    url = ("https://api.open-meteo.com/v1/forecast"
           f"?latitude={lat}&longitude={lon}"
           "&hourly=precipitation,precipitation_probability,relative_humidity_2m,"
           "surface_pressure,wind_speed_10m,visibility,soil_moisture_0_to_1cm"
           f"&past_hours={past_hours}&forecast_hours={forecast_hours}&timezone=auto")
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return parse_open_meteo(json.loads(resp.read().decode("utf-8")), past_hours)


def get_weather(source="live", lat=DEFAULT_LAT, lon=DEFAULT_LON):
    """source: 'live' (Open-Meteo) or a preset name. Live falls back to 'clear'
    if the internet is unavailable, and says so in series.source."""
    if source in PRESETS:
        return preset_weather(source)
    try:
        return fetch_open_meteo(lat, lon)
    except Exception as exc:                       # offline at the hackathon venue
        fallback = preset_weather("clear")
        fallback.source = f"fallback-clear (live fetch failed: {exc})"
        return fallback