"""Comprehensive unit and API integration tests for SafeRoute backend.

Covers:
- Road network topology, connectivity, distance calculations
- Flood model propagation across time-steps [0, 15, 30, 60]
- Dynamic safe routing: t=0 shortest path, t=30 flood diversion via Bridge North,
  wheelchair stair avoidance, resilience score bounded [5, 100]
- Congestion BPR monotonic delay scaling
- Shelter allocation with zero-overbooking guarantee and secondary reassignment
- Crowdsourced incident report deduplication, corroboration, and operator moderation
- API REST endpoints via FastAPI TestClient
"""

from __future__ import annotations

import copy
import networkx as nx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.graph.road_network import RoadGraph, haversine_distance
from app.data.seed_data import (
    get_seed_nodes,
    get_seed_edges,
    get_seed_shelters,
    get_seed_origins,
)
from app.simulation.flood_model import FloodSimulator
from app.simulation.congestion import CongestionModel
from app.assignment.shelter_allocator import ShelterAllocator
from app.reports.verifier import IncidentVerifier
from app.routing.router import SafeRouter
from app.models.schemas import OriginZone, Shelter, MobilityProfile


# ============================================================================
# Unit Tests
# ============================================================================

def test_road_network():
    """Verify nodes, edges, graph connectivity, distance, and nearest-node query."""
    graph = RoadGraph()
    nodes = get_seed_nodes()
    edges = get_seed_edges()

    graph.load_network(nodes, edges)

    # 1. Node and edge counts
    assert len(graph.nodes_dict) == 12, "Should have 12 seed intersections"
    assert len(graph.edges_dict) >= 26, "Should have all directed seed edges loaded"

    # 2. Graph connectivity across the river
    # N01 (North East Bank) to N11 (South West Bank)
    assert nx.has_path(graph.graph, "N01", "N11"), "Network should connect East and West banks"
    assert nx.has_path(graph.graph, "N05", "N12"), "Downtown should connect to Hilltop"

    # 3. Haversine distance calculations
    # N01: (74.8710, 31.6420), N02: (74.8740, 31.6410)
    dist = haversine_distance(74.8710, 31.6420, 74.8740, 31.6410)
    assert 250.0 < dist < 360.0, f"Expected ~300m distance, got {dist:.1f}m"

    # 4. Nearest node lookup
    nearest = graph.find_nearest_node(74.8711, 31.6419)
    assert nearest == "N01", f"Expected nearest node N01, got {nearest}"

    # 5. Traversable subgraph generation
    subgraph_walk = graph.get_traversable_subgraph(mode="walk")
    assert subgraph_walk.number_of_nodes() == 12
    assert subgraph_walk.number_of_edges() > 0

    # 6. GeoJSON export validation
    geojson = graph.to_geojson()
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 0


def test_flood_model():
    """Verify flood depths and edge status transitions across minutes [0, 15, 30, 60]."""
    sim = FloodSimulator()
    seed_edges = get_seed_edges()
    edge_dicts = [e.model_dump() for e in seed_edges]

    # --- Minute 0: Initial dry baseline ---
    states_0 = sim.simulate_step(0, edge_dicts)
    depths_0 = sim.calculate_edge_flood_depths(0, edge_dicts)
    for edge_id, depth in depths_0.items():
        assert depth == 0.0, f"Edge {edge_id} should have zero depth at t=0"
    assert states_0["E15_BRIDGE_SOUTH_EW"]["status"] == "normal"
    assert states_0["E15_BRIDGE_SOUTH_EW"]["is_passable"] is True

    # --- Minute 15: Rising river, minor flooding / caution ---
    states_15 = sim.simulate_step(15, edge_dicts)
    depth_15_south = states_15["E15_BRIDGE_SOUTH_EW"]["flood_depth_m"]
    assert depth_15_south > 0.0, "Bridge South should have water accumulation at t=15"
    assert depth_15_south < 0.18, "Bridge South should not exceed threshold at t=15"
    assert states_15["E15_BRIDGE_SOUTH_EW"]["status"] == "caution"
    assert states_15["E15_BRIDGE_SOUTH_EW"]["is_passable"] is True

    # --- Minute 30: Bridge South overtops threshold and closes ---
    states_30 = sim.simulate_step(30, edge_dicts)
    depth_30_south = states_30["E15_BRIDGE_SOUTH_EW"]["flood_depth_m"]
    assert depth_30_south >= 0.18, "Bridge South should exceed 0.18m threshold at t=30"
    assert states_30["E15_BRIDGE_SOUTH_EW"]["status"] == "closed"
    assert states_30["E15_BRIDGE_SOUTH_EW"]["is_passable"] is False
    assert sim.is_bridge_south_closed(30) is True

    # --- Minute 60: Severe flood, Bridge North remains elevated and safe ---
    states_60 = sim.simulate_step(60, edge_dicts)
    assert states_60["E15_BRIDGE_SOUTH_EW"]["status"] == "closed"
    assert states_60["E15_BRIDGE_SOUTH_EW"]["is_passable"] is False
    # Bridge North is elevated (threshold 0.35m) and stays safe
    assert states_60["E13_BRIDGE_NORTH_EW"]["is_passable"] is True
    assert sim.is_bridge_north_safe(60) is True


def test_safe_routing():
    """Verify dynamic routing:
    - Route at t=0 uses shortest path.
    - Route at t=30 diverts when Bridge South is flooded, finding safe alternative via Bridge North.
    - Wheelchair mode correctly rejects edges with stairs.
    - Route resilience score is computed and bounded [5, 100].
    """
    graph = RoadGraph()
    graph.load_network(get_seed_nodes(), get_seed_edges())
    router = SafeRouter(graph)
    sim = FloodSimulator()

    # 1. Route at t=0 from Downtown (N05) to South Sports Arena (N11)
    # At t=0, Bridge South (N06 -> N10) is open and is the direct, shortest crossing
    route_t0 = router.plan_route(origin_id="N05", destination_id="N11", mode="walk", departure_minute=0)
    assert route_t0.status == "route_found"
    assert route_t0.primary_route is not None
    assert "E15_BRIDGE_SOUTH_EW" in route_t0.primary_route.path_edges
    assert 5 <= route_t0.primary_route.resilience_score <= 100

    # 2. Advance to t=30: Apply flood states (Bridge South flooded)
    edge_dicts = [e.model_dump() for e in get_seed_edges()]
    states_30 = sim.simulate_step(30, edge_dicts)
    for edge_id, state in states_30.items():
        graph.update_edge_state(
            edge_id,
            flood_depth_m=state["flood_depth_m"],
            status=state["status"],
            is_open=state["is_passable"],
        )

    # Route at t=30 must divert around Bridge South and take Bridge North (E13)
    route_t30 = router.plan_route(origin_id="N05", destination_id="N11", mode="walk", departure_minute=30)
    assert route_t30.status == "route_found"
    assert route_t30.primary_route is not None
    assert "E15_BRIDGE_SOUTH_EW" not in route_t30.primary_route.path_edges, "Must avoid flooded Bridge South"
    assert "E13_BRIDGE_NORTH_EW" in route_t30.primary_route.path_edges, "Must divert via safe Bridge North"
    assert 5 <= route_t30.primary_route.resilience_score <= 100

    # 3. Accessibility: Wheelchair mode rejects edges with stairs
    # N11 (South Arena) to N12 (Hilltop): Direct edge E25_N11_N12_STAIRS has stairs
    # Reset graph to dry conditions for accessibility check
    graph.load_network(get_seed_nodes(), get_seed_edges())

    # Walk mode can take stairs
    route_walk = router.plan_route(origin_id="N11", destination_id="N12", mode="walk")
    assert route_walk.status == "route_found"
    assert "E25_N11_N12_STAIRS" in route_walk.primary_route.path_edges

    # Wheelchair mode MUST reject stairs and navigate via accessible ramps/roads
    route_wheelchair = router.plan_route(origin_id="N11", destination_id="N12", mode="wheelchair")
    assert route_wheelchair.status == "route_found"
    assert "E25_N11_N12_STAIRS" not in route_wheelchair.primary_route.path_edges, "Wheelchair cannot use stairs"

    for edge_id in route_wheelchair.primary_route.path_edges:
        edge_obj = graph.get_edge(edge_id)
        assert edge_obj is not None
        assert not edge_obj.has_stairs, f"Edge {edge_id} has stairs but was assigned to wheelchair user"
        assert "wheelchair" in edge_obj.modes

    # 4. Resilience score boundedness across primary and alternative routes
    assert 5 <= route_wheelchair.primary_route.resilience_score <= 100
    for alt in route_wheelchair.alternatives:
        assert 5 <= alt.resilience_score <= 100


def test_congestion_bpr():
    """Verify BPR volume-delay formula increases travel time monotonically as flow increases."""
    model = CongestionModel(alpha=0.15, beta=4.0, default_capacity=400, max_multiplier=6.0)
    baseline_time_s = 60.0
    flows = [0, 50, 100, 200, 300, 320, 400, 480, 600, 1000]

    prev_time = 0.0
    for flow in flows:
        metrics = model.calculate_edge_metrics(
            baseline_travel_time_s=baseline_time_s,
            volume=flow,
            capacity=400,
        )
        current_time = metrics["travel_time_s"]
        assert current_time >= prev_time, f"Travel time must monotonically increase with flow (flow={flow})"
        prev_time = current_time

    # Zero flow baseline
    zero_metrics = model.calculate_edge_metrics(baseline_travel_time_s=60.0, volume=0, capacity=400)
    assert zero_metrics["congestion_ratio"] == 0.0
    assert zero_metrics["travel_time_s"] == 60.0
    assert not zero_metrics["is_congested"]
    assert not zero_metrics["is_overloaded"]

    # At 80% capacity threshold (320 / 400), is_congested turns True
    cong_metrics = model.calculate_edge_metrics(baseline_travel_time_s=60.0, volume=320, capacity=400)
    assert cong_metrics["is_congested"] is True
    assert cong_metrics["is_overloaded"] is False

    # Over capacity (500 / 400), both are True
    over_metrics = model.calculate_edge_metrics(baseline_travel_time_s=60.0, volume=500, capacity=400)
    assert over_metrics["is_congested"] is True
    assert over_metrics["is_overloaded"] is True


def test_shelter_allocation():
    """Verify strict ZERO overbooking and demand redirection to secondary shelters."""
    graph = RoadGraph()
    graph.load_network(get_seed_nodes(), get_seed_edges())
    allocator = ShelterAllocator(graph)

    # Configured shelters with small explicit capacities
    shelters = [
        Shelter(
            id="shelter_alpha",
            name="Alpha Shelter",
            lon=74.8810,
            lat=31.6400,
            capacity=100,
            occupancy=0,
            accessible=True,
            services=["water"],
            status="open",
        ),
        Shelter(
            id="shelter_beta",
            name="Beta Shelter",
            lon=74.8820,
            lat=31.6310,
            capacity=150,
            occupancy=0,
            accessible=True,
            services=["cots"],
            status="open",
        ),
    ]

    # Origin population of 300 exceeds Alpha's capacity (100) and Beta's (150)
    # Total capacity = 250, Demand = 300
    origins = [
        OriginZone(
            id="zone_high_demand",
            name="Crowded Sector",
            lon=74.8710,
            lat=31.6420,
            node_id="N01",
            population=300,
        )
    ]

    resp, flows = allocator.assign_evacuees(origins, shelters, minute=0, mode="walk")

    # 1. Strict ZERO overbooking check
    assert resp.total_evacuees == 300
    assert resp.total_assigned == 250, "Assigned count cannot exceed sum of capacities"
    assert resp.total_unassigned == 50, "Excess population remains safely tracked as unassigned"

    for alloc in resp.shelter_allocations:
        assert alloc.final_occupancy <= alloc.capacity, f"Shelter {alloc.shelter_id} overbooked!"
        assert alloc.remaining_capacity >= 0
        if alloc.shelter_id == "shelter_alpha":
            assert alloc.final_occupancy == 100
            assert alloc.status == "full"
        elif alloc.shelter_id == "shelter_beta":
            assert alloc.final_occupancy == 150
            assert alloc.status == "full"

    # 2. Demand overflow redirection verified: both shelters received allocations
    alpha_alloc = next(a for a in resp.shelter_allocations if a.shelter_id == "shelter_alpha")
    beta_alloc = next(a for a in resp.shelter_allocations if a.shelter_id == "shelter_beta")
    assert alpha_alloc.assigned_count > 0
    assert beta_alloc.assigned_count > 0, "Secondary shelter must receive overflow demand"


def test_incident_reports():
    """Verify crowdsourced incident deduplication, corroboration scoring, and operator moderation."""
    verifier = IncidentVerifier()

    # 1. Submit initial citizen report
    rep1 = verifier.submit_report(
        edge_id="E01_N01_N02",
        kind="road_flooded",
        reported_minute=5,
        description="Water accumulation near junction",
        reporter_hash="citizen_1",
    )
    assert rep1.status == "pending"
    assert rep1.evidence_count == 1
    assert rep1.verification_score == 0.35

    # 2. Submit second corroborating report for the same edge within 15-minute window
    rep2 = verifier.submit_report(
        edge_id="E01_N01_N02",
        kind="road_flooded",
        reported_minute=10,
        description="Confirmed water is over calf depth",
        reporter_hash="citizen_2",
    )
    # Must deduplicate to the same incident record
    assert rep2.id == rep1.id, "Reports on same edge within time window should deduplicate"
    assert rep2.evidence_count == 2
    assert rep2.verification_score >= 0.70
    assert rep2.status == "verified", "Corroborated incident automatically verifies"

    # 3. Manual operator moderation on a third independent incident
    rep3 = verifier.submit_report(
        edge_id="E03_N01_N03",
        kind="debris_blocked",
        reported_minute=12,
        description="Fallen electrical post",
    )
    assert rep3.status == "pending"

    # Operator review verifies it
    reviewed = verifier.review_report(rep3.id, decision="verify", notes="Confirmed by police unit")
    assert reviewed is not None
    assert reviewed.status == "verified"
    assert reviewed.verification_score == 1.0

    # Blocked edge set contains both verified hazards
    blocked = verifier.get_verified_blocked_edges()
    assert "E01_N01_N02" in blocked
    assert "E03_N01_N03" in blocked

    # Operator rejects an invalid report
    rep4 = verifier.submit_report(edge_id="E07_N03_N05", kind="road_flooded", reported_minute=15)
    rejected = verifier.review_report(rep4.id, decision="reject", notes="False alarm")
    assert rejected is not None
    assert rejected.status == "rejected"
    assert "E07_N03_N05" not in verifier.get_verified_blocked_edges()


# ============================================================================
# API Integration Tests
# ============================================================================

@pytest.fixture(scope="module")
def client():
    """Create reusable FastAPI test client."""
    with TestClient(app) as test_client:
        yield test_client


def test_api_health(client: TestClient):
    """GET /api/health returns 200 with service status."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "SafeRoute" in data["service"]


def test_api_scenarios(client: TestClient):
    """GET /api/scenarios and GET /api/scenarios/monsoon_demo."""
    # List scenarios
    list_resp = client.get("/api/scenarios")
    assert list_resp.status_code == 200
    scenarios = list_resp.json()
    assert len(scenarios) >= 1
    assert scenarios[0]["id"] == "monsoon_demo"

    # Get single scenario details
    item_resp = client.get("/api/scenarios/monsoon_demo")
    assert item_resp.status_code == 200
    detail = item_resp.json()
    assert detail["id"] == "monsoon_demo"
    assert detail["shelters_count"] > 0
    assert detail["road_edges_count"] > 0

    # 404 on nonexistent scenario
    not_found_resp = client.get("/api/scenarios/nonexistent_scenario")
    assert not_found_resp.status_code == 404


def test_api_timeline(client: TestClient):
    """GET /api/scenarios/monsoon_demo/timeline returns precomputed snapshots."""
    response = client.get("/api/scenarios/monsoon_demo/timeline")
    assert response.status_code == 200
    timeline = response.json()
    assert isinstance(timeline, list)
    assert len(timeline) >= 7

    minutes_returned = [snap["minute"] for snap in timeline]
    expected_minutes = [0, 15, 30, 45, 60, 75, 90]
    for exp_min in expected_minutes:
        assert exp_min in minutes_returned, f"Minute {exp_min} missing from timeline"

    # Validate snapshot structure
    snap0 = timeline[0]
    assert "edges_geojson" in snap0
    assert "flood_geojson" in snap0
    assert "shelters" in snap0
    assert "origins" in snap0
    assert "metrics" in snap0


def test_api_route_plan(client: TestClient):
    """POST /api/routes/plan returns primary route and alternatives."""
    payload = {
        "scenario_id": "monsoon_demo",
        "origin_id": "N01",
        "destination_id": "N09",
        "departure_minute": 0,
        "mode": "walk",
        "alternatives": 2,
    }
    response = client.post("/api/routes/plan", json=payload)
    assert response.status_code == 200
    result = response.json()

    assert result["status"] == "route_found"
    assert result["primary_route"] is not None

    primary = result["primary_route"]
    assert len(primary["path_nodes"]) >= 2
    assert len(primary["path_edges"]) >= 1
    assert primary["distance_m"] > 0
    assert 5 <= primary["resilience_score"] <= 100
    assert primary["geometry"]["type"] == "LineString"

    # Alternatives list
    assert isinstance(result["alternatives"], list)


def test_api_evacuation_assign(client: TestClient):
    """POST /api/evacuation/assign assigns evacuees with zero-overbooking guarantee."""
    payload = {
        "scenario_id": "monsoon_demo",
        "minute": 0,
        "mode": "walk",
    }
    response = client.post("/api/evacuation/assign", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total_evacuees"] > 0
    assert data["total_assigned"] > 0
    assert len(data["shelter_allocations"]) > 0

    for alloc in data["shelter_allocations"]:
        assert alloc["final_occupancy"] <= alloc["capacity"], f"Shelter {alloc['shelter_id']} overbooked!"
        assert alloc["remaining_capacity"] >= 0


def test_api_closures(client: TestClient):
    """POST /api/scenarios/monsoon_demo/closures toggles edge closure."""
    # Close an edge manually
    close_payload = {
        "edge_id": "E01_N01_N02",
        "is_open": False,
        "reason": "Hazard drill closure",
    }
    close_resp = client.post("/api/scenarios/monsoon_demo/closures", json=close_payload)
    assert close_resp.status_code == 200

    # Reopen edge
    open_payload = {
        "edge_id": "E01_N01_N02",
        "is_open": True,
        "reason": "Drill ended",
    }
    open_resp = client.post("/api/scenarios/monsoon_demo/closures", json=open_payload)
    assert open_resp.status_code == 200


def test_api_reports(client: TestClient):
    """POST /api/reports submits report, GET /api/reports retrieves it."""
    submit_payload = {
        "edge_id": "E09_N05_N06",
        "kind": "road_flooded",
        "reported_minute": 20,
        "description": "Rising water on South approach",
        "reporter_hash": "qa_test_suite",
    }
    post_resp = client.post("/api/reports", json=submit_payload)
    assert post_resp.status_code == 200
    report = post_resp.json()
    assert report["id"].startswith("rep_")
    assert report["edge_id"] == "E09_N05_N06"

    # Retrieve all reports
    get_resp = client.get("/api/reports")
    assert get_resp.status_code == 200
    reports = get_resp.json()
    assert any(r["id"] == report["id"] for r in reports)
