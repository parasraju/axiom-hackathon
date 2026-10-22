"""Scenario Manager orchestrating road graph, flood simulation, crowd flow, routing, and audit logs."""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional, Set, Union

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
from app.routing.router import SafeRouter
from app.reports.verifier import IncidentVerifier


class ScenarioManager:
    """Orchestrates disaster simulation state across discrete time steps."""

    def __init__(self, scenario_id: str = "monsoon_demo") -> None:
        self.scenario_id: str = scenario_id
        self.current_minute: int = 0
        self.road_graph: RoadGraph = RoadGraph()
        self.flood_sim: FloodSimulator = FloodSimulator()
        self.congestion_model: CongestionModel = CongestionModel()
        self.shelter_allocator: ShelterAllocator = ShelterAllocator(self.road_graph)
        self.router: SafeRouter = SafeRouter(self.road_graph)
        self.incident_verifier: IncidentVerifier = IncidentVerifier()

        # Seed configuration
        self.nodes: List[RoadNode] = get_seed_nodes()
        self.edges: List[RoadEdge] = get_seed_edges()
        self.shelters: List[Shelter] = get_seed_shelters()
        self.origins: List[OriginZone] = get_seed_origins()
        self.events: List[ScenarioEvent] = get_seed_scenario_events()

        # Manual overrides (edge_id -> is_open)
        self.manual_closures: Dict[str, bool] = {}
        self.audit_log: List[Dict[str, Any]] = []
        self.audit_events: List[AuditEvent] = []
        self.timeline_cache: Dict[int, Dict[str, Any]] = {}
        self.timeline_by_scenario: Dict[str, Dict[int, Dict[str, Any]]] = {}

        # Initialize graph and precompute timeline
        self.road_graph.load_network(self.nodes, self.edges)
        self.build_timeline(self.scenario_id)

    @property
    def active_minute(self) -> int:
        return self.current_minute

    @active_minute.setter
    def active_minute(self, value: int) -> None:
        self.current_minute = int(value)

    def build_timeline(
        self,
        scenario_id: str = "monsoon_demo",
        minutes: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Precomputes deterministic snapshots for each interval in minutes.

        For each minute t:
          - Calculate flood depths and edge status (normal/caution/closed)
          - Apply manual road closures and verified incident closures
          - Run crowd allocation to calculate shelter occupancy and edge flows
          - Run congestion model to calculate delay and bottlenecks
          - Package complete snapshot:
            {
              'scenario_id': scenario_id,
              'minute': t,
              'edges_geojson': FeatureCollection of road edges with properties
                               (id, status, flood_depth_m, congestion_ratio,
                                travel_time_s, color: 'green'|'amber'|'red',
                                is_passable),
              'flood_geojson': FeatureCollection of flood polygons at minute t,
              'shelters': list of shelter states (id, name, capacity, occupancy,
                                                  status, accessible),
              'origins': list of origin zones with population,
              'metrics': {
                'total_evacuees': total_evacuees,
                'assigned_count': assigned_count,
                'unassigned_count': unassigned_count,
                'bottleneck_edges_count': len(bottlenecks),
                'closed_edges_count': len(closed_edges)
              }
            }
        Caches these snapshots for instant retrieval.
        """
        if minutes is None:
            minutes = [0, 15, 30, 45, 60, 75, 90]

        timeline_results: List[Dict[str, Any]] = []
        scenario_cache: Dict[int, Dict[str, Any]] = {}

        for m in minutes:
            # 1. Reset working graph states from base nodes and edges
            self.road_graph.load_network(self.nodes, self.edges)

            # 2. Compute flood depths and statuses across all road edges
            edge_dicts = [e.model_dump() for e in self.edges]
            flood_edge_states = self.flood_sim.compute_edge_states(m, edge_dicts)

            for edge_id, f_state in flood_edge_states.items():
                self.road_graph.update_edge_state(
                    edge_id,
                    flood_depth_m=f_state["flood_depth_m"],
                    status=f_state["status"],
                )

            # 3. Apply scheduled scenario events up to minute m
            for ev in self.events:
                if ev.minute <= m:
                    if ev.event_type == "road_close":
                        self.road_graph.update_edge_state(
                            ev.target_id, is_open=False, status="closed"
                        )

            # 4. Apply verified incident closures and manual road closures
            verified_blocked = self.incident_verifier.get_verified_blocked_edges()
            for edge_id in verified_blocked:
                self.road_graph.update_edge_state(
                    edge_id, is_open=False, status="closed"
                )

            for edge_id, is_open in self.manual_closures.items():
                self.road_graph.update_edge_state(
                    edge_id,
                    is_open=is_open,
                    status="normal" if is_open else "closed",
                )

            # 5. Run crowd allocation to calculate shelter occupancy and edge flows
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

            # 6. Run congestion model to calculate delay and bottlenecks
            edges_for_congestion = []
            for edge in self.edges:
                runtime = self.road_graph.edge_runtime.get(edge.id, {})
                edges_for_congestion.append(
                    {
                        "id": edge.id,
                        "capacity": edge.capacity,
                        "baseline_travel_time_s": runtime.get(
                            "baseline_travel_time_s", 60.0
                        ),
                    }
                )

            congestion_results = self.congestion_model.update_congestion(
                edges_for_congestion, edge_flows
            )

            for edge_id, c_metrics in congestion_results.items():
                self.road_graph.update_edge_state(
                    edge_id,
                    congestion_ratio=c_metrics["congestion_ratio"],
                    travel_time_s=c_metrics["travel_time_s"],
                )

            bottlenecks = self.congestion_model.get_bottlenecks(congestion_results)

            # 7. Identify closed edges
            closed_edges: List[str] = []
            for edge in self.edges:
                runtime = self.road_graph.edge_runtime.get(edge.id, {})
                is_open = runtime.get("is_open", edge.is_open)
                depth = runtime.get("flood_depth_m", 0.0)
                stat = runtime.get("status", "normal")
                if not is_open or stat == "closed" or depth > edge.flood_threshold_m:
                    closed_edges.append(edge.id)

            # 8. Package edges_geojson FeatureCollection
            edge_features = []
            edge_states_dict = {}
            for edge in self.edges:
                runtime = self.road_graph.edge_runtime.get(edge.id, {})
                status = runtime.get("status", "normal")
                is_open = runtime.get("is_open", edge.is_open)
                flood_depth = runtime.get("flood_depth_m", 0.0)
                congestion = runtime.get("congestion_ratio", 0.0)
                travel_time = runtime.get(
                    "travel_time_s", runtime.get("baseline_travel_time_s", 60.0)
                )

                if (
                    not is_open
                    or flood_depth > edge.flood_threshold_m
                    or status == "closed"
                ):
                    color = "red"
                    status_label = "closed"
                    is_passable = False
                elif status == "caution" or flood_depth >= 0.05 or congestion >= 0.8:
                    color = "amber"
                    status_label = "caution"
                    is_passable = True
                else:
                    color = "green"
                    status_label = "normal"
                    is_passable = True

                geom = edge.geometry
                if not isinstance(geom, dict) or not geom.get("coordinates"):
                    from_node = self.road_graph.nodes_dict.get(edge.from_node)
                    to_node = self.road_graph.nodes_dict.get(edge.to_node)
                    if from_node and to_node:
                        geom = {
                            "type": "LineString",
                            "coordinates": [
                                [from_node.lon, from_node.lat],
                                [to_node.lon, to_node.lat],
                            ],
                        }
                    else:
                        geom = {"type": "LineString", "coordinates": []}

                edge_features.append(
                    {
                        "type": "Feature",
                        "id": edge.id,
                        "geometry": geom,
                        "properties": {
                            "id": edge.id,
                            "from_node": edge.from_node,
                            "to_node": edge.to_node,
                            "length_m": round(float(edge.length_m), 1),
                            "status": status_label,
                            "flood_depth_m": round(flood_depth, 3),
                            "congestion_ratio": round(congestion, 2),
                            "travel_time_s": round(travel_time, 1),
                            "color": color,
                            "is_passable": is_passable,
                            "is_open": is_open,
                            "has_stairs": bool(edge.has_stairs),
                            "capacity": int(edge.capacity),
                            "entity_type": "edge",
                        },
                    }
                )

                edge_states_dict[edge.id] = {
                    "edge_id": edge.id,
                    "minute": m,
                    "flood_depth_m": round(flood_depth, 3),
                    "congestion_ratio": round(congestion, 2),
                    "status": status_label,
                    "travel_time_s": round(travel_time, 1),
                    "is_passable": is_passable,
                    "is_simulated": True,
                }

            edges_geojson = {"type": "FeatureCollection", "features": edge_features}
            flood_geojson = self.flood_sim.get_flood_geojson(m)

            # 9. Package shelter states
            updated_shelters = []
            for alloc in assign_resp.shelter_allocations:
                base_s = next(
                    (s for s in self.shelters if s.id == alloc.shelter_id), None
                )
                if base_s:
                    s_copy = base_s.model_copy()
                    s_copy.occupancy = alloc.final_occupancy
                    s_copy.status = alloc.status
                    updated_shelters.append(s_copy.model_dump())
                else:
                    updated_shelters.append(
                        {
                            "id": alloc.shelter_id,
                            "name": alloc.shelter_name,
                            "capacity": alloc.capacity,
                            "occupancy": alloc.final_occupancy,
                            "status": alloc.status,
                            "accessible": True,
                        }
                    )

            # 10. Package metrics
            metrics = {
                "total_evacuees": assign_resp.total_evacuees,
                "assigned_count": assign_resp.total_assigned,
                "unassigned_count": assign_resp.total_unassigned,
                "bottleneck_edges_count": len(bottlenecks),
                "closed_edges_count": len(closed_edges),
                "bottleneck_edges": bottlenecks,
                "closed_edges": closed_edges,
                "overloaded_edges_count": len(bottlenecks),
                "overloaded_edges": bottlenecks,
                "unassigned_reasons": assign_resp.unassigned_reasons,
            }

            snapshot = {
                "scenario_id": scenario_id,
                "minute": m,
                "edges_geojson": edges_geojson,
                "flood_geojson": flood_geojson,
                "shelters": updated_shelters,
                "origins": [o.model_dump() for o in curr_origins],
                "metrics": metrics,
                "active_incidents": [
                    r.model_dump() for r in self.incident_verifier.list_reports()
                ],
                "edge_states": edge_states_dict,
            }

            scenario_cache[m] = snapshot
            self.timeline_cache[m] = snapshot
            timeline_results.append(snapshot)

        self.timeline_by_scenario[scenario_id] = scenario_cache
        return timeline_results

    def get_timeline(self, scenario_id: str = "monsoon_demo") -> List[Dict[str, Any]]:
        """Return the precomputed snapshots list."""
        if scenario_id in self.timeline_by_scenario:
            cache = self.timeline_by_scenario[scenario_id]
            return [cache[m] for m in sorted(cache.keys())]
        return [self.timeline_cache[m] for m in sorted(self.timeline_cache.keys())]

    def get_snapshot(
        self,
        scenario_id_or_minute: Any = "monsoon_demo",
        minute: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Return snapshot for minute t, snapping to closest available keyframe."""
        if isinstance(scenario_id_or_minute, int):
            target_minute = scenario_id_or_minute
            scen_id = self.scenario_id
        else:
            scen_id = str(scenario_id_or_minute or self.scenario_id)
            target_minute = minute if minute is not None else self.current_minute

        cache = self.timeline_by_scenario.get(scen_id, self.timeline_cache)
        if not cache:
            self.build_timeline(scen_id)
            cache = self.timeline_by_scenario.get(scen_id, self.timeline_cache)

        if target_minute in cache:
            return cache[target_minute]

        available = sorted(cache.keys())
        if not available:
            return {}
        closest = min(available, key=lambda x: abs(x - target_minute))
        return cache[closest]

    def advance_time(
        self,
        scenario_id_or_minute: Any = "monsoon_demo",
        minute: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Update current active minute and log audit event."""
        if isinstance(scenario_id_or_minute, int):
            target_minute = scenario_id_or_minute
            scen_id = self.scenario_id
        else:
            scen_id = str(scenario_id_or_minute or self.scenario_id)
            target_minute = minute if minute is not None else self.current_minute

        self.current_minute = target_minute

        audit_rec = {
            "id": f"audit_{len(self.audit_log) + 1}",
            "minute": target_minute,
            "action": "simulation_advanced",
            "scenario_id": scen_id,
            "details": {"target_minute": target_minute},
        }
        self.audit_log.append(audit_rec)
        self.audit_events.append(
            AuditEvent(
                id=audit_rec["id"],
                minute=target_minute,
                action="simulation_advanced",
                details=audit_rec["details"],
            )
        )
        return self.get_snapshot(scen_id, target_minute)

    def toggle_edge_closure(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Update edge closure, invalidate/recompute snapshots, and log audit event.

        Supports flexible call signatures:
          - toggle_edge_closure(scenario_id, edge_id, is_open, reason)
          - toggle_edge_closure(edge_id, is_open, reason)
          - toggle_edge_closure(edge_id=..., is_open=..., reason=...)
        """
        scen_id = self.scenario_id
        reason = kwargs.get("reason", "operator override")

        if (
            len(args) >= 3
            and isinstance(args[0], str)
            and isinstance(args[1], str)
            and isinstance(args[2], bool)
        ):
            scen_id = args[0]
            edge_id = args[1]
            is_open = args[2]
            if len(args) >= 4:
                reason = str(args[3])
        elif len(args) >= 2 and isinstance(args[0], str) and isinstance(args[1], bool):
            edge_id = args[0]
            is_open = args[1]
            if len(args) >= 3:
                reason = str(args[2])
        else:
            edge_id = kwargs.get("edge_id", "")
            is_open = kwargs.get("is_open", True)
            if "scenario_id" in kwargs:
                scen_id = str(kwargs["scenario_id"])

        self.manual_closures[edge_id] = is_open

        audit_rec = {
            "id": f"audit_{len(self.audit_log) + 1}",
            "minute": self.current_minute,
            "action": "manual_edge_closure_toggle",
            "scenario_id": scen_id,
            "details": {"edge_id": edge_id, "is_open": is_open, "reason": reason},
        }
        self.audit_log.append(audit_rec)
        self.audit_events.append(
            AuditEvent(
                id=audit_rec["id"],
                minute=self.current_minute,
                action="manual_edge_closure_toggle",
                details=audit_rec["details"],
            )
        )

        # Invalidate and recompute snapshots
        self.build_timeline(scen_id)
        return self.get_snapshot(scen_id, self.current_minute)

    def reset_scenario(self, scenario_id: str = "monsoon_demo") -> Dict[str, Any]:
        """Reset scenario state to minute 0 and clear manual closures."""
        self.current_minute = 0
        self.manual_closures.clear()

        audit_rec = {
            "id": f"audit_{len(self.audit_log) + 1}",
            "minute": 0,
            "action": "scenario_reset",
            "scenario_id": scenario_id,
            "details": {},
        }
        self.audit_log.append(audit_rec)
        self.audit_events.append(
            AuditEvent(
                id=audit_rec["id"],
                minute=0,
                action="scenario_reset",
                details={},
            )
        )

        self.build_timeline(scenario_id)
        return self.get_snapshot(scenario_id, 0)

    def reset(self, scenario_id: str = "monsoon_demo") -> Dict[str, Any]:
        """Alias for reset_scenario."""
        return self.reset_scenario(scenario_id)

    def get_audit_log(
        self, scenario_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return audit log events."""
        if scenario_id:
            return [
                dict(rec)
                for rec in self.audit_log
                if rec.get("scenario_id") == scenario_id
                or "scenario_id" not in rec
            ]
        return [dict(rec) for rec in self.audit_log]
