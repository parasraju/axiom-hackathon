"""Road network + scenario timeline (road state at each keyframe).
Reads the JSON your existing backend already serves (/snapshot and /timeline)."""
import re

BLOCK_P = 0.8              # risk >= this -> road treated as blocked
FLOOD_IMPASSABLE_M = 0.5   # flood depth (m) at which walking is impossible


def _clip(x):
    return max(0.0, min(1.0, x))


def _coord(c):
    """[lon, lat] list, or 'lon lat' string (PowerShell prints it that way)."""
    if isinstance(c, str):
        a, b = re.split(r"[ ,]+", c.strip())[:2]
        return float(a), float(b)
    return float(c[0]), float(c[1])


def _as_list(x):
    if x is None:
        return []
    if isinstance(x, list):
        return x
    for key in ("frames", "value", "timeline", "items"):
        if isinstance(x, dict) and key in x:
            return x[key]
    return []


# ------------------------------------------------- layer 1: obstruction risk
def edge_risk(p):
    """Probability (0..1) that a road segment is obstructed, from its state."""
    if not p.get("is_passable", True) or not p.get("is_open", True):
        return 1.0
    status = str(p.get("status", "normal")).lower()
    if status in ("closed", "blocked", "impassable"):
        return 1.0
    p_flood = _clip(p.get("flood_depth_m", 0.0) / FLOOD_IMPASSABLE_M)
    p_cong = 0.5 * _clip(p.get("congestion_ratio", 0.0))
    floor = 0.0 if status == "normal" else 0.15
    return max(1 - (1 - p_flood) * (1 - p_cong), floor)


class Network:
    """Road graph + the scenario timeline (road state at each keyframe)."""

    def __init__(self, snapshot, timeline=None):
        self.nodes, self.edges, self.adj, self.static = {}, {}, {}, {}
        for f in snapshot["edges_geojson"]["features"]:
            p = f["properties"]
            coords = f["geometry"]["coordinates"]
            self.nodes[p["from_node"]] = _coord(coords[0])
            self.nodes[p["to_node"]] = _coord(coords[-1])
            self.static[p["id"]] = p
            self.edges[p["id"]] = {
                "from": p["from_node"], "to": p["to_node"],
                "capacity": p.get("capacity", 10**9),
                "stairs": bool(p.get("has_stairs", False)),
                "tt": p.get("travel_time_s", p.get("length_m", 0) * 0.12),
            }
            self.adj.setdefault(p["from_node"], []).append(p["id"])
        self.frames = {}
        for fr in _as_list(timeline):
            self._add_frame(fr)
        self._add_frame(snapshot)
        self.minutes = sorted(self.frames)

    def _add_frame(self, fr):
        minute = fr.get("minute", fr.get("current_minute", 0))
        if "edges_geojson" in fr:
            props = {f["properties"]["id"]: f["properties"]
                     for f in fr["edges_geojson"]["features"]}
        elif "edge_states" in fr:
            props = {eid: {**self.static.get(eid, {}), **st}
                     for eid, st in fr["edge_states"].items()}
        else:
            return
        self.frames[minute] = props
        self.minutes = sorted(self.frames)

    def nearest_node(self, lon, lat):
        return min(self.nodes, key=lambda n: (self.nodes[n][0] - lon) ** 2
                   + (self.nodes[n][1] - lat) ** 2)

    def state_at(self, eid, t_min):
        """(risk, travel_time_s) of a road at minute t, interpolated."""
        ms = self.minutes
        if t_min <= ms[0]:
            a = b = ms[0]
        elif t_min >= ms[-1]:
            a = b = ms[-1]
        else:
            a, b = next((x, y) for x, y in zip(ms, ms[1:]) if x <= t_min <= y)
        base = self.edges[eid]["tt"]
        pa, pb = self.frames[a].get(eid), self.frames[b].get(eid)
        if pa is None and pb is None:
            return 0.0, base
        pa, pb = pa or pb, pb or pa
        w = 0.0 if a == b else (t_min - a) / (b - a)
        ra, rb = edge_risk(pa), edge_risk(pb)
        ta, tb = pa.get("travel_time_s", base), pb.get("travel_time_s", base)
        return ra + (rb - ra) * w, ta + (tb - ta) * w