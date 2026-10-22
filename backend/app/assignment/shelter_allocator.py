"""Shelter-capacity-aware crowd assignment engine with zero-overbooking guarantee."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple, Union
import networkx as nx

from app.models.schemas import (
    CrowdAssignResponse,
    ShelterAllocation,
    Shelter,
    OriginZone,
    MobilityProfile,
    RouteResponse,
    RouteCandidate,
)
from app.graph.road_network import RoadGraph


class UnassignedInfo(int):
    """Integer count representing unassigned evacuees that also provides dict and attribute access to reason."""

    unassigned: int
    count: int
    reason: str

    def __new__(cls, val: int, reason: str = "") -> "UnassignedInfo":
        clamped = max(0, int(val))
        obj = super().__new__(cls, clamped)
        obj.unassigned = clamped
        obj.count = clamped
        obj.reason = str(reason)
        return obj

    def __getitem__(self, key: str) -> Any:
        if key in ("unassigned", "count"):
            return int(self)
        if key == "reason":
            return self.reason
        raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        if key in ("unassigned", "count"):
            return int(self)
        if key == "reason":
            return self.reason
        return default

    def to_dict(self) -> Dict[str, Any]:
        return {"unassigned": int(self), "count": int(self), "reason": self.reason}

    def __repr__(self) -> str:
        return f"UnassignedInfo(count={int(self)}, reason='{self.reason}')"


class ShelterAllocationItem(dict):
    """Shelter allocation details supporting both dictionary and attribute access."""

    def __init__(
        self,
        shelter_id: str,
        shelter_name: str,
        assigned_count: int,
        final_occupancy: int,
        capacity: int,
        status: str,
        remaining_capacity: Optional[int] = None,
    ) -> None:
        rem = max(0, capacity - final_occupancy) if remaining_capacity is None else max(0, int(remaining_capacity))
        super().__init__(
            shelter_id=shelter_id,
            shelter_name=shelter_name,
            assigned_count=assigned_count,
            final_occupancy=final_occupancy,
            capacity=capacity,
            remaining_capacity=rem,
            status=status,
        )

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(f"'ShelterAllocationItem' object has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value


class ShelterAllocationResult(dict):
    """Structured result dictionary of evacuee assignment to shelters.

    Supports:
      - dict access: result['total_evacuees'], result['shelter_allocations'], etc.
      - attribute access: result.total_evacuees, result.shelter_allocations, etc.
    """

    def __init__(
        self,
        total_evacuees: int,
        total_assigned: int,
        total_unassigned: int,
        shelter_allocations: List[ShelterAllocationItem],
        edge_flows: Dict[str, int],
        unassigned_breakdown: Dict[str, Any],
        unassigned_reasons: Optional[Dict[str, str]] = None,
        overloaded_edges: Optional[List[str]] = None,
        scenario_id: str = "monsoon_demo",
        minute: int = 0,
    ) -> None:
        super().__init__(
            scenario_id=scenario_id,
            minute=minute,
            total_evacuees=total_evacuees,
            total_assigned=total_assigned,
            total_unassigned=total_unassigned,
            shelter_allocations=shelter_allocations,
            edge_flows=edge_flows,
            unassigned_breakdown=unassigned_breakdown,
            unassigned_reasons=unassigned_reasons or {},
            overloaded_edges=overloaded_edges or [],
        )

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(f"'ShelterAllocationResult' object has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value


class ShelterAllocator:
    """Assigns population from evacuation origins to safe shelters respecting capacity limits."""

    def __init__(
        self,
        road_graph: Optional[Any] = None,
        router: Optional[Any] = None,
    ) -> None:
        self.road_graph = road_graph
        self.router = router

    def assign_evacuees(
        self,
        origins: List[Union[Dict[str, Any], OriginZone, Any]],
        shelters: List[Union[Dict[str, Any], Shelter, Any]],
        router: Any = None,
        graph: Any = None,
        mode: str = "walk",
        departure_minute: int = 0,
        minute: Optional[int] = None,
        as_tuple: bool = False,
        **kwargs: Any,
    ) -> Union[ShelterAllocationResult, Tuple[ShelterAllocationResult, Dict[str, int]]]:
        """Assign evacuees to viable candidate shelters with strict zero-overbooking.

        Args:
            origins: List of origin zones (dicts or OriginZone models).
            shelters: List of shelters (dicts or Shelter models).
            router: SafeRouter instance, callable, or None.
            graph: RoadGraph, nx.DiGraph, or None.
            mode: Travel mode ('walk', 'wheelchair', 'vehicle').
            departure_minute: Simulation minute for routing & snapshot.
            minute: Alias for departure_minute.
            as_tuple: If True, returns (result_dict, edge_flows).

        Returns:
            ShelterAllocationResult (dict subclass) containing total_evacuees, total_assigned,
            total_unassigned, shelter_allocations, edge_flows, and unassigned_breakdown.
            If called with legacy signature (minute kwarg or as_tuple=True), returns (result, edge_flows).
        """
        # Resolve legacy parameter ordering and aliases
        should_return_tuple = as_tuple

        # If 3rd parameter is an int, caller used assign_evacuees(origins, shelters, minute, mode)
        if isinstance(router, int):
            departure_minute = router
            if isinstance(graph, str):
                mode = graph
            router = None
            graph = None
            should_return_tuple = True

        if minute is not None:
            departure_minute = minute
            if router is None and graph is None:
                should_return_tuple = True

        if isinstance(mode, MobilityProfile):
            mode_str = mode.value
        else:
            mode_str = str(mode).lower()

        # Resolve graph
        effective_graph = graph if graph is not None else self.road_graph

        # Resolve router
        effective_router = router if router is not None else self.router
        if effective_router is None and effective_graph is not None:
            from app.routing.router import SafeRouter
            effective_router = SafeRouter(effective_graph)

        # 1. Normalize shelters into internal tracking state
        shelter_state: Dict[str, Dict[str, Any]] = {}
        for s in shelters:
            s_id = str(self._get_val(s, "id", self._get_val(s, "shelter_id", "")))
            s_name = str(self._get_val(s, "name", self._get_val(s, "shelter_name", s_id)))
            cap = int(self._get_val(s, "capacity", 0))
            occ = int(self._get_val(s, "occupancy", 0))
            # Strict rule: occupancy clamped to at most capacity
            occ = min(occ, cap)
            accessible = bool(self._get_val(s, "accessible", True))
            status = str(self._get_val(s, "status", "open")).lower()
            lon = self._get_val(s, "lon", None)
            lat = self._get_val(s, "lat", None)
            node_id = self._get_val(s, "node_id", self._get_val(s, "node", None))

            # Auto-resolve node_id from coordinates or id if needed
            if not node_id and effective_graph is not None:
                if lon is not None and lat is not None and hasattr(effective_graph, "find_nearest_node"):
                    node_id = effective_graph.find_nearest_node(float(lon), float(lat))
                elif hasattr(effective_graph, "nodes_dict") and s_id in effective_graph.nodes_dict:
                    node_id = s_id
                elif hasattr(effective_graph, "graph") and s_id in effective_graph.graph:
                    node_id = s_id
                elif isinstance(effective_graph, nx.Graph) and s_id in effective_graph:
                    node_id = s_id

            shelter_state[s_id] = {
                "id": s_id,
                "name": s_name,
                "capacity": cap,
                "occupancy": occ,
                "accessible": accessible,
                "status": "full" if occ >= cap else status,
                "node_id": node_id,
                "lon": lon,
                "lat": lat,
                "assigned_count": 0,
            }

        # 2. Track global metrics
        edge_flows: Dict[str, int] = {}
        total_evacuees = 0
        total_assigned = 0
        unassigned_breakdown: Dict[str, UnassignedInfo] = {}
        unassigned_reasons: Dict[str, str] = {}

        # 3. Process each origin zone
        for o in origins:
            o_id = str(self._get_val(o, "id", self._get_val(o, "origin_id", "")))
            pop = int(self._get_val(o, "population", self._get_val(o, "pop", 0)))
            total_evacuees += pop

            if pop <= 0:
                continue

            unassigned_pop = pop
            o_node = self._get_val(o, "node_id", self._get_val(o, "node", None))
            o_lon = self._get_val(o, "lon", None)
            o_lat = self._get_val(o, "lat", None)

            if not o_node and effective_graph is not None:
                if o_lon is not None and o_lat is not None and hasattr(effective_graph, "find_nearest_node"):
                    o_node = effective_graph.find_nearest_node(float(o_lon), float(o_lat))
                elif hasattr(effective_graph, "nodes_dict") and o_id in effective_graph.nodes_dict:
                    o_node = o_id
                elif hasattr(effective_graph, "graph") and o_id in effective_graph.graph:
                    o_node = o_id
                elif isinstance(effective_graph, nx.Graph) and o_id in effective_graph:
                    o_node = o_id

            # Find candidate shelters: open, remaining capacity > 0, and accessible if wheelchair mode
            open_candidate_shelters: List[Dict[str, Any]] = []
            had_any_capacity = False

            for s_id, s_data in shelter_state.items():
                if s_data["status"] in ("closed", "full"):
                    continue
                rem_cap = s_data["capacity"] - s_data["occupancy"]
                if rem_cap <= 0:
                    continue

                had_any_capacity = True

                # Wheelchair accessibility filter
                if mode_str == "wheelchair" and not s_data["accessible"]:
                    continue

                if not s_data["node_id"]:
                    continue

                open_candidate_shelters.append(s_data)

            # Plan routes to candidate shelters and identify viable ones
            viable_candidates: List[Dict[str, Any]] = []
            for s_data in open_candidate_shelters:
                dest_node = s_data["node_id"]
                route_info = self._plan_candidate_route(
                    router=effective_router,
                    graph=effective_graph,
                    origin_node=o_node,
                    destination_node=dest_node,
                    mode=mode_str,
                    minute=departure_minute,
                )
                if route_info is not None:
                    viable_candidates.append({
                        "shelter_id": s_data["id"],
                        "travel_time": route_info["travel_time_s"],
                        "distance": route_info["distance_m"],
                        "path_edges": route_info["path_edges"],
                    })

            # Sort viable candidates by route travel time, then distance
            viable_candidates.sort(key=lambda c: (c["travel_time"], c["distance"]))

            # Allocate evacuees in batches across sorted viable shelters
            any_reachable_shelters = len(viable_candidates) > 0
            for cand in viable_candidates:
                if unassigned_pop <= 0:
                    break

                s_data = shelter_state[cand["shelter_id"]]
                rem_cap = s_data["capacity"] - s_data["occupancy"]
                if rem_cap <= 0:
                    continue

                # Batch allocation bounded by remaining capacity
                allocated = min(unassigned_pop, rem_cap)
                s_data["occupancy"] += allocated
                s_data["assigned_count"] += allocated
                unassigned_pop -= allocated
                total_assigned += allocated

                # Track flow along traversed edges
                for edge_id in cand["path_edges"]:
                    edge_flows[edge_id] = edge_flows.get(edge_id, 0) + allocated

                # Mark full if capacity reached
                if s_data["occupancy"] >= s_data["capacity"]:
                    s_data["status"] = "full"

            # Check if any population remains unassigned from this origin
            if unassigned_pop > 0:
                if not had_any_capacity:
                    reason = "shelters full"
                elif not any_reachable_shelters:
                    reason = "no passable route"
                else:
                    # Shelters were reachable, but filled up during allocation
                    reason = "shelters full"

                info = UnassignedInfo(unassigned_pop, reason=reason)
                unassigned_breakdown[o_id] = info
                unassigned_reasons[o_id] = reason

        # 4. Construct final shelter allocations list
        shelter_allocations: List[ShelterAllocationItem] = []
        for s_id, s_data in shelter_state.items():
            cap = s_data["capacity"]
            occ = s_data["occupancy"]
            rem = max(0, cap - occ)
            status = "full" if occ >= cap else s_data["status"]
            allocations_item = ShelterAllocationItem(
                shelter_id=s_id,
                shelter_name=s_data["name"],
                assigned_count=s_data["assigned_count"],
                final_occupancy=occ,
                capacity=cap,
                remaining_capacity=rem,
                status=status,
            )
            shelter_allocations.append(allocations_item)

        # 5. Identify overloaded edges (flow > capacity)
        overloaded_edges: List[str] = []
        for edge_id, flow in edge_flows.items():
            cap = 400
            if effective_graph is not None and hasattr(effective_graph, "get_edge"):
                edge_obj = effective_graph.get_edge(edge_id)
                if edge_obj:
                    cap = getattr(edge_obj, "capacity", 400)
            if flow > cap:
                overloaded_edges.append(edge_id)

        # 6. Package summary result
        total_unassigned = total_evacuees - total_assigned
        result = ShelterAllocationResult(
            total_evacuees=total_evacuees,
            total_assigned=total_assigned,
            total_unassigned=total_unassigned,
            shelter_allocations=shelter_allocations,
            edge_flows=edge_flows,
            unassigned_breakdown=unassigned_breakdown,
            unassigned_reasons=unassigned_reasons,
            overloaded_edges=overloaded_edges,
            scenario_id="monsoon_demo",
            minute=departure_minute,
        )

        if should_return_tuple:
            return result, edge_flows
        return result

    @staticmethod
    def _get_val(obj: Any, key: str, default: Any = None) -> Any:
        """Helper to get a property from a dict or object attribute."""
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    def _plan_candidate_route(
        self,
        router: Any,
        graph: Any,
        origin_node: Optional[str],
        destination_node: Optional[str],
        mode: str,
        minute: int,
    ) -> Optional[Dict[str, Any]]:
        """Plan route between origin and shelter nodes using router or graph fallback."""
        if not origin_node or not destination_node:
            return None

        # Try using router instance if available
        if router is not None:
            if hasattr(router, "plan_route"):
                try:
                    route_resp = router.plan_route(
                        origin_id=origin_node,
                        destination_id=destination_node,
                        mode=mode,
                        departure_minute=minute,
                    )
                    if isinstance(route_resp, RouteResponse):
                        if route_resp.status == "route_found" and route_resp.primary_route:
                            return {
                                "travel_time_s": route_resp.primary_route.estimated_duration_s,
                                "distance_m": route_resp.primary_route.distance_m,
                                "path_edges": route_resp.primary_route.path_edges,
                            }
                        return None
                    elif isinstance(route_resp, dict):
                        if route_resp.get("status") in ("route_found", "ok", "success", True) and "primary_route" in route_resp:
                            pr = route_resp["primary_route"]
                            return {
                                "travel_time_s": pr.get("estimated_duration_s", pr.get("travel_time_s", 60.0)),
                                "distance_m": pr.get("distance_m", 100.0),
                                "path_edges": pr.get("path_edges", []),
                            }
                        return None
                except Exception:
                    pass
            elif callable(router):
                try:
                    route_resp = router(origin_node, destination_node, mode, minute)
                    if isinstance(route_resp, dict) and route_resp.get("status") in ("route_found", "ok", True):
                        return {
                            "travel_time_s": route_resp.get("travel_time_s", 60.0),
                            "distance_m": route_resp.get("distance_m", 100.0),
                            "path_edges": route_resp.get("path_edges", []),
                        }
                except Exception:
                    pass

        # Fallback to direct NetworkX routing on graph traversable subgraph
        if graph is not None:
            try:
                if hasattr(graph, "get_traversable_subgraph"):
                    subgraph = graph.get_traversable_subgraph(mode=mode)
                elif hasattr(graph, "graph"):
                    subgraph = graph.graph
                elif isinstance(graph, nx.DiGraph):
                    subgraph = graph
                else:
                    return None

                if nx.has_path(subgraph, origin_node, destination_node):
                    path_nodes = nx.dijkstra_path(subgraph, origin_node, destination_node, weight="travel_time_s")
                    path_edges: List[str] = []
                    total_time = 0.0
                    total_dist = 0.0

                    for i in range(len(path_nodes) - 1):
                        u, v = path_nodes[i], path_nodes[i + 1]
                        edata = subgraph[u][v]
                        e_id = edata.get("edge_id")
                        if not e_id:
                            e_id = f"E_{u}_{v}"
                        path_edges.append(e_id)
                        total_time += edata.get("travel_time_s", 60.0)
                        total_dist += edata.get("length_m", 100.0)

                    return {
                        "travel_time_s": total_time,
                        "distance_m": total_dist,
                        "path_edges": path_edges,
                    }
            except (nx.NetworkXNoPath, nx.NodeNotFound, KeyError):
                return None

        return None
