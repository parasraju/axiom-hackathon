"""Pydantic schemas and data models for SafeRoute."""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field


class MobilityProfile(str, Enum):
    WALK = "walk"
    WHEELCHAIR = "wheelchair"
    VEHICLE = "vehicle"


class RoadNode(BaseModel):
    id: str
    lon: float
    lat: float
    name: str = ""
    kind: str = "intersection"


class RoadEdge(BaseModel):
    id: str
    from_node: str
    to_node: str
    length_m: float
    baseline_speed_kmh: float = 25.0
    modes: List[str] = Field(default_factory=lambda: ["walk", "wheelchair", "vehicle"])
    flood_threshold_m: float = 0.20
    has_stairs: bool = False
    is_open: bool = True
    capacity: int = 400
    geometry: Dict[str, Any] = Field(default_factory=dict)


class EdgeState(BaseModel):
    edge_id: str
    minute: int
    flood_depth_m: float = 0.0
    congestion_ratio: float = 0.0
    status: str = "normal"  # normal, caution, closed
    travel_time_s: float = 0.0
    is_passable: bool = True
    is_simulated: bool = True


class Shelter(BaseModel):
    id: str
    name: str
    lon: float
    lat: float
    capacity: int
    occupancy: int = 0
    accessible: bool = True
    services: List[str] = Field(default_factory=lambda: ["first_aid", "water"])
    status: str = "open"  # open, full, closed


class OriginZone(BaseModel):
    id: str
    name: str
    lon: float
    lat: float
    node_id: str
    population: int


class FloodZone(BaseModel):
    id: str
    name: str
    minute: int
    severity: int
    polygon_coordinates: List[List[float]] = Field(default_factory=list)


class ScenarioEvent(BaseModel):
    minute: int
    event_type: str  # flood_expand, road_close, demand_increase
    target_id: str
    value: Any = None


class RouteRequest(BaseModel):
    scenario_id: str = "monsoon_demo"
    origin_id: Optional[str] = None
    origin_coords: Optional[Tuple[float, float]] = None
    destination_id: Optional[str] = None
    destination_coords: Optional[Tuple[float, float]] = None
    departure_minute: int = 0
    mode: MobilityProfile = MobilityProfile.WALK
    alternatives: int = 2


class RouteCandidate(BaseModel):
    route_id: str
    path_nodes: List[str]
    path_edges: List[str]
    distance_m: float
    estimated_duration_s: float
    resilience_score: int
    score_type: str = "heuristic_not_probability"
    hazard_exposure: str  # low, moderate, high
    warnings: List[str] = Field(default_factory=list)
    geometry: Dict[str, Any] = Field(default_factory=dict)


class RouteResponse(BaseModel):
    scenario_id: str
    evaluated_minute: int
    status: str  # route_found, no_route_found
    primary_route: Optional[RouteCandidate] = None
    alternatives: List[RouteCandidate] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    data_freshness: Dict[str, Any] = Field(
        default_factory=lambda: {
            "scenario_snapshot_minute": 0,
            "is_simulated": True,
            "timestamp": "2026-10-22T07:00:00Z",
        }
    )


class CrowdAssignRequest(BaseModel):
    scenario_id: str = "monsoon_demo"
    minute: int = 0
    mode: MobilityProfile = MobilityProfile.WALK
    origin_ids: Optional[List[str]] = None


class ShelterAllocation(BaseModel):
    shelter_id: str
    shelter_name: str
    assigned_count: int
    final_occupancy: int
    capacity: int
    remaining_capacity: int
    status: str


class CrowdAssignResponse(BaseModel):
    scenario_id: str
    minute: int
    total_evacuees: int
    total_assigned: int
    total_unassigned: int
    shelter_allocations: List[ShelterAllocation]
    overloaded_edges: List[str] = Field(default_factory=list)
    edge_flows: Dict[str, int] = Field(default_factory=dict)
    unassigned_reasons: Dict[str, str] = Field(default_factory=dict)


class IncidentReport(BaseModel):
    id: str
    reporter_hash: str = "anonymous_citizen"
    edge_id: str
    kind: str = "road_flooded"  # road_flooded, debris_blocked, bridge_closed
    description: str = ""
    reported_minute: int = 0
    status: str = "pending"  # pending, verified, rejected
    verification_score: float = 0.35
    evidence_count: int = 1


class AuditEvent(BaseModel):
    id: str
    minute: int
    action: str
    details: Dict[str, Any] = Field(default_factory=dict)


class ScenarioSnapshot(BaseModel):
    scenario_id: str
    minute: int
    edges_geojson: Dict[str, Any]
    flood_geojson: Dict[str, Any]
    shelters: List[Shelter]
    origins: List[OriginZone]
    metrics: Dict[str, Any]
