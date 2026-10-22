"""Unit tests for SafeRouter routing engine."""

import pytest
import networkx as nx

from app.graph.road_network import RoadGraph
from app.models.schemas import RoadNode, RoadEdge, RouteResponse, RouteCandidate
from app.routing.router import SafeRouter, DictRouteResponse, DictRouteCandidate
from app.data.seed_data import get_seed_nodes, get_seed_edges


@pytest.fixture
def base_road_graph() -> RoadGraph:
    """Fixture with seed road graph."""
    rg = RoadGraph()
    rg.load_network(get_seed_nodes(), get_seed_edges())
    return rg


@pytest.fixture
def custom_toy_graph() -> nx.DiGraph:
    """A controlled toy directed graph with known edge properties.

    Topology:
      A ---> B ---> C
      |             ^
      +----> D -----+
    """
    g = nx.DiGraph()
    g.add_node("A", lon=74.870, lat=31.630)
    g.add_node("B", lon=74.872, lat=31.630)
    g.add_node("C", lon=74.874, lat=31.630)
    g.add_node("D", lon=74.872, lat=31.635)

    # Edge A->B (Path 1)
    g.add_edge(
        "A", "B",
        edge_id="E_AB",
        length_m=200.0,
        baseline_speed_kmh=25.0,
        travel_time_s=60.0,
        is_open=True,
        flood_depth_m=0.0,
        flood_threshold_m=0.20,
        has_stairs=False,
        modes=["walk", "wheelchair", "vehicle"],
        congestion_ratio=0.0,
        status="normal",
        geometry={"type": "LineString", "coordinates": [[74.870, 31.630], [74.872, 31.630]]},
    )

    # Edge B->C (Path 1)
    g.add_edge(
        "B", "C",
        edge_id="E_BC",
        length_m=200.0,
        baseline_speed_kmh=25.0,
        travel_time_s=60.0,
        is_open=True,
        flood_depth_m=0.0,
        flood_threshold_m=0.20,
        has_stairs=False,
        modes=["walk", "wheelchair", "vehicle"],
        congestion_ratio=0.0,
        status="normal",
        geometry={"type": "LineString", "coordinates": [[74.872, 31.630], [74.874, 31.630]]},
    )

    # Edge A->D (Path 2)
    g.add_edge(
        "A", "D",
        edge_id="E_AD",
        length_m=300.0,
        baseline_speed_kmh=25.0,
        travel_time_s=100.0,
        is_open=True,
        flood_depth_m=0.0,
        flood_threshold_m=0.20,
        has_stairs=False,
        modes=["walk", "wheelchair", "vehicle"],
        congestion_ratio=0.0,
        status="normal",
        geometry={"type": "LineString", "coordinates": [[74.870, 31.630], [74.872, 31.635]]},
    )

    # Edge D->C (Path 2)
    g.add_edge(
        "D", "C",
        edge_id="E_DC",
        length_m=300.0,
        baseline_speed_kmh=25.0,
        travel_time_s=100.0,
        is_open=True,
        flood_depth_m=0.0,
        flood_threshold_m=0.20,
        has_stairs=False,
        modes=["walk", "wheelchair", "vehicle"],
        congestion_ratio=0.0,
        status="normal",
        geometry={"type": "LineString", "coordinates": [[74.872, 31.635], [74.874, 31.630]]},
    )

    return g


# -----------------------------------------------------------------------------
# 1. Validation of Origin and Destination Existence
# -----------------------------------------------------------------------------

def test_origin_not_in_graph(custom_toy_graph: nx.DiGraph):
    router = SafeRouter()
    res = router.plan_route(custom_toy_graph, "NON_EXISTENT", "C")
    assert res["status"] == "no_route_found"
    assert res.status == "no_route_found"
    assert res["primary_route"] is None
    assert any("NON_EXISTENT" in w for w in res["warnings"])
    assert res["data_freshness"]["evaluated_minute"] == 0
    assert res["data_freshness"]["is_simulated"] is True


def test_destination_not_in_graph(custom_toy_graph: nx.DiGraph):
    router = SafeRouter(custom_toy_graph)
    res = router.plan_route("A", "MISSING_DEST")
    assert res["status"] == "no_route_found"
    assert res.primary_route is None
    assert any("MISSING_DEST" in w for w in res["warnings"])


# -----------------------------------------------------------------------------
# 2. Hard Constraints Tests
# -----------------------------------------------------------------------------

def test_hard_constraint_is_open(custom_toy_graph: nx.DiGraph):
    """An edge with is_open == False is impassable."""
    router = SafeRouter()

    # Baseline: A->B->C is faster (120s vs 200s)
    res_base = router.plan_route(custom_toy_graph, "A", "C")
    assert res_base["primary_route"]["path_nodes"] == ["A", "B", "C"]

    # Close A->B
    custom_toy_graph["A"]["B"]["is_open"] = False
    res_closed = router.plan_route(custom_toy_graph, "A", "C")
    assert res_closed["status"] == "route_found"
    assert res_closed["primary_route"]["path_nodes"] == ["A", "D", "C"]


def test_hard_constraint_flood_depth_exceeds_threshold(custom_toy_graph: nx.DiGraph):
    """An edge with flood_depth_m > flood_threshold_m is impassable."""
    router = SafeRouter()

    # Set flood depth 0.25m on E_AB, threshold is 0.20m
    custom_toy_graph["A"]["B"]["flood_depth_m"] = 0.25
    custom_toy_graph["A"]["B"]["flood_threshold_m"] = 0.20

    res = router.plan_route(custom_toy_graph, "A", "C")
    assert res["status"] == "route_found"
    # Must divert via D
    assert res["primary_route"]["path_nodes"] == ["A", "D", "C"]


def test_hard_constraint_wheelchair_has_stairs(custom_toy_graph: nx.DiGraph):
    """If mode == 'wheelchair' and has_stairs == True, edge is impassable."""
    router = SafeRouter()
    custom_toy_graph["A"]["B"]["has_stairs"] = True

    # Mode walk can use stairs
    res_walk = router.plan_route(custom_toy_graph, "A", "C", mode="walk")
    assert res_walk["primary_route"]["path_nodes"] == ["A", "B", "C"]

    # Mode wheelchair cannot use stairs -> diverts through A->D->C
    res_wheelchair = router.plan_route(custom_toy_graph, "A", "C", mode="wheelchair")
    assert res_wheelchair["primary_route"]["path_nodes"] == ["A", "D", "C"]


def test_hard_constraint_mode_not_in_modes(custom_toy_graph: nx.DiGraph):
    """If mode not in edge.modes, edge is impassable."""
    router = SafeRouter()
    # E_AB only allows vehicle
    custom_toy_graph["A"]["B"]["modes"] = ["vehicle"]

    # Walk must divert via D
    res_walk = router.plan_route(custom_toy_graph, "A", "C", mode="walk")
    assert res_walk["primary_route"]["path_nodes"] == ["A", "D", "C"]

    # Vehicle can take A->B->C
    res_vehicle = router.plan_route(custom_toy_graph, "A", "C", mode="vehicle")
    assert res_vehicle["primary_route"]["path_nodes"] == ["A", "B", "C"]


# -----------------------------------------------------------------------------
# 3. Dynamic Cost Formula Tests
# -----------------------------------------------------------------------------

def test_dynamic_cost_formula_caution_penalty(custom_toy_graph: nx.DiGraph):
    """cost = travel_time_s * (1.0 + congestion_ratio * 1.5) + (300.0 if status == 'caution' else 0.0).

    Base times:
      A->B->C = 60 + 60 = 120s
      A->D->C = 100 + 100 = 200s
    If E_AB status is 'caution':
      cost(A->B) = 60 * 1.0 + 300 = 360s
      total cost A->B->C = 360 + 60 = 420s > 200s
      Therefore, A->D->C becomes the preferred primary route!
    """
    router = SafeRouter()
    custom_toy_graph["A"]["B"]["status"] = "caution"

    res = router.plan_route(custom_toy_graph, "A", "C")
    assert res["status"] == "route_found"
    assert res["primary_route"]["path_nodes"] == ["A", "D", "C"]


def test_dynamic_cost_formula_congestion_multiplier(custom_toy_graph: nx.DiGraph):
    """Higher congestion increases cost: base_time * (1.0 + congestion * 1.5).

    If E_AB has congestion_ratio = 1.0:
      cost(A->B) = 60 * (1.0 + 1.5) = 150s
      total A->B->C = 150 + 60 = 210s > 200s (A->D->C)
      Therefore, A->D->C becomes preferred.
    """
    router = SafeRouter()
    custom_toy_graph["A"]["B"]["congestion_ratio"] = 1.0

    res = router.plan_route(custom_toy_graph, "A", "C")
    assert res["status"] == "route_found"
    assert res["primary_route"]["path_nodes"] == ["A", "D", "C"]


# -----------------------------------------------------------------------------
# 4. Resilience Score Calculation Tests
# -----------------------------------------------------------------------------

def test_resilience_score_caution_and_congestion_deductions(custom_toy_graph: nx.DiGraph):
    """Resilience starts at 100:
    - 15 points per segment under caution
    - 10 points per segment with congestion_ratio > 0.8
    - 20 points if within 200m of active flood zone
    """
    router = SafeRouter()
    # E_AB under caution (-15)
    custom_toy_graph["A"]["B"]["status"] = "caution"
    # E_BC congested (-10)
    custom_toy_graph["B"]["C"]["congestion_ratio"] = 0.85

    # Make A->D blocked so A->B->C must be chosen
    custom_toy_graph["A"]["D"]["is_open"] = False

    res = router.plan_route(custom_toy_graph, "A", "C", departure_minute=0)
    assert res["status"] == "route_found"
    candidate = res["primary_route"]
    # 100 - 15 (caution) - 10 (congestion) = 75
    assert candidate["resilience_score"] == 75
    assert any("caution" in w for w in candidate["warnings"])
    assert any("congestion" in w for w in candidate["warnings"])


def test_resilience_score_bounds_between_5_and_100(custom_toy_graph: nx.DiGraph):
    """Resilience score is strictly bounded between 5 and 100."""
    router = SafeRouter()

    # Clean path -> exactly 100
    res_clean = router.plan_route(custom_toy_graph, "A", "C", departure_minute=0)
    assert res_clean["primary_route"]["resilience_score"] == 100

    # Heavily penalized path
    custom_toy_graph["A"]["B"]["status"] = "caution"
    custom_toy_graph["A"]["B"]["congestion_ratio"] = 0.95
    custom_toy_graph["B"]["C"]["status"] = "caution"
    custom_toy_graph["B"]["C"]["congestion_ratio"] = 0.95
    custom_toy_graph["A"]["D"]["is_open"] = False

    # Also make an active flood zone edge nearby
    custom_toy_graph["A"]["B"]["flood_depth_m"] = 0.15  # caution depth, < 0.20 threshold

    res_penalized = router.plan_route(custom_toy_graph, "A", "C", departure_minute=30)
    # 100 - 15*2 - 10*2 - 20 = 30; if we add more penalties, minimum should never drop below 5
    score = res_penalized["primary_route"]["resilience_score"]
    assert 5 <= score <= 100


def test_resilience_score_clamping_to_minimum_5():
    """Build a multi-segment path where deductions exceed 100 points, verifying floor of 5."""
    g = nx.DiGraph()
    nodes = [f"N{i}" for i in range(10)]
    for i, n in enumerate(nodes):
        g.add_node(n, lon=74.870 + i * 0.001, lat=31.630)

    for i in range(len(nodes) - 1):
        g.add_edge(
            nodes[i], nodes[i+1],
            edge_id=f"E{i}",
            length_m=50.0,
            travel_time_s=30.0,
            status="caution",  # -15 per segment
            congestion_ratio=0.9,  # -10 per segment
            is_open=True,
            flood_threshold_m=0.30,
            flood_depth_m=0.10,
        )

    router = SafeRouter()
    res = router.plan_route(g, "N0", "N9", departure_minute=30)
    assert res["status"] == "route_found"
    # Deductions: 9 segments * 25 + 20 flood = 245 points -> clamped to 5
    assert res["primary_route"]["resilience_score"] == 5


# -----------------------------------------------------------------------------
# 5. Alternative Paths Generation
# -----------------------------------------------------------------------------

def test_alternative_paths_generation(custom_toy_graph: nx.DiGraph):
    """Router produces distinct alternate routes when feasible paths exist."""
    router = SafeRouter()
    res = router.plan_route(custom_toy_graph, "A", "C", alternatives=2)

    assert res["status"] == "route_found"
    assert res["primary_route"] is not None
    assert len(res["alternatives"]) >= 1

    primary_nodes = res["primary_route"]["path_nodes"]
    alt_nodes = res["alternatives"][0]["path_nodes"]

    assert primary_nodes == ["A", "B", "C"]
    assert alt_nodes == ["A", "D", "C"]
    assert primary_nodes != alt_nodes


def test_zero_alternatives_requested(custom_toy_graph: nx.DiGraph):
    router = SafeRouter()
    res = router.plan_route(custom_toy_graph, "A", "C", alternatives=0)
    assert res["status"] == "route_found"
    assert len(res["alternatives"]) == 0


# -----------------------------------------------------------------------------
# 6. Disconnected Graph and Blocked Paths
# -----------------------------------------------------------------------------

def test_disconnected_graph_handling(custom_toy_graph: nx.DiGraph):
    """When all paths are blocked, status is no_route_found with expected warning."""
    router = SafeRouter()
    custom_toy_graph["A"]["B"]["is_open"] = False
    custom_toy_graph["A"]["D"]["is_open"] = False

    res = router.plan_route(custom_toy_graph, "A", "C")
    assert res["status"] == "no_route_found"
    assert res["primary_route"] is None
    assert res["alternatives"] == []
    assert res["warnings"] == ["All feasible paths blocked by flood/closure"]


# -----------------------------------------------------------------------------
# 7. Invocation Pattern Flexibility & Output Schema
# -----------------------------------------------------------------------------

def test_invocation_patterns(custom_toy_graph: nx.DiGraph):
    # Pattern 1: plan_route(graph, origin_id, destination_id)
    r1 = SafeRouter()
    res1 = r1.plan_route(custom_toy_graph, "A", "C")
    assert res1.status == "route_found"

    # Pattern 2: plan_route(origin_id, destination_id) on router initialized with graph
    r2 = SafeRouter(custom_toy_graph)
    res2 = r2.plan_route("A", "C")
    assert res2["status"] == "route_found"

    # Pattern 3: keyword args
    res3 = r2.plan_route(origin_id="A", destination_id="C", mode="walk", departure_minute=15)
    assert res3.status == "route_found"

    # Pattern 4: as_dict=True
    res_dict = r2.plan_route("A", "C", as_dict=True)
    assert isinstance(res_dict, dict)
    assert res_dict["status"] == "route_found"
    assert isinstance(res_dict["primary_route"], dict)
    assert "geometry" in res_dict["primary_route"]
    assert res_dict["primary_route"]["geometry"]["type"] == "LineString"


def test_geojson_linestring_geometry(custom_toy_graph: nx.DiGraph):
    """Primary route contains valid GeoJSON LineString geometry."""
    router = SafeRouter()
    res = router.plan_route(custom_toy_graph, "A", "C")
    geom = res["primary_route"]["geometry"]
    assert geom["type"] == "LineString"
    assert len(geom["coordinates"]) >= 2
    # Verify coordinates format [lon, lat]
    for pt in geom["coordinates"]:
        assert len(pt) == 2
        assert isinstance(pt[0], float)
        assert isinstance(pt[1], float)


# -----------------------------------------------------------------------------
# 8. Real Seed Network Test
# -----------------------------------------------------------------------------

def test_real_seed_network_flood_diversion(base_road_graph: RoadGraph):
    """End-to-end test on the realistic Riverdale road network."""
    router = SafeRouter(base_road_graph)

    # Minute 0: Bridge South (E15) is open and optimal for Central -> South
    res_0 = router.plan_route(origin_id="N05", destination_id="N11", departure_minute=0)
    assert res_0.status == "route_found"
    assert "E15_BRIDGE_SOUTH_EW" in res_0.primary_route.path_edges

    # Minute 30: Bridge South closed by flood
    base_road_graph.update_edge_state("E15_BRIDGE_SOUTH_EW", is_open=False, flood_depth_m=0.30, status="closed")
    base_road_graph.update_edge_state("E16_BRIDGE_SOUTH_WE", is_open=False, flood_depth_m=0.30, status="closed")

    res_30 = router.plan_route(origin_id="N05", destination_id="N11", departure_minute=30)
    assert res_30.status == "route_found"
    assert "E15_BRIDGE_SOUTH_EW" not in res_30.primary_route.path_edges
    assert "E13_BRIDGE_NORTH_EW" in res_30.primary_route.path_edges
    assert 5 <= res_30.primary_route.resilience_score <= 100
