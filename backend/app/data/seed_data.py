"""Seed dataset for SafeRoute demo: Riverdale City Evacuation Network."""

from __future__ import annotations

from typing import Any, Dict, List
from app.models.schemas import RoadNode, RoadEdge, Shelter, OriginZone, ScenarioEvent


# Geographic coordinates for 12 intersections in Riverdale
# Longitude ~ 74.87, Latitude ~ 31.63
# River flows vertically around lon = 74.875
# East bank: N01, N02, N03, N04 (Bridge N), N05, N06 (Bridge S), N07
# West bank: N08 (Bridge N), N09, N10 (Bridge S), N11, N12 (Hill Station)

SEED_NODES: List[RoadNode] = [
    RoadNode(id="N01", lon=74.8710, lat=31.6420, name="North Residential Gate", kind="intersection"),
    RoadNode(id="N02", lon=74.8740, lat=31.6410, name="East Community Center Junction", kind="intersection"),
    RoadNode(id="N03", lon=74.8720, lat=31.6370, name="East Commercial Square", kind="intersection"),
    RoadNode(id="N04", lon=74.8745, lat=31.6380, name="Bridge North (East Bank)", kind="bridge_access"),
    RoadNode(id="N05", lon=74.8715, lat=31.6330, name="Downtown Central Station", kind="intersection"),
    RoadNode(id="N06", lon=74.8740, lat=31.6320, name="Bridge South (East Bank)", kind="bridge_access"),
    RoadNode(id="N07", lon=74.8730, lat=31.6280, name="River South Promenade", kind="intersection"),
    RoadNode(id="N08", lon=74.8775, lat=31.6385, name="Bridge North (West Bank)", kind="bridge_access"),
    RoadNode(id="N09", lon=74.8810, lat=31.6400, name="West High School Access", kind="intersection"),
    RoadNode(id="N10", lon=74.8770, lat=31.6325, name="Bridge South (West Bank)", kind="bridge_access"),
    RoadNode(id="N11", lon=74.8820, lat=31.6310, name="South Sports Arena Boulevard", kind="intersection"),
    RoadNode(id="N12", lon=74.8850, lat=31.6360, name="Hilltop Emergency Plateau", kind="elevation_point"),
]


def _make_line(coords: List[List[float]]) -> Dict[str, Any]:
    return {"type": "LineString", "coordinates": coords}


SEED_EDGES: List[RoadEdge] = [
    # East Bank Roads
    RoadEdge(
        id="E01_N01_N02",
        from_node="N01",
        to_node="N02",
        length_m=320.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.25,
        geometry=_make_line([[74.8710, 31.6420], [74.8740, 31.6410]]),
    ),
    RoadEdge(
        id="E02_N02_N01",
        from_node="N02",
        to_node="N01",
        length_m=320.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.25,
        geometry=_make_line([[74.8740, 31.6410], [74.8710, 31.6420]]),
    ),
    RoadEdge(
        id="E03_N01_N03",
        from_node="N01",
        to_node="N03",
        length_m=560.0,
        baseline_speed_kmh=35.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8710, 31.6420], [74.8720, 31.6370]]),
    ),
    RoadEdge(
        id="E04_N03_N01",
        from_node="N03",
        to_node="N01",
        length_m=560.0,
        baseline_speed_kmh=35.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8720, 31.6370], [74.8710, 31.6420]]),
    ),
    RoadEdge(
        id="E05_N03_N04",
        from_node="N03",
        to_node="N04",
        length_m=280.0,
        baseline_speed_kmh=25.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8720, 31.6370], [74.8745, 31.6380]]),
    ),
    RoadEdge(
        id="E06_N04_N03",
        from_node="N04",
        to_node="N03",
        length_m=280.0,
        baseline_speed_kmh=25.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8745, 31.6380], [74.8720, 31.6370]]),
    ),
    RoadEdge(
        id="E07_N03_N05",
        from_node="N03",
        to_node="N05",
        length_m=450.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8720, 31.6370], [74.8715, 31.6330]]),
    ),
    RoadEdge(
        id="E08_N05_N03",
        from_node="N05",
        to_node="N03",
        length_m=450.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8715, 31.6330], [74.8720, 31.6370]]),
    ),
    RoadEdge(
        id="E09_N05_N06",
        from_node="N05",
        to_node="N06",
        length_m=260.0,
        baseline_speed_kmh=25.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.18,
        geometry=_make_line([[74.8715, 31.6330], [74.8740, 31.6320]]),
    ),
    RoadEdge(
        id="E10_N06_N05",
        from_node="N06",
        to_node="N05",
        length_m=260.0,
        baseline_speed_kmh=25.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.18,
        geometry=_make_line([[74.8740, 31.6320], [74.8715, 31.6330]]),
    ),
    RoadEdge(
        id="E11_N05_N07",
        from_node="N05",
        to_node="N07",
        length_m=580.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.12,  # Low lying river road
        geometry=_make_line([[74.8715, 31.6330], [74.8730, 31.6280]]),
    ),
    RoadEdge(
        id="E12_N07_N05",
        from_node="N07",
        to_node="N05",
        length_m=580.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.12,
        geometry=_make_line([[74.8730, 31.6280], [74.8715, 31.6330]]),
    ),
    # RIVER CROSSINGS
    # 1. Bridge North (High elevation, safe in early flood)
    RoadEdge(
        id="E13_BRIDGE_NORTH_EW",
        from_node="N04",
        to_node="N08",
        length_m=310.0,
        baseline_speed_kmh=40.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.35,  # High elevation bridge
        geometry=_make_line([[74.8745, 31.6380], [74.8775, 31.6385]]),
    ),
    RoadEdge(
        id="E14_BRIDGE_NORTH_WE",
        from_node="N08",
        to_node="N04",
        length_m=310.0,
        baseline_speed_kmh=40.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.35,
        geometry=_make_line([[74.8775, 31.6385], [74.8745, 31.6380]]),
    ),
    # 2. Bridge South (Low underpass bridge, floods rapidly)
    RoadEdge(
        id="E15_BRIDGE_SOUTH_EW",
        from_node="N06",
        to_node="N10",
        length_m=300.0,
        baseline_speed_kmh=35.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.18,  # Underpass, low threshold
        geometry=_make_line([[74.8740, 31.6320], [74.8770, 31.6325]]),
    ),
    RoadEdge(
        id="E16_BRIDGE_SOUTH_WE",
        from_node="N10",
        to_node="N06",
        length_m=300.0,
        baseline_speed_kmh=35.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.18,
        geometry=_make_line([[74.8770, 31.6325], [74.8740, 31.6320]]),
    ),
    # West Bank Roads
    RoadEdge(
        id="E17_N08_N09",
        from_node="N08",
        to_node="N09",
        length_m=360.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.25,
        geometry=_make_line([[74.8775, 31.6385], [74.8810, 31.6400]]),
    ),
    RoadEdge(
        id="E18_N09_N08",
        from_node="N09",
        to_node="N08",
        length_m=360.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.25,
        geometry=_make_line([[74.8810, 31.6400], [74.8775, 31.6385]]),
    ),
    RoadEdge(
        id="E19_N08_N10",
        from_node="N08",
        to_node="N10",
        length_m=670.0,
        baseline_speed_kmh=40.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.22,
        geometry=_make_line([[74.8775, 31.6385], [74.8770, 31.6325]]),
    ),
    RoadEdge(
        id="E20_N10_N08",
        from_node="N10",
        to_node="N08",
        length_m=670.0,
        baseline_speed_kmh=40.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.22,
        geometry=_make_line([[74.8770, 31.6325], [74.8775, 31.6385]]),
    ),
    RoadEdge(
        id="E21_N10_N11",
        from_node="N10",
        to_node="N11",
        length_m=510.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8770, 31.6325], [74.8820, 31.6310]]),
    ),
    RoadEdge(
        id="E22_N11_N10",
        from_node="N11",
        to_node="N10",
        length_m=510.0,
        baseline_speed_kmh=30.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.20,
        geometry=_make_line([[74.8820, 31.6310], [74.8770, 31.6325]]),
    ),
    RoadEdge(
        id="E23_N09_N12",
        from_node="N09",
        to_node="N12",
        length_m=580.0,
        baseline_speed_kmh=20.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.40,
        has_stairs=False,
        geometry=_make_line([[74.8810, 31.6400], [74.8850, 31.6360]]),
    ),
    RoadEdge(
        id="E24_N12_N09",
        from_node="N12",
        to_node="N09",
        length_m=580.0,
        baseline_speed_kmh=20.0,
        modes=["walk", "wheelchair", "vehicle"],
        flood_threshold_m=0.40,
        has_stairs=False,
        geometry=_make_line([[74.8850, 31.6360], [74.8810, 31.6400]]),
    ),
    # Steep stone stair path from South Arena to Hilltop (walk only, no wheelchair)
    RoadEdge(
        id="E25_N11_N12_STAIRS",
        from_node="N11",
        to_node="N12",
        length_m=420.0,
        baseline_speed_kmh=12.0,
        modes=["walk"],
        flood_threshold_m=0.50,
        has_stairs=True,  # Inaccessible for wheelchairs!
        geometry=_make_line([[74.8820, 31.6310], [74.8850, 31.6360]]),
    ),
    RoadEdge(
        id="E26_N12_N11_STAIRS",
        from_node="N12",
        to_node="N11",
        length_m=420.0,
        baseline_speed_kmh=12.0,
        modes=["walk"],
        flood_threshold_m=0.50,
        has_stairs=True,
        geometry=_make_line([[74.8850, 31.6360], [74.8820, 31.6310]]),
    ),
]


SEED_SHELTERS: List[Shelter] = [
    Shelter(
        id="shelter_west_high",
        name="Riverdale West High School",
        lon=74.8810,
        lat=31.6400,
        capacity=450,
        occupancy=0,
        accessible=True,
        services=["first_aid", "water", "food", "generator"],
        status="open",
    ),
    Shelter(
        id="shelter_south_stadium",
        name="South Sports Complex & Arena",
        lon=74.8820,
        lat=31.6310,
        capacity=500,
        occupancy=0,
        accessible=True,
        services=["emergency_cots", "water", "blankets"],
        status="open",
    ),
    Shelter(
        id="shelter_hill_station",
        name="Hilltop Observation Center",
        lon=74.8850,
        lat=31.6360,
        capacity=250,
        occupancy=0,
        accessible=False,  # High elevation steps
        services=["satellite_radio", "emergency_shelter"],
        status="open",
    ),
    Shelter(
        id="shelter_east_center",
        name="East Community Relief Center",
        lon=74.8740,
        lat=31.6410,
        capacity=200,
        occupancy=0,
        accessible=True,
        services=["food", "water", "first_aid"],
        status="open",
    ),
]


SEED_ORIGINS: List[OriginZone] = [
    OriginZone(
        id="origin_north",
        name="North Residential Colony",
        lon=74.8710,
        lat=31.6420,
        node_id="N01",
        population=400,
    ),
    OriginZone(
        id="origin_east",
        name="East Commercial District",
        lon=74.8720,
        lat=31.6370,
        node_id="N03",
        population=350,
    ),
    OriginZone(
        id="origin_central",
        name="Downtown Central Sector",
        lon=74.8715,
        lat=31.6330,
        node_id="N05",
        population=500,
    ),
]


SEED_EVENTS: List[ScenarioEvent] = [
    ScenarioEvent(minute=15, event_type="flood_expand", target_id="zone_river_south", value=0.08),
    ScenarioEvent(minute=30, event_type="flood_expand", target_id="E15_BRIDGE_SOUTH_EW", value=0.28),
    ScenarioEvent(minute=30, event_type="road_close", target_id="E15_BRIDGE_SOUTH_EW", value=True),
    ScenarioEvent(minute=30, event_type="road_close", target_id="E16_BRIDGE_SOUTH_WE", value=True),
    ScenarioEvent(minute=45, event_type="demand_increase", target_id="origin_central", value=150),
    ScenarioEvent(minute=60, event_type="shelter_fill", target_id="shelter_east_center", value=200),
]


def get_seed_nodes() -> List[RoadNode]:
    return [node.model_copy() for node in SEED_NODES]


def get_seed_edges() -> List[RoadEdge]:
    return [edge.model_copy() for edge in SEED_EDGES]


def get_seed_shelters() -> List[Shelter]:
    return [shelter.model_copy() for shelter in SEED_SHELTERS]


def get_seed_origins() -> List[OriginZone]:
    return [origin.model_copy() for origin in SEED_ORIGINS]


def get_seed_scenario_events() -> List[ScenarioEvent]:
    return [event.model_copy() for event in SEED_EVENTS]
