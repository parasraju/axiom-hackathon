"""Pydantic schemas and data models for the SafeRoute disaster-aware evacuation simulation platform.

All models are built for Pydantic v2 and Python 3.13.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Tuple, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class MobilityProfile(str, Enum):
    """Supported evacuation mobility profiles."""
    WALK = "walk"
    WHEELCHAIR = "wheelchair"
    VEHICLE = "vehicle"


class EdgeStatus(str, Enum):
    """Traffic and hazard status of a road edge."""
    NORMAL = "normal"
    CAUTION = "caution"
    CLOSED = "closed"


class ShelterStatus(str, Enum):
    """Operational status of an emergency shelter."""
    OPEN = "open"
    FULL = "full"
    CLOSED = "closed"


class IncidentStatus(str, Enum):
    """Verification status of a community incident report."""
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class ScenarioEventType(str, Enum):
    """Types of dynamic scenario events."""
    FLOOD_EXPAND = "flood_expand"
    ROAD_CLOSE = "road_close"
    DEMAND_INCREASE = "demand_increase"
    SHELTER_FILL = "shelter_fill"


class RoadNode(BaseModel):
    """Node in the road network graph representing an intersection or landmark."""
    id: str
    lon: float
    lat: float
    name: str = ""
    kind: str = "intersection"

    model_config = ConfigDict(extra="ignore")


class RoadEdge(BaseModel):
    """Directed edge in the road network graph."""
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

    model_config = ConfigDict(extra="ignore")


class EdgeState(BaseModel):
    """Dynamic operational state of a road edge at a specific simulation minute."""
    edge_id: str
    minute: int
    flood_depth_m: float = 0.0
    congestion_ratio: float = 0.0
    status: Literal["normal", "caution", "closed"] | EdgeStatus | str = "normal"
    travel_time_s: float = 0.0
    is_passable: bool = True
    is_simulated: bool = True

    model_config = ConfigDict(extra="ignore")


class Shelter(BaseModel):
    """Designated emergency shelter facility."""
    id: str
    name: str
    lon: float
    lat: float
    capacity: int
    occupancy: int = 0
    accessible: bool = True
    services: List[str] = Field(default_factory=lambda: ["first_aid", "water"])
    status: Literal["open", "full", "closed"] | ShelterStatus | str = "open"

    model_config = ConfigDict(extra="ignore")


class OriginZone(BaseModel):
    """Origin zone where evacuees muster or reside."""
    id: str
    name: str
    lon: float
    lat: float
    population: int
    node_id: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class FloodZone(BaseModel):
    """Dynamic water body or flood inundation polygon."""
    id: str
    name: str
    minute: int
    geometry_coordinates: List[Any] = Field(default_factory=list)
    severity: Union[str, int] = "moderate"
    polygon_coordinates: List[Any] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def harmonize_coords(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "geometry_coordinates" not in data and "polygon_coordinates" in data:
                data["geometry_coordinates"] = data["polygon_coordinates"]
            elif "polygon_coordinates" not in data and "geometry_coordinates" in data:
                data["polygon_coordinates"] = data["geometry_coordinates"]
        return data


class ScenarioEvent(BaseModel):
    """Dynamic scheduled event in a scenario progression."""
    minute: int
    event_type: Literal["flood_expand", "road_close", "demand_increase", "shelter_fill"] | ScenarioEventType | str
    target_id: str
    value: Any = None

    model_config = ConfigDict(extra="ignore")


class RouteRequest(BaseModel):
    """Request payload to plan an evacuation route."""
    scenario_id: str = "monsoon_demo"
    origin_id: Optional[str] = None
    origin_coords: Optional[Tuple[float, float]] = None
    destination_id: Optional[str] = None
    destination_coords: Optional[Tuple[float, float]] = None
    departure_minute: int = 0
    mode: MobilityProfile = MobilityProfile.WALK
    alternatives: int = 2

    model_config = ConfigDict(extra="ignore")


class RouteCandidate(BaseModel):
    """A single candidate route path from origin to destination."""
    route_id: str
    path_nodes: List[str] = Field(default_factory=list)
    path_edges: List[str] = Field(default_factory=list)
    distance_m: float
    estimated_duration_s: float
    resilience_score: int
    score_type: str = "heuristic_not_probability"
    hazard_exposure: str = "low"  # low, moderate, high
    warnings: List[str] = Field(default_factory=list)
    geometry: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")


class RouteResponse(BaseModel):
    """Response payload containing primary route and alternatives."""
    scenario_id: str = "monsoon_demo"
    evaluated_minute: int = 0
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

    model_config = ConfigDict(extra="ignore")


class CrowdAssignRequest(BaseModel):
    """Request payload to allocate origin populations across available shelters."""
    scenario_id: str = "monsoon_demo"
    minute: int = 0
    origins: Optional[List[str]] = None
    origin_ids: Optional[List[str]] = None
    mode: MobilityProfile = MobilityProfile.WALK

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def harmonize_origins(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "origins" not in data and "origin_ids" in data:
                data["origins"] = data["origin_ids"]
            elif "origin_ids" not in data and "origins" in data:
                data["origin_ids"] = data["origins"]
        return data


class ShelterAllocation(BaseModel):
    """Allocation summary for a single emergency shelter."""
    shelter_id: str
    shelter_name: str
    assigned_count: int
    remaining_capacity: int
    status: str
    final_occupancy: int = 0
    capacity: int = 0

    model_config = ConfigDict(extra="ignore")


class CrowdAssignResponse(BaseModel):
    """System-wide shelter assignment result."""
    scenario_id: str
    minute: int
    total_evacuees: int
    total_assigned: int
    total_unassigned: int
    shelter_allocations: List[ShelterAllocation] = Field(default_factory=list)
    overloaded_edges: List[str] = Field(default_factory=list)
    edge_flows: Dict[str, int] = Field(default_factory=dict)
    unassigned_reasons: Dict[str, str] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")


class IncidentReport(BaseModel):
    """Citizen-submitted or sensor-detected hazard report."""
    id: str
    reporter_hash: str = "anonymous_citizen"
    edge_id: str
    kind: str = "road_flooded"  # road_flooded, debris_blocked, bridge_closed
    description: str = ""
    reported_minute: int = 0
    status: Literal["pending", "verified", "rejected"] | IncidentStatus | str = "pending"
    verification_score: float = 0.35
    evidence_count: int = 1

    model_config = ConfigDict(extra="ignore")


class AuditEvent(BaseModel):
    """Audit log event recorded for commander actions or system events."""
    id: str
    timestamp_minute: int = 0
    action: str
    details: Dict[str, Any] = Field(default_factory=dict)
    minute: Optional[int] = None

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def harmonize_minute(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "timestamp_minute" not in data and "minute" in data:
                data["timestamp_minute"] = data["minute"]
            elif "minute" not in data and "timestamp_minute" in data:
                data["minute"] = data["timestamp_minute"]
        return data


class ScenarioSnapshot(BaseModel):
    """Complete snapshot of city state at a given simulation minute."""
    scenario_id: str
    minute: int
    edge_states: Dict[str, EdgeState] = Field(default_factory=dict)
    shelters: List[Shelter] = Field(default_factory=list)
    active_incidents: List[IncidentReport] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    edges_geojson: Dict[str, Any] = Field(default_factory=dict)
    flood_geojson: Dict[str, Any] = Field(default_factory=dict)
    origins: List[OriginZone] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")
