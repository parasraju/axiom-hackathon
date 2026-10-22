"""Comprehensive test suite for SafeRoute Emergency Evacuation Backend."""

from __future__ import annotations

import sys
from pathlib import Path
import pytest
from starlette.testclient import TestClient

# Ensure app is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.schemas import RoadNode, RoadEdge, MobilityProfile
from app.data.seed_data import get_seed_nodes, get_seed_edges, get_seed_shelters, get_seed_origins
from app.graph.road_network import RoadGraph, haversine_distance
from app.simulation.flood_model import FloodSimulator
from app.simulation.congestion import CongestionModel
from app.assignment.shelter_allocator import ShelterAllocator
from app.routing.router import SafeRouter
from app.reports.verifier import IncidentVerifier
from app.simulation.scenario_manager import ScenarioManager
from app.main import app


@pytest.fixture
def test_client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def initialized_graph() -> RoadGraph:
    graph = RoadGraph()
    graph.load_network(get_seed_nodes(), get_seed_edges())
    return graph


# 1. Road Network Graph Tests
def test_graph_initialization(initialized_graph: RoadGraph):
    assert len(initialized_graph.nodes_dict) == 12
    assert len(initialized_graph.edges_dict) >= 20
    assert initialized_graph.graph.number_of_nodes() == 12
    # Verify distance utility
    dist = haversine_distance(74.8710, 31.6420, 74.8740, 31.6410)
    assert 250.0 < dist < 400.0


def test_nearest_node_resolution(initialized_graph: RoadGraph):
    # Coords close to N01
    node = initialized_graph.find_nearest_node(74.8711, 31.6421)
    assert node == "N01"


# 2. Flood Simulation Tests
def test_flood_simulation_progression():
    sim = FloodSimulator()
    # At t=0, South Bridge is dry
    depth_0 = sim.get_flood_depth_for_edge("E15_BRIDGE_SOUTH_EW", [], 0)
    assert depth_0 == 0.0

    # At t=15, water rising (caution)
    depth_15 = sim.get_flood_depth_for_edge("E15_BRIDGE_SOUTH_EW", [], 15)
    assert 0.05 <= depth_15 <= 0.15

    # At t=30, bridge overtopped (> 0.18m threshold)
    depth_30 = sim.get_flood_depth_for_edge("E15_BRIDGE_SOUTH_EW", [], 30)
    assert depth_30 >= 0.25

    # Bridge North remains elevated and safe
    depth_north = sim.get_flood_depth_for_edge("E13_BRIDGE_NORTH_EW", [], 30)
    assert depth_north == 0.0

    # GeoJSON output exists
    geojson = sim.get_flood_geojson(30)
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 0


# 3. Dynamic Safe Routing Tests
def test_safe_routing_diversion_under_flood(initialized_graph: RoadGraph):
    router = SafeRouter(initialized_graph)

    # At t=0: Origin Central (N05) to Shelter South Stadium (N11)
    # Bridge South (N06->N10) is open and is the fastest path
    resp_0 = router.plan_route(origin_id="N05", destination_id="N11", departure_minute=0)
    assert resp_0.status == "route_found"
    assert resp_0.primary_route is not None
    assert "E15_BRIDGE_SOUTH_EW" in resp_0.primary_route.path_edges

    # At t=30: Bridge South is closed due to flood
    initialized_graph.update_edge_state("E15_BRIDGE_SOUTH_EW", flood_depth_m=0.30, status="closed", is_open=False)
    initialized_graph.update_edge_state("E16_BRIDGE_SOUTH_WE", flood_depth_m=0.30, status="closed", is_open=False)

    resp_30 = router.plan_route(origin_id="N05", destination_id="N11", departure_minute=30)
    assert resp_30.status == "route_found"
    assert resp_30.primary_route is not None
    # Must NOT use Bridge South! Must divert through Bridge North (E13)
    assert "E15_BRIDGE_SOUTH_EW" not in resp_30.primary_route.path_edges
    assert "E13_BRIDGE_NORTH_EW" in resp_30.primary_route.path_edges
    # Resilience score should be present and valid
    assert 10 <= resp_30.primary_route.resilience_score <= 100


def test_wheelchair_accessibility_constraint(initialized_graph: RoadGraph):
    router = SafeRouter(initialized_graph)

    # Route from N11 (South Sports Arena) to N12 (Hilltop Emergency Plateau)
    # Direct path is stone stairs (E25_N11_N12_STAIRS)

    # 1. Normal pedestrian can use the stairs
    resp_walk = router.plan_route(origin_id="N11", destination_id="N12", mode="walk")
    assert resp_walk.status == "route_found"
    assert "E25_N11_N12_STAIRS" in resp_walk.primary_route.path_edges

    # 2. Wheelchair mode MUST reject stairs and take ramp via N10->N08->N09->N12
    resp_wheelchair = router.plan_route(origin_id="N11", destination_id="N12", mode="wheelchair")
    assert resp_wheelchair.status == "route_found"
    assert "E25_N11_N12_STAIRS" not in resp_wheelchair.primary_route.path_edges
    assert "E23_N09_N12" in resp_wheelchair.primary_route.path_edges


# 4. Congestion Model Tests
def test_congestion_bpr_delay():
    model = CongestionModel()
    metrics_free = model.calculate_edge_metrics(baseline_travel_time_s=60.0, volume=50, capacity=400)
    assert metrics_free["travel_time_s"] == 60.0
    assert not metrics_free["is_congested"]

    metrics_heavy = model.calculate_edge_metrics(baseline_travel_time_s=60.0, volume=600, capacity=400)
    assert metrics_heavy["travel_time_s"] > 60.0
    assert metrics_heavy["is_overloaded"]


# 5. Shelter Allocation & Zero Overbooking Tests
def test_shelter_allocation_no_overbooking(initialized_graph: RoadGraph):
    allocator = ShelterAllocator(initialized_graph)
    origins = get_seed_origins()
    shelters = get_seed_shelters()

    resp, edge_flows = allocator.assign_evacuees(origins, shelters, minute=0, mode="walk")
    assert resp.total_assigned > 0

    # Verify zero overbooking across all shelters
    for alloc in resp.shelter_allocations:
        assert alloc.final_occupancy <= alloc.capacity
        assert alloc.remaining_capacity >= 0


# 6. Incident Reporting & Verification Tests
def test_incident_reporting_corroboration():
    verifier = IncidentVerifier()
    # 1. First report -> pending
    r1 = verifier.submit_report(edge_id="E05_N03_N04", kind="road_flooded", reported_minute=10)
    assert r1.status == "pending"
    assert r1.evidence_count == 1

    # 2. Second report on same edge within 15 min -> corroboration auto-verifies
    r2 = verifier.submit_report(edge_id="E05_N03_N04", kind="road_flooded", reported_minute=12)
    assert r2.id == r1.id  # deduplicated
    assert r2.evidence_count == 2
    assert r2.status == "verified"
    assert "E05_N03_N04" in verifier.get_verified_blocked_edges()


# 7. FastAPI API Integration Tests
def test_api_health(test_client: TestClient):
    response = test_client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_api_scenarios_and_timeline(test_client: TestClient):
    # List scenarios
    r1 = test_client.get("/api/scenarios")
    assert r1.status_code == 200
    assert len(r1.json()) >= 1

    # Get scenario details
    r2 = test_client.get("/api/scenarios/monsoon_demo")
    assert r2.status_code == 200
    assert r2.json()["id"] == "monsoon_demo"

    # Precomputed timeline snapshots (0, 15, 30, 45, 60, 75, 90)
    r3 = test_client.get("/api/scenarios/monsoon_demo/timeline")
    assert r3.status_code == 200
    timeline = r3.json()
    assert len(timeline) >= 7
    minutes = [snap["minute"] for snap in timeline]
    assert 0 in minutes
    assert 30 in minutes
    assert 60 in minutes
    assert 90 in minutes

    # Inspect snapshot at minute 30
    snap_30 = next(s for s in timeline if s["minute"] == 30)
    assert snap_30["edges_geojson"]["type"] == "FeatureCollection"
    assert snap_30["flood_geojson"]["type"] == "FeatureCollection"
    assert len(snap_30["shelters"]) == 4


def test_api_route_plan(test_client: TestClient):
    payload = {
        "scenario_id": "monsoon_demo",
        "origin_id": "N01",
        "destination_id": "N09",
        "departure_minute": 0,
        "mode": "walk",
        "alternatives": 2,
    }
    response = test_client.post("/api/routes/plan", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "route_found"
    assert data["primary_route"] is not None
    assert len(data["primary_route"]["path_nodes"]) >= 2
    assert data["primary_route"]["resilience_score"] > 0
    assert data["primary_route"]["geometry"]["type"] == "LineString"


def test_api_evacuation_assign(test_client: TestClient):
    payload = {
        "scenario_id": "monsoon_demo",
        "minute": 15,
        "mode": "walk",
    }
    response = test_client.post("/api/evacuation/assign", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total_evacuees"] > 0
    assert data["total_assigned"] > 0
    assert len(data["shelter_allocations"]) == 4


def test_api_closures_and_advance(test_client: TestClient):
    # Advance simulation
    r_adv = test_client.post("/api/scenarios/monsoon_demo/advance", json={"minute": 45})
    assert r_adv.status_code == 200
    assert r_adv.json()["minute"] == 45

    # Toggle road closure
    r_close = test_client.post(
        "/api/scenarios/monsoon_demo/closures",
        json={"edge_id": "E01_N01_N02", "is_open": False, "reason": "Fallen power line"},
    )
    assert r_close.status_code == 200

    # Reset
    r_reset = test_client.post("/api/scenarios/monsoon_demo/reset")
    assert r_reset.status_code == 200
    assert r_reset.json()["minute"] == 0
