"""Comprehensive unit tests for ShelterAllocator."""

from __future__ import annotations

import sys
from pathlib import Path
import pytest

# Ensure backend root is in sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.schemas import RoadNode, RoadEdge, Shelter, OriginZone, MobilityProfile
from app.graph.road_network import RoadGraph
from app.routing.router import SafeRouter
from app.assignment.shelter_allocator import (
    ShelterAllocator,
    ShelterAllocationResult,
    ShelterAllocationItem,
    UnassignedInfo,
)


def create_simple_network() -> RoadGraph:
    """Build a simple test network with 4 nodes:
    N1 (Origin) --(E1)--> N2 (Mid) --(E2)--> N3 (Shelter A)
                                    --(E3)--> N4 (Shelter B)
    """
    nodes = [
        RoadNode(id="N1", lon=74.8710, lat=31.6420, name="Origin Gate"),
        RoadNode(id="N2", lon=74.8740, lat=31.6410, name="Mid Junction"),
        RoadNode(id="N3", lon=74.8810, lat=31.6400, name="Shelter A Node"),
        RoadNode(id="N4", lon=74.8820, lat=31.6310, name="Shelter B Node"),
    ]
    edges = [
        RoadEdge(
            id="E1",
            from_node="N1",
            to_node="N2",
            length_m=300.0,
            baseline_speed_kmh=30.0,
            modes=["walk", "wheelchair", "vehicle"],
            capacity=500,
        ),
        RoadEdge(
            id="E2",
            from_node="N2",
            to_node="N3",
            length_m=200.0,
            baseline_speed_kmh=30.0,
            modes=["walk", "wheelchair", "vehicle"],
            capacity=300,
        ),
        RoadEdge(
            id="E3",
            from_node="N2",
            to_node="N4",
            length_m=800.0,
            baseline_speed_kmh=30.0,
            modes=["walk", "vehicle"],  # Not wheelchair accessible
            has_stairs=True,
            capacity=300,
        ),
    ]
    graph = RoadGraph()
    graph.load_network(nodes, edges)
    return graph


def test_basic_shelter_allocation():
    graph = create_simple_network()
    router = SafeRouter(graph)
    allocator = ShelterAllocator(graph, router)

    origins = [
        {"id": "origin_1", "name": "Zone 1", "node_id": "N1", "population": 150}
    ]
    shelters = [
        {
            "id": "shelter_a",
            "name": "Shelter A",
            "node_id": "N3",
            "capacity": 200,
            "occupancy": 0,
            "accessible": True,
            "status": "open",
        }
    ]

    result = allocator.assign_evacuees(origins, shelters, router=router, graph=graph, mode="walk")

    assert isinstance(result, dict)
    assert result["total_evacuees"] == 150
    assert result["total_assigned"] == 150
    assert result["total_unassigned"] == 0

    alloc_a = next(a for a in result["shelter_allocations"] if a["shelter_id"] == "shelter_a")
    assert alloc_a["assigned_count"] == 150
    assert alloc_a["final_occupancy"] == 150
    assert alloc_a["remaining_capacity"] == 50
    assert alloc_a["status"] == "open"

    # Edge flows should reflect E1 and E2 traversed by 150 evacuees
    assert result["edge_flows"]["E1"] == 150
    assert result["edge_flows"]["E2"] == 150
    assert "E3" not in result["edge_flows"]


def test_zero_overbooking_strict_capacity():
    graph = create_simple_network()
    router = SafeRouter(graph)
    allocator = ShelterAllocator(graph, router)

    # 300 evacuees trying to enter a shelter with only 100 capacity
    origins = [
        {"id": "origin_overflow", "name": "Overflow Zone", "node_id": "N1", "population": 300}
    ]
    shelters = [
        {
            "id": "shelter_small",
            "name": "Small Shelter",
            "node_id": "N3",
            "capacity": 100,
            "occupancy": 0,
            "accessible": True,
            "status": "open",
        }
    ]

    result = allocator.assign_evacuees(origins, shelters, router, graph, mode="walk")

    assert result["total_evacuees"] == 300
    assert result["total_assigned"] == 100
    assert result["total_unassigned"] == 200

    alloc = result["shelter_allocations"][0]
    # STRICT ZERO OVERBOOKING GUARANTEE
    assert alloc["final_occupancy"] == 100
    assert alloc["final_occupancy"] <= alloc["capacity"]
    assert alloc["remaining_capacity"] == 0
    assert alloc["status"] == "full"

    # Check unassigned breakdown
    assert "origin_overflow" in result["unassigned_breakdown"]
    unassigned = result["unassigned_breakdown"]["origin_overflow"]
    assert unassigned == 200
    assert unassigned["reason"] == "shelters full"
    assert unassigned.reason == "shelters full"


def test_batch_allocation_across_multiple_shelters():
    graph = create_simple_network()
    router = SafeRouter(graph)
    allocator = ShelterAllocator(graph, router)

    # 250 evacuees: Shelter A has cap 100, Shelter B has cap 200
    # Shelter A is closer (travel time shorter), so it fills first (100),
    # then remaining 150 go to Shelter B.
    origins = [
        {"id": "origin_big", "name": "Big Zone", "node_id": "N1", "population": 250}
    ]
    shelters = [
        {
            "id": "shelter_a",
            "name": "Shelter A",
            "node_id": "N3",
            "capacity": 100,
            "occupancy": 0,
            "accessible": True,
            "status": "open",
        },
        {
            "id": "shelter_b",
            "name": "Shelter B",
            "node_id": "N4",
            "capacity": 200,
            "occupancy": 0,
            "accessible": True,
            "status": "open",
        },
    ]

    result = allocator.assign_evacuees(origins, shelters, router, graph, mode="walk")

    assert result["total_evacuees"] == 250
    assert result["total_assigned"] == 250
    assert result["total_unassigned"] == 0

    alloc_a = next(a for a in result["shelter_allocations"] if a["shelter_id"] == "shelter_a")
    alloc_b = next(a for a in result["shelter_allocations"] if a["shelter_id"] == "shelter_b")

    assert alloc_a["assigned_count"] == 100
    assert alloc_a["final_occupancy"] == 100
    assert alloc_a["status"] == "full"

    assert alloc_b["assigned_count"] == 150
    assert alloc_b["final_occupancy"] == 150
    assert alloc_b["status"] == "open"

    # Edge flows: E1 used by all 250, E2 used by 100, E3 used by 150
    assert result["edge_flows"]["E1"] == 250
    assert result["edge_flows"]["E2"] == 100
    assert result["edge_flows"]["E3"] == 150


def test_wheelchair_accessibility_filter():
    graph = create_simple_network()
    router = SafeRouter(graph)
    allocator = ShelterAllocator(graph, router)

    origins = [
        {"id": "origin_wheelchair", "node_id": "N1", "population": 50}
    ]
    shelters = [
        {
            "id": "shelter_inaccessible",
            "name": "Inaccessible Shelter",
            "node_id": "N3",
            "capacity": 100,
            "occupancy": 0,
            "accessible": False,
            "status": "open",
        }
    ]

    # Wheelchair mode must filter out inaccessible shelter
    result = allocator.assign_evacuees(origins, shelters, router, graph, mode="wheelchair")

    assert result["total_evacuees"] == 50
    assert result["total_assigned"] == 0
    assert result["total_unassigned"] == 50

    unassigned = result["unassigned_breakdown"]["origin_wheelchair"]
    assert unassigned == 50
    # Accessible shelter was not available/open
    assert unassigned["reason"] in ("shelters full", "no passable route")


def test_no_passable_route_breakdown():
    graph = create_simple_network()
    # Close E1 so origin N1 cannot reach anywhere
    graph.update_edge_state("E1", is_open=False)
    router = SafeRouter(graph)
    allocator = ShelterAllocator(graph, router)

    origins = [
        {"id": "origin_blocked", "node_id": "N1", "population": 80}
    ]
    shelters = [
        {
            "id": "shelter_open",
            "name": "Open Shelter",
            "node_id": "N3",
            "capacity": 200,
            "occupancy": 0,
            "accessible": True,
            "status": "open",
        }
    ]

    result = allocator.assign_evacuees(origins, shelters, router, graph, mode="walk")

    assert result["total_assigned"] == 0
    assert result["total_unassigned"] == 80
    assert "origin_blocked" in result["unassigned_breakdown"]
    assert result["unassigned_breakdown"]["origin_blocked"]["reason"] == "no passable route"


def test_pydantic_model_compatibility():
    graph = create_simple_network()
    router = SafeRouter(graph)
    allocator = ShelterAllocator(graph, router)

    origins = [
        OriginZone(
            id="origin_north",
            name="North Zone",
            lon=74.8710,
            lat=31.6420,
            node_id="N1",
            population=120,
        )
    ]
    shelters = [
        Shelter(
            id="shelter_west",
            name="West Shelter",
            lon=74.8810,
            lat=31.6400,
            capacity=300,
            occupancy=50,
            accessible=True,
            status="open",
        )
    ]

    result = allocator.assign_evacuees(origins, shelters, router, graph, mode="walk")

    assert result.total_evacuees == 120
    assert result.total_assigned == 120
    assert result.total_unassigned == 0
    assert len(result.shelter_allocations) == 1
    assert result.shelter_allocations[0].final_occupancy == 170  # 50 existing + 120 assigned
    assert result.shelter_allocations[0].remaining_capacity == 130


def test_legacy_tuple_unpacking():
    graph = create_simple_network()
    allocator = ShelterAllocator(graph)

    origins = [
        {"id": "origin_1", "node_id": "N1", "population": 60}
    ]
    shelters = [
        {
            "id": "shelter_1",
            "name": "Shelter 1",
            "node_id": "N3",
            "capacity": 100,
            "occupancy": 0,
            "accessible": True,
            "status": "open",
        }
    ]

    # Calling with minute=0 triggers backward-compatible (result, edge_flows) tuple
    resp, edge_flows = allocator.assign_evacuees(origins, shelters, minute=0, mode="walk")

    assert resp.total_assigned == 60
    assert isinstance(edge_flows, dict)
    assert edge_flows["E1"] == 60
