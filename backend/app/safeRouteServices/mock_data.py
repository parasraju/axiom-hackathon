"""Offline sample data shaped like your backend's /snapshot and /timeline.
Network, origins and shelters follow the monsoon_demo snapshot you pasted.
The hazards in the timeline are INVENTED for testing - your real timeline
replaces them when you run against the live API."""
import copy

NODES = {
    "N01": (74.871, 31.642), "N02": (74.874, 31.641), "N03": (74.872, 31.637),
    "N04": (74.8745, 31.638), "N05": (74.8715, 31.633), "N06": (74.874, 31.632),
    "N07": (74.873, 31.628), "N08": (74.8775, 31.6385), "N09": (74.881, 31.64),
    "N10": (74.877, 31.6325), "N11": (74.882, 31.631), "N12": (74.885, 31.636),
}

# (edge id forward, edge id backward, node a, node b, length_m, travel_s, stairs)
ROADS = [
    ("E01_N01_N02", "E02_N02_N01", "N01", "N02", 320, 38.4, False),
    ("E03_N01_N03", "E04_N03_N01", "N01", "N03", 560, 57.6, False),
    ("E05_N03_N04", "E06_N04_N03", "N03", "N04", 336, 40.3, False),
    ("E07_N03_N05", "E08_N05_N03", "N03", "N05", 450, 54.0, False),
    ("E09_N05_N06", "E10_N06_N05", "N05", "N06", 260, 37.4, False),
    ("E11_N05_N07", "E12_N07_N05", "N05", "N07", 580, 69.6, False),
    ("E13_BRIDGE_NORTH_EW", "E14_BRIDGE_NORTH_WE", "N04", "N08", 310, 27.9, False),
    ("E15_BRIDGE_SOUTH_EW", "E16_BRIDGE_SOUTH_WE", "N06", "N10", 300, 30.9, False),
    ("E17_N08_N09", "E18_N09_N08", "N08", "N09", 360, 43.2, False),
    ("E19_N08_N10", "E20_N10_N08", "N08", "N10", 670, 60.3, False),
    ("E21_N10_N11", "E22_N11_N10", "N10", "N11", 510, 61.2, False),
    ("E23_N09_N12", "E24_N12_N09", "N09", "N12", 580, 104.4, False),
    ("E25_N11_N12_STAIRS", "E26_N12_N11_STAIRS", "N11", "N12", 420, 126.0, True),
]

# invented hazards: edge ids -> {minute: (flood_depth_m, congestion_ratio)}
HAZARDS = {
    "E13_BRIDGE_NORTH_EW": {30: (0.2, 0.0), 45: (0.6, 0.0), 60: (0.6, 0.0)},
    "E14_BRIDGE_NORTH_WE": {30: (0.2, 0.0), 45: (0.6, 0.0), 60: (0.6, 0.0)},
    "E15_BRIDGE_SOUTH_EW": {15: (0.0, 0.2), 30: (0.0, 0.6), 45: (0.0, 0.9)},
    "E16_BRIDGE_SOUTH_WE": {15: (0.0, 0.2), 30: (0.0, 0.6), 45: (0.0, 0.9)},
    "E19_N08_N10": {60: (0.55, 0.0), 75: (0.55, 0.0), 90: (0.55, 0.0)},
    "E20_N10_N08": {60: (0.55, 0.0), 75: (0.55, 0.0), 90: (0.55, 0.0)},
}


def _hazard(eid, minute):
    h = HAZARDS.get(eid)
    if not h:
        return 0.0, 0.0
    past = [m for m in h if m <= minute]
    return h[max(past)] if past else (0.0, 0.0)


def _frame(minute):
    feats = []
    for fwd, bwd, a, b, length, tt, stairs in ROADS:
        for eid, u, v in ((fwd, a, b), (bwd, b, a)):
            flood, cong = _hazard(eid, minute)
            status = "normal" if (flood == 0 and cong == 0) else ("flooded" if flood else "congested")
            feats.append({
                "type": "Feature", "id": eid,
                "geometry": {"type": "LineString",
                             "coordinates": [list(NODES[u]), list(NODES[v])]},
                "properties": {
                    "id": eid, "from_node": u, "to_node": v, "length_m": length,
                    "status": status, "flood_depth_m": flood, "congestion_ratio": cong,
                    "travel_time_s": tt * (1 + cong), "is_passable": flood < 0.5,
                    "is_open": True, "has_stairs": stairs, "capacity": 400,
                    "entity_type": "edge"},
            })
    return {"scenario_id": "monsoon_demo", "minute": minute,
            "edges_geojson": {"type": "FeatureCollection", "features": feats}}


def make_mock():
    snapshot = _frame(0)
    snapshot["origins"] = [
        {"id": "origin_north", "name": "North Residential Colony", "lon": 74.871, "lat": 31.642, "population": 400, "node_id": "N01"},
        {"id": "origin_east", "name": "East Commercial District", "lon": 74.872, "lat": 31.637, "population": 350, "node_id": "N03"},
        {"id": "origin_central", "name": "Downtown Central Sector", "lon": 74.8715, "lat": 31.633, "population": 500, "node_id": "N05"},
    ]
    snapshot["shelters"] = [
        {"id": "shelter_west_high", "name": "Riverdale West High School", "lon": 74.881, "lat": 31.64, "capacity": 450, "occupancy": 450, "accessible": True},
        {"id": "shelter_south_stadium", "name": "South Sports Complex & Arena", "lon": 74.882, "lat": 31.631, "capacity": 500, "occupancy": 300, "accessible": True},
        {"id": "shelter_hill_station", "name": "Hilltop Observation Center", "lon": 74.885, "lat": 31.636, "capacity": 300, "occupancy": 300, "accessible": False},
        {"id": "shelter_east_center", "name": "East Community Relief Center", "lon": 74.874, "lat": 31.641, "capacity": 200, "occupancy": 200, "accessible": True},
    ]
    timeline = [_frame(m) for m in range(0, 91, 15)]
    return copy.deepcopy(snapshot), timeline