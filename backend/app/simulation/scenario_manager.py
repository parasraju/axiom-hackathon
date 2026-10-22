"""Scenario Manager orchestrating road graph, flood simulation, crowd flow, and audit logs."""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional, Set

from app.models.schemas import (
    RoadNode,
    RoadEdge,
    Shelter,
    OriginZone,
    ScenarioEvent,
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
from app.graph.road_network import RoadGraph
from app.simulation.flood_model import FloodSimulator
from app.simulation.congestion import CongestionModel
from app.assignment.shelter_allocator import ShelterAllocator
from app.reports.verifier import IncidentVerifier


class ScenarioManager:
    """Orchestrates disaster simulation state across discrete time steps."""

    def __init__(self, scenario_id: str = "monsoon_demo") -> None:
        self.scenario_id = scenario_id
        self.current_minute = 0
        self.road_graph = RoadGraph()
        self.flood_sim = FloodSimulator()
        self.congestion_model = CongestionModel()
        self.shelter_allocator = ShelterAllocator(self.road_graph)
        self.incident_verifier = IncidentVerifier()

        # Seed configuration
        self.nodes = get_seed_nodes()
        self.edges = get_seed_edges()
        self.shelters = get_seed_shelters()
        self.origins = get_seed_origins()
        self.events = get_seed_scenario_events()

        # Manual overrides (edge_id -> is_open)
        self.manual_closures: Dict[str, bool] = {}
        self.audit_events: List[AuditEvent] = []
        self.timeline_cache: Dict[int, Dict[str, Any]] = {}

        # Initialize graph and precompute timeline
        self.road_graph.load_network(self.nodes, self.edges)
        self.build_timeline()

    def build_timeline(self, minutes: Optional[List[int]] = None) -> List[Dict[str, Any]]:
        """Precompute deterministic snapshots for [0, 15, 30, 45, 60, 75, 90] min."""
        if minutes is None:
            minutes = [0, 15, 30, 45, 60, 75, 90]

        timeline_results: List[Dict[str, Any]] = []

        for m in minutes:
            # 1. Reset working graph states
            self.road_graph.load_network(self.nodes, self.edges)

            # 2. Compute flood depths on all edges
            edge_dicts = [e.model_dump() for e in self.edges]
            flood_edge_states = self.flood_sim.compute_edge_states(m, edge_dicts)

            # 3. Apply flood status to graph
            for edge_id, f_state in flood_edge_states.items():
                self.road_graph.update_edge_state(
                    edge_id,
                    flood_depth_m=f_state["flood_depth_m"],
                    status=f_state["status"],
                )

            # 4. Apply scheduled scenario events up to minute m
            for ev in self.events:
                if ev.minute <= m:
                    if ev.event_type == "road_close":
                        self.road_graph.update_edge_state(ev.target_id, is_open=False, status="closed")

            # 5. Apply operator manual closures and verified incident closures
            verified_blocked = self.incident_verifier.get_verified_blocked_edges()
            for edge_id in verified_blocked:
                self.road_graph.update_edge_state(edge_id, is_open=False, status="closed")

            for edge_id, is_open in self.manual_closures.items():
                self.road_graph.update_edge_state(
                    edge_id,
                    is_open=is_open,
                    status="closed" if not is_open else "normal",
                )

            # 6. Run crowd assignment to shelters
            curr_shelters = [s.model_copy() for s in self.shelters]
            curr_origins = [o.model_copy() for o in self.origins]

            # Adjust origin demand if scheduled event occurred
            for ev in self.events:
                if ev.minute <= m and ev.event_type == "demand_increase":
                    for o in curr_origins:
                        if o.id == ev.target_id:
                            o.population += int(ev.value)

            assign_resp, edge_flows = self.shelter_allocator.assign_evacuees(
                curr_origins, curr_shelters, minute=m, mode="walk"
            )

            # 7. Run congestion model on edge flows
            edges_for_congestion = []
            for edge in self.edges:
                runtime = self.road_graph.edge_runtime.get(edge.id, {})
                edges_for_congestion.append(
                    {
                        "id": edge.id,
                        "capacity": edge.capacity,
                        "baseline_travel_time_s": runtime.get("baseline_travel_time_s", 60.0),
                    }
                )

            congestion_results = self.congestion_model.update_congestion(edges_for_congestion, edge_flows)

            # Update congestion in graph
            for edge_id, c_metrics in congestion_results.items():
                self.road_graph.update_edge_state(
                    edge_id,
                    congestion_ratio=c_metrics["congestion_ratio"],
                    travel_time_s=c_metrics["travel_time_s"],
                )

            # 8. Package complete GeoJSON & Snapshot
            edges_geojson = self.road_graph.to_geojson()
            flood_geojson = self.flood_sim.get_flood_geojson(m)

            updated_shelters = []
            for alloc in assign_resp.shelter_allocations:
                # Find matching shelter object
                base_s = next((s for s in self.shelters if s.id == alloc.shelter_id), None)
                if base_s:
                    s_copy = base_s.model_copy()
                    s_copy.occupancy = alloc.final_occupancy
                    s_copy.status = alloc.status
                    updated_shelters.append(s_copy.model_dump())

            snapshot = {
                "scenario_id": self.scenario_id,
                "minute": m,
                "edges_geojson": edges_geojson,
                "flood_geojson": flood_geojson,
                "shelters": updated_shelters,
                "origins": [o.model_dump() for o in curr_origins],
                "active_incidents": [r.model_dump() for r in self.incident_verifier.list_reports()],
                "metrics": {
                    "total_evacuees": assign_resp.total_evacuees,
                    "assigned_count": assign_resp.total_assigned,
                    "unassigned_count": assign_resp.total_unassigned,
                    "overloaded_edges_count": len(assign_resp.overloaded_edges),
                    "overloaded_edges": assign_resp.overloaded_edges,
                    "unassigned_reasons": assign_resp.unassigned_reasons,
                },
            }

            self.timeline_cache[m] = snapshot
            timeline_results.append(snapshot)

        return timeline_results

    def get_timeline(self) -> List[Dict[str, Any]]:
        """Return the precomputed timeline list sorted by simulation minute."""
        return [self.timeline_cache[m] for m in sorted(self.timeline_cache.keys())]

    def get_snapshot(self, minute: int) -> Dict[str, Any]:
        """Return snapshot for minute, snapping to closest available keyframe."""
        if minute in self.timeline_cache:
            return self.timeline_cache[minute]

        # Snap to closest precomputed minute
        available = sorted(self.timeline_cache.keys())
        closest = min(available, key=lambda x: abs(x - minute))
        return self.timeline_cache[closest]

    def advance_time(self, minute: int) -> Dict[str, Any]:
        """Advance authoritative clock to given minute."""
        self.current_minute = minute
        self.audit_events.append(
            AuditEvent(
                id=f"audit_{len(self.audit_events) + 1}",
                minute=minute,
                action="simulation_advanced",
                details={"target_minute": minute},
            )
        )
        return self.get_snapshot(minute)

    def toggle_edge_closure(self, edge_id: str, is_open: bool, reason: str = "operator override") -> Dict[str, Any]:
        """Operator manual road closure override, invalidates and recalculates timeline."""
        self.manual_closures[edge_id] = is_open
        self.audit_events.append(
            AuditEvent(
                id=f"audit_{len(self.audit_events) + 1}",
                minute=self.current_minute,
                action="manual_edge_closure_toggle",
                details={"edge_id": edge_id, "is_open": is_open, "reason": reason},
            )
        )
        # Recompute timeline to reflect manual closure across snapshots
        self.build_timeline()
        return self.get_snapshot(self.current_minute)

    def reset(self) -> Dict[str, Any]:
        """Reset scenario state back to minute 0."""
        self.current_minute = 0
        self.manual_closures.clear()
        self.audit_events.append(
            AuditEvent(
                id=f"audit_{len(self.audit_events) + 1}",
                minute=0,
                action="scenario_reset",
                details={},
            )
        )
        self.build_timeline()
        return self.get_snapshot(0)

    def get_audit_log(self) -> List[Dict[str, Any]]:
        return [e.model_dump() for e in self.audit_events]
