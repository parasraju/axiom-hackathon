"""
SafeRoute service core (no web code here, so it is easy to test).

THE ONE PLACE TO SWAP IN YOUR OWN ROUTE FINDER: route() below.
It must return {"edges": [...], "nodes": [...], "cost": float,
"time_s": float, "reliability": float} or None if unreachable.
"""
import heapq
import math
import time

from cp_assignment import origins_from_snapshot, shelters_from_snapshot, solve_assignment
from graph import BLOCK_P, Network
from weather_risk import PRESETS, combine, custom_weather, edge_probability, get_weather, preset_weather

K_RISK = 3.0

# Flood-proneness per road (0..1). Roads not listed use weather_risk.default_vulnerability
# (BRIDGE 0.8, UNDERPASS 0.95, STAIRS 0.25, others 0.35). Edit with real data.
VULNERABILITY = {}


# ------------------------------------------------------------ weather state
class WeatherProvider:
    """Holds the current weather mode. 'live' is cached so you do not hit the
    weather API on every request; presets / custom are for demos."""

    def __init__(self, mode="live", ttl_s=600):
        self.mode, self.params, self.ttl = mode, {}, ttl_s
        self._cache, self._at = None, 0.0

    def set_mode(self, mode, params=None):
        if mode not in ("live", "custom") and mode not in PRESETS:
            raise ValueError(f"mode must be 'live', 'custom' or one of {list(PRESETS)}")
        self.mode, self.params, self._cache = mode, params or {}, None

    def get(self):
        if self.mode == "custom":
            return custom_weather(**self.params)
        if self.mode in PRESETS:
            return preset_weather(self.mode)
        if self._cache is None or time.time() - self._at > self.ttl:
            self._cache, self._at = get_weather("live"), time.time()
        return self._cache


# --------------------------------------------------------------- road risk
def road_state(net, series, eid, t_min):
    """(probability obstructed, travel time in s) of a road at minute t.
    Combines what the scenario already shows with the weather prediction."""
    p_obs, tt = net.state_at(eid, t_min)
    p_weather = edge_probability(series, eid, t_min, VULNERABILITY)
    return combine(p_weather, p_obs), tt * series.visibility_factor(t_min)


def risk_forecast(net, series, minutes):
    """{road_id: {minute: probability}} for the map heat layer."""
    return {eid: {m: round(road_state(net, series, eid, m)[0], 3) for m in minutes}
            for eid in net.edges}


# ------------------------------------------------------------------ routing
def route(net, series, src, dst, start_min, mode="walk", k=K_RISK, use_weather=True):
    """Risk-weighted Dijkstra; each road is judged when people reach it.
    use_weather=False, k=0 -> plain fastest route (used for the greedy baseline)."""
    if src == dst:
        return {"edges": [], "nodes": [src], "cost": 0.0, "time_s": 0.0, "reliability": 1.0}
    best = {src: 0.0}
    heap = [(0.0, src, 0.0, 1.0, ())]
    while heap:
        cost, n, el, rel, path = heapq.heappop(heap)
        if n == dst:
            nodes = [net.edges[path[0]]["from"]] + [net.edges[e]["to"] for e in path]
            return {"edges": list(path), "nodes": nodes, "cost": cost, "time_s": el, "reliability": rel}
        if cost > best.get(n, math.inf):
            continue
        for eid in net.adj.get(n, []):
            e = net.edges[eid]
            if mode == "wheelchair" and e["stairs"]:
                continue
            t = start_min + el / 60.0
            if use_weather:
                p, tt = road_state(net, series, eid, t)
            else:
                p, tt = net.state_at(eid, t)
            if p >= BLOCK_P:
                continue
            nc = cost + tt * (1 + k * p)
            if nc < best.get(e["to"], math.inf):
                best[e["to"]] = nc
                heapq.heappush(heap, (nc, e["to"], el + tt, rel * (1 - p), path + (eid,)))
    return None


def evaluate(net, series, edges, start_min):
    """What really happens on a fixed route under the weather forecast."""
    rel, el = 1.0, 0.0
    for eid in edges:
        p, tt = road_state(net, series, eid, start_min + el / 60.0)
        if p >= BLOCK_P:
            return 0.0, True
        rel *= 1 - p
        el += tt
    return rel, False


# ---------------------------------------------------------- greedy baseline
def greedy_baseline(net, series, origins, shelters, minute, mode):
    """Nearest shelter first, ignoring weather and road capacity."""
    free = {s["id"]: s["free"] for s in shelters}
    flows = []
    for o in origins:
        options = []
        for s in shelters:
            r = route(net, series, o["node"], s["node"], minute, mode, k=0.0, use_weather=False)
            if r:
                options.append((r["cost"], s, r))
        left = o["pop"]
        for _, s, r in sorted(options, key=lambda x: x[0]):
            n = min(left, free[s["id"]])
            if n > 0:
                rel, failed = evaluate(net, series, r["edges"], minute)
                flows.append({"origin_id": o["id"], "shelter_id": s["id"], "people": n,
                              "route_nodes": r["nodes"], "route_edges": r["edges"],
                              "reliability": round(rel, 3), "route_fails": failed})
                free[s["id"]] -= n
                left -= n
            if left == 0:
                break
    placed = sum(f["people"] for f in flows)
    flow = {}
    for f in flows:
        for e in f["route_edges"]:
            flow[e] = flow.get(e, 0) + f["people"]
    return {"flows": flows, "people_placed": placed,
            "expected_safe_arrivals": round(sum(f["people"] * f["reliability"] for f in flows), 1),
            "overloaded_roads": sorted(e for e, n in flow.items() if n > net.edges[e]["capacity"])}


# ------------------------------------------------------------- full pipeline
RISKY_BELOW = 0.5   # a route with reliability below this counts as "risky"


def build_plan(snapshot, timeline, series, minute=0, mode="walk",
               free_override=None, fairness=True, min_reliability=0.25):
    net = Network(snapshot, timeline)
    origins = origins_from_snapshot(snapshot)
    for o, raw in zip(origins, snapshot["origins"]):
        o["node"] = raw["node_id"]
        o["needs_accessible"] = (mode == "wheelchair")
    shelters = shelters_from_snapshot(snapshot, free_override)
    for s, raw in zip(shelters, snapshot["shelters"]):
        s["node"] = net.nearest_node(raw["lon"], raw["lat"])

    pairs, nodes = {}, {}
    for o in origins:
        for s in shelters:
            if s["free"] <= 0:
                continue
            r = route(net, series, o["node"], s["node"], minute, mode)
            if r:
                pairs[(o["id"], s["id"])] = r
                nodes[(o["id"], s["id"])] = r["nodes"]
    edge_cap = {eid: e["capacity"] for eid, e in net.edges.items()}
    optimal = solve_assignment(origins, shelters, pairs, edge_cap, fairness=fairness,
                               min_reliability=min_reliability)
    for f in optimal["flows"]:
        f["route_nodes"] = nodes[(f["origin_id"], f["shelter_id"])]
    greedy = greedy_baseline(net, series, origins, shelters, minute, mode)
    safe = round(sum(f["people"] * f["reliability"] for f in optimal["flows"]), 1)
    risky = lambda flows: sum(f["people"] for f in flows if f["reliability"] < RISKY_BELOW)
    return {
        "scenario_id": snapshot.get("scenario_id"), "minute": minute, "mode": mode,
        "weather": {"source": series.source,
                    "hazard_now": round(series.hazard_at(minute), 3),
                    "hazard_in_60_min": round(series.hazard_at(minute + 60), 3),
                    "why": series.explain(minute + 60)},
        "free_seats": {s["id"]: s["free"] for s in shelters},
        "optimal": optimal,
        "greedy": greedy,
        "comparison": {
            "people_placed": {"optimal": optimal["total_assigned"], "greedy": greedy["people_placed"]},
            "expected_safe_arrivals": {"optimal": safe, "greedy": greedy["expected_safe_arrivals"]},
            "people_on_risky_routes": {"optimal": risky(optimal["flows"]), "greedy": risky(greedy["flows"])},
            "overloaded_roads": {"optimal": optimal["overloaded_edges"], "greedy": greedy["overloaded_roads"]},
            "worst_off_origin_coverage_optimal": optimal["min_origin_coverage"],
        },
    }