"""FastAPI REST endpoints for SafeRoute emergency simulation and navigation."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.models.schemas import (
    RouteRequest,
    RouteResponse,
    CrowdAssignRequest,
    CrowdAssignResponse,
    IncidentReport,
    Shelter,
    AuditEvent,
)
from app.simulation.scenario_manager import ScenarioManager
from app.routing.router import SafeRouter


router = APIRouter()

# Singleton scenario manager
scenario_mgr = ScenarioManager("monsoon_demo")
safe_router = SafeRouter(scenario_mgr.road_graph)


def sync_graph_to_minute(minute: int) -> None:
    """Synchronize road graph runtime state with snapshot at given minute."""
    snapshot = scenario_mgr.get_snapshot(minute)
    features = snapshot.get("edges_geojson", {}).get("features", [])
    for feat in features:
        props = feat.get("properties", {})
        edge_id = props.get("id") or props.get("edge_id")
        if edge_id:
            scenario_mgr.road_graph.update_edge_state(
                edge_id,
                flood_depth_m=props.get("flood_depth_m", 0.0),
                congestion_ratio=props.get("congestion_ratio", 0.0),
                status=props.get("status", "normal"),
                travel_time_s=props.get("travel_time_s", 60.0),
                is_open=props.get("is_open", True),
                is_passable=props.get("is_passable", True),
            )


class AdvanceRequest(BaseModel):
    minute: int


class ClosureToggleRequest(BaseModel):
    edge_id: str
    is_open: bool
    reason: str = "operator override"


class ReviewReportRequest(BaseModel):
    decision: str  # verify or reject
    notes: str = ""


class ReportSubmitRequest(BaseModel):
    edge_id: str
    kind: str = "road_flooded"
    reported_minute: int = 0
    description: str = ""
    reporter_hash: str = "citizen_mobile_app"


class ShelterUpdateRequest(BaseModel):
    capacity: Optional[int] = None
    status: Optional[str] = None


@router.get("/health")
def health_check() -> Dict[str, str]:
    return {
        "status": "ok",
        "service": "SafeRoute API",
        "version": "1.0.0",
    }


@router.get("/scenarios")
def list_scenarios() -> List[Dict[str, Any]]:
    return [
        {
            "id": scenario_mgr.scenario_id,
            "name": "Riverdale Monsoon Evacuation Scenario",
            "description": "Simulated river crest flooding, low underpass bridge closure, crowd congestion, and capacity-constrained shelter relocation.",
            "duration_minutes": 90,
            "step_minutes": 15,
            "keyframe_minutes": [0, 15, 30, 45, 60, 75, 90],
            "is_simulated": True,
        }
    ]


@router.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: str) -> Dict[str, Any]:
    if scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {
        "id": scenario_mgr.scenario_id,
        "name": "Riverdale Monsoon Evacuation Scenario",
        "description": "Simulated river crest flooding, low underpass bridge closure, crowd congestion, and capacity-constrained shelter relocation.",
        "duration_minutes": 90,
        "step_minutes": 15,
        "keyframe_minutes": [0, 15, 30, 45, 60, 75, 90],
        "current_minute": scenario_mgr.current_minute,
        "origins_count": len(scenario_mgr.origins),
        "shelters_count": len(scenario_mgr.shelters),
        "road_edges_count": len(scenario_mgr.edges),
        "is_simulated": True,
    }


@router.get("/scenarios/{scenario_id}/timeline")
def get_scenario_timeline(scenario_id: str) -> List[Dict[str, Any]]:
    """Return precomputed deterministic snapshots for instant frontend time-slider scrubbing."""
    if scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario_mgr.get_timeline()


@router.get("/scenarios/{scenario_id}/snapshot")
def get_scenario_snapshot(scenario_id: str, minute: int = Query(0, ge=0)) -> Dict[str, Any]:
    if scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario_mgr.get_snapshot(minute)


@router.post("/scenarios/{scenario_id}/advance")
def advance_scenario(scenario_id: str, payload: AdvanceRequest) -> Dict[str, Any]:
    if scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    snapshot = scenario_mgr.advance_time(payload.minute)
    sync_graph_to_minute(payload.minute)
    return snapshot


@router.post("/scenarios/{scenario_id}/reset")
def reset_scenario(scenario_id: str) -> Dict[str, Any]:
    if scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    snapshot = scenario_mgr.reset()
    sync_graph_to_minute(0)
    return snapshot


@router.post("/scenarios/{scenario_id}/closures")
def toggle_road_closure(scenario_id: str, payload: ClosureToggleRequest) -> Dict[str, Any]:
    if scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    snapshot = scenario_mgr.toggle_edge_closure(payload.edge_id, payload.is_open, payload.reason)
    sync_graph_to_minute(scenario_mgr.current_minute)
    return snapshot


@router.post("/routes/plan", response_model=RouteResponse)
def plan_route(payload: RouteRequest) -> RouteResponse:
    """Dynamic hazard-aware evacuation route calculation with mode filtering and resilience score."""
    # Ensure current graph matches evaluated snapshot minute
    sync_graph_to_minute(payload.departure_minute)

    # Origin resolution (by ID, entity mapping, or nearest coordinates)
    origin_node = payload.origin_id
    if not origin_node and payload.origin_coords:
        origin_node = scenario_mgr.road_graph.find_nearest_node(
            payload.origin_coords[0], payload.origin_coords[1]
        )
    elif origin_node:
        for o in scenario_mgr.origins:
            if o.id == origin_node:
                origin_node = o.node_id
                break
        for s in scenario_mgr.shelters:
            if s.id == origin_node:
                origin_node = scenario_mgr.road_graph.find_nearest_node(s.lon, s.lat)
                break

    # Destination resolution (by ID, entity mapping, or nearest coordinates)
    destination_node = payload.destination_id
    if not destination_node and payload.destination_coords:
        destination_node = scenario_mgr.road_graph.find_nearest_node(
            payload.destination_coords[0], payload.destination_coords[1]
        )
    elif destination_node:
        for s in scenario_mgr.shelters:
            if s.id == destination_node:
                destination_node = scenario_mgr.road_graph.find_nearest_node(s.lon, s.lat)
                break
        for o in scenario_mgr.origins:
            if o.id == destination_node:
                destination_node = o.node_id
                break

    if not origin_node or not destination_node:
        return RouteResponse(
            scenario_id=payload.scenario_id,
            evaluated_minute=payload.departure_minute,
            status="no_route_found",
            warnings=["Could not resolve origin or destination to a network node."],
        )

    # Route planning via SafeRouter
    mode_str = payload.mode.value if hasattr(payload.mode, "value") else str(payload.mode)
    return safe_router.plan_route(
        origin_id=origin_node,
        destination_id=destination_node,
        mode=mode_str,
        departure_minute=payload.departure_minute,
        alternatives=payload.alternatives,
    )


@router.post("/evacuation/assign", response_model=CrowdAssignResponse)
def assign_evacuation(payload: CrowdAssignRequest) -> CrowdAssignResponse:
    """Assign population batches from origins to reachable shelters with capacity constraints."""
    if payload.scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")

    sync_graph_to_minute(payload.minute)

    origins = scenario_mgr.origins
    if payload.origin_ids:
        origins = [o for o in origins if o.id in payload.origin_ids]

    mode_str = payload.mode.value if hasattr(payload.mode, "value") else str(payload.mode)
    resp, _ = scenario_mgr.shelter_allocator.assign_evacuees(
        origins=origins,
        shelters=scenario_mgr.shelters,
        minute=payload.minute,
        mode=mode_str,
    )
    for alloc in resp.shelter_allocations:
        s_id = getattr(alloc, "shelter_id", None) or (alloc.get("shelter_id") if isinstance(alloc, dict) else None)
        final_occ = getattr(alloc, "final_occupancy", None) if hasattr(alloc, "final_occupancy") else (alloc.get("final_occupancy") if isinstance(alloc, dict) else None)
        status_val = getattr(alloc, "status", None) if hasattr(alloc, "status") else (alloc.get("status") if isinstance(alloc, dict) else None)
        target = next((s for s in scenario_mgr.shelters if s.id == s_id), None)
        if target:
            if final_occ is not None:
                target.occupancy = final_occ
            if status_val:
                target.status = status_val
    scenario_mgr.build_timeline()
    sync_graph_to_minute(payload.minute)
    return resp



@router.get("/shelters")
def list_shelters() -> List[Dict[str, Any]]:
    snapshot = scenario_mgr.get_snapshot(scenario_mgr.current_minute)
    return snapshot.get("shelters", [s.model_dump() for s in scenario_mgr.shelters])


@router.patch("/shelters/{shelter_id}")
def update_shelter(shelter_id: str, payload: ShelterUpdateRequest) -> Dict[str, Any]:
    target = next((s for s in scenario_mgr.shelters if s.id == shelter_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Shelter not found")

    if payload.capacity is not None:
        target.capacity = payload.capacity
    if payload.status is not None:
        target.status = payload.status

    scenario_mgr.audit_events.append(
        AuditEvent(
            id=f"audit_{len(scenario_mgr.audit_events) + 1}",
            minute=scenario_mgr.current_minute,
            action="shelter_updated",
            details={"shelter_id": shelter_id, "capacity": payload.capacity, "status": payload.status},
        )
    )
    scenario_mgr.build_timeline()
    sync_graph_to_minute(scenario_mgr.current_minute)
    return target.model_dump()


@router.post("/shelters/reset")
def reset_shelters() -> List[Dict[str, Any]]:
    from app.data.seed_data import get_seed_shelters
    scenario_mgr.shelters = get_seed_shelters()
    scenario_mgr.build_timeline()
    sync_graph_to_minute(scenario_mgr.current_minute)
    return [s.model_dump() for s in scenario_mgr.shelters]



@router.get("/reports")
def list_reports(status: Optional[str] = Query(None)) -> List[IncidentReport]:
    return scenario_mgr.incident_verifier.list_reports(status=status)


@router.post("/reports")
def submit_report(payload: ReportSubmitRequest) -> IncidentReport:
    report = scenario_mgr.incident_verifier.submit_report(
        edge_id=payload.edge_id,
        kind=payload.kind,
        reported_minute=payload.reported_minute,
        description=payload.description,
        reporter_hash=payload.reporter_hash,
    )
    # If report was auto-verified, rebuild timeline and sync graph
    if report.status == "verified":
        scenario_mgr.build_timeline()
        sync_graph_to_minute(scenario_mgr.current_minute)
    return report


@router.post("/reports/{report_id}/review")
def review_report(report_id: str, payload: ReviewReportRequest) -> IncidentReport:
    report = scenario_mgr.incident_verifier.review_report(
        report_id=report_id,
        decision=payload.decision,
        notes=payload.notes,
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    # Rebuild scenario timeline to propagate review decision
    scenario_mgr.build_timeline()
    sync_graph_to_minute(scenario_mgr.current_minute)
    return report


@router.get("/metrics/{scenario_id}")
def get_metrics(scenario_id: str) -> Dict[str, Any]:
    if scenario_id != scenario_mgr.scenario_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    snapshot = scenario_mgr.get_snapshot(scenario_mgr.current_minute)
    return {
        "scenario_id": scenario_id,
        "current_minute": scenario_mgr.current_minute,
        "metrics": snapshot.get("metrics", {}),
        "audit_log": scenario_mgr.get_audit_log(),
    }
