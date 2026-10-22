"""Unit tests for SafeRoute schemas and Riverdale seed data."""

from __future__ import annotations

import pytest
from app.models.schemas import (
    MobilityProfile,
    EdgeStatus,
    ShelterStatus,
    IncidentStatus,
    ScenarioEventType,
    RoadNode,
    RoadEdge,
    EdgeState,
    Shelter,
    OriginZone,
    FloodZone,
    ScenarioEvent,
    RouteRequest,
    RouteCandidate,
    RouteResponse,
    CrowdAssignRequest,
    ShelterAllocation,
    CrowdAssignResponse,
    IncidentReport,
    AuditEvent,
    ScenarioSnapshot,
)
from app.data.seed_data import (
    get_seed_nodes,
    get_seed_edges,
    get_seed_shelters,
    get_seed_origins,
    get_seed_scenario_events,
)


def test_seed_nodes_structure():
    """Verify 12 nodes (N01 to N12) arranged on both sides of river."""
    nodes = get_seed_nodes()
    assert len(nodes) == 12
    node_ids = {n.id for n in nodes}
    expected_ids = {f"N{i:02d}" for i in range(1, 13)}
    assert node_ids == expected_ids
    for n in nodes:
        assert isinstance(n.id, str)
        assert isinstance(n.name, str) and len(n.name) > 0
        assert 74.0 < n.lon < 75.5
        assert 31.0 < n.lat < 32.5


def test_seed_edges_bridges_and_stairs():
    """Verify directed edges, lengths between 200m and 800m, bridges, and stairs path."""
    edges = get_seed_edges()
    assert len(edges) >= 20
    nodes = get_seed_nodes()
    node_ids = {n.id for n in nodes}

    for e in edges:
        assert 200.0 <= e.length_m <= 800.0
        assert e.from_node in node_ids
        assert e.to_node in node_ids
        assert e.geometry.get("type") == "LineString"
        assert len(e.geometry.get("coordinates", [])) >= 2

    # Bridge North: N04 <-> N08
    bridge_north = [e for e in edges if {e.from_node, e.to_node} == {"N04", "N08"}]
    assert len(bridge_north) == 2
    assert any(e.from_node == "N04" and e.to_node == "N08" for e in bridge_north)
    assert any(e.from_node == "N08" and e.to_node == "N04" for e in bridge_north)

    # Bridge South: N06 <-> N10
    bridge_south = [e for e in edges if {e.from_node, e.to_node} == {"N06", "N10"}]
    assert len(bridge_south) == 2
    assert any(e.from_node == "N06" and e.to_node == "N10" for e in bridge_south)
    assert any(e.from_node == "N10" and e.to_node == "N06" for e in bridge_south)
    for e in bridge_south:
        assert e.flood_threshold_m == 0.20

    # Stairs path: has_stairs=True, impassable for wheelchair
    stairs = [e for e in edges if e.has_stairs]
    assert len(stairs) >= 1
    for s in stairs:
        assert s.has_stairs is True
        assert "wheelchair" not in s.modes
        assert "walk" in s.modes


def test_seed_origins_and_shelters():
    """Verify 3 origins and 4 designated shelters with required capacities and access."""
    origins = get_seed_origins()
    assert len(origins) == 3
    orig_map = {o.id: o for o in origins}

    assert orig_map["origin_north"].population == 400
    assert orig_map["origin_east"].population == 350
    assert orig_map["origin_central"].population == 500

    shelters = get_seed_shelters()
    assert len(shelters) == 4
    sh_map = {s.id: s for s in shelters}

    assert sh_map["shelter_west_high"].capacity == 450
    assert sh_map["shelter_west_high"].accessible is True

    assert sh_map["shelter_south_stadium"].capacity == 500
    assert sh_map["shelter_south_stadium"].accessible is True

    assert sh_map["shelter_hill_station"].capacity == 300
    assert sh_map["shelter_hill_station"].accessible is False

    assert sh_map["shelter_east_center"].capacity == 200
    assert sh_map["shelter_east_center"].accessible is True


def test_flood_timeline_events():
    """Verify flood progression timeline events at t=0, 15, 30, 60."""
    events = get_seed_scenario_events()
    minutes = {e.minute for e in events}
    assert 0 in minutes
    assert 15 in minutes
    assert 30 in minutes
    assert 60 in minutes

    # Bridge South closure events at t=30
    close_events = [e for e in events if e.minute == 30 and e.event_type == "road_close"]
    closed_targets = {e.target_id for e in close_events}
    assert "E15_BRIDGE_SOUTH_EW" in closed_targets
    assert "E16_BRIDGE_SOUTH_WE" in closed_targets


def test_schemas_instantiation_and_validation():
    """Verify instantiation of all required Pydantic v2 schema models."""
    # Enums
    assert MobilityProfile.WALK == "walk"
    assert MobilityProfile.WHEELCHAIR == "wheelchair"
    assert MobilityProfile.VEHICLE == "vehicle"

    # EdgeState
    state = EdgeState(
        edge_id="E01",
        minute=15,
        flood_depth_m=0.08,
        congestion_ratio=1.2,
        status="caution",
        travel_time_s=45.0,
        is_passable=True,
    )
    assert state.status == "caution"

    # FloodZone
    fz = FloodZone(
        id="FZ1",
        name="River Overflow",
        minute=30,
        geometry_coordinates=[[74.87, 31.63], [74.88, 31.63]],
        severity="severe",
    )
    assert fz.geometry_coordinates == fz.polygon_coordinates

    # RouteRequest & RouteCandidate & RouteResponse
    req = RouteRequest(
        scenario_id="riverdale_demo",
        origin_id="N01",
        destination_id="N09",
        departure_minute=0,
        mode=MobilityProfile.WALK,
        alternatives=2,
    )
    assert req.mode == MobilityProfile.WALK

    cand = RouteCandidate(
        route_id="R01",
        path_nodes=["N01", "N04", "N08", "N09"],
        path_edges=["E01", "E13", "E17"],
        distance_m=1200.0,
        estimated_duration_s=240.0,
        resilience_score=85,
        hazard_exposure="low",
        warnings=[],
        geometry={"type": "LineString", "coordinates": [[74.87, 31.64], [74.88, 31.64]]},
    )
    resp = RouteResponse(
        scenario_id="riverdale_demo",
        evaluated_minute=0,
        status="route_found",
        primary_route=cand,
        alternatives=[],
        data_freshness={"minute": 0},
    )
    assert resp.primary_route is not None

    # CrowdAssignRequest & Response
    assign_req = CrowdAssignRequest(
        scenario_id="riverdale_demo",
        minute=0,
        origins=["origin_north", "origin_east"],
    )
    assert assign_req.origins == ["origin_north", "origin_east"]
    assert assign_req.origin_ids == ["origin_north", "origin_east"]

    alloc = ShelterAllocation(
        shelter_id="shelter_west_high",
        shelter_name="West High School",
        assigned_count=350,
        remaining_capacity=100,
        status="open",
    )
    assign_resp = CrowdAssignResponse(
        scenario_id="riverdale_demo",
        minute=0,
        total_evacuees=1250,
        total_assigned=1250,
        total_unassigned=0,
        shelter_allocations=[alloc],
        overloaded_edges=[],
    )
    assert assign_resp.total_assigned == 1250

    # IncidentReport
    inc = IncidentReport(
        id="RPT01",
        reporter_hash="hash123",
        edge_id="E15_BRIDGE_SOUTH_EW",
        kind="flood",
        reported_minute=15,
        status="pending",
        verification_score=0.4,
        evidence_count=1,
    )
    assert inc.status == "pending"

    # AuditEvent
    audit = AuditEvent(
        id="AUD01",
        timestamp_minute=30,
        action="close_bridge",
        details={"bridge": "Bridge South"},
    )
    assert audit.timestamp_minute == 30
    assert audit.minute == 30

    # ScenarioSnapshot
    snap = ScenarioSnapshot(
        scenario_id="riverdale_demo",
        minute=30,
        edge_states={"E01": state},
        shelters=get_seed_shelters(),
        active_incidents=[inc],
        metrics={"evac_rate": 0.8},
    )
    dumped = snap.model_dump()
    assert dumped["scenario_id"] == "riverdale_demo"
    assert len(dumped["shelters"]) == 4
