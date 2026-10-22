"""Shelter-capacity-aware crowd assignment engine with zero-overbooking guarantee."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import networkx as nx

from app.models.schemas import (
    CrowdAssignResponse,
    ShelterAllocation,
    Shelter,
    OriginZone,
    MobilityProfile,
)
from app.graph.road_network import RoadGraph


class ShelterAllocator:
    """Assigns population from evacuation origins to safe shelters respecting capacity."""

    def __init__(self, road_graph: RoadGraph) -> None:
        self.road_graph = road_graph

    def assign_evacuees(
        self,
        origins: List[OriginZone],
        shelters: List[Shelter],
        minute: int = 0,
        mode: str = "walk",
    ) -> Tuple[CrowdAssignResponse, Dict[str, int]]:
        """Assign evacuees to candidate shelters, avoiding overbooking and tracking flow."""
        # Create mutable working copies of shelters to track occupancy locally
        shelter_state: Dict[str, Dict[str, Any]] = {}
        for s in shelters:
            shelter_state[s.id] = {
                "name": s.name,
                "capacity": s.capacity,
                "occupancy": s.occupancy,
                "accessible": s.accessible,
                "status": s.status,
                "assigned_new": 0,
                "lon": s.lon,
                "lat": s.lat,
            }

        edge_flows: Dict[str, int] = {}
        total_evacuees = sum(o.population for o in origins)
        total_assigned = 0
        unassigned_reasons: Dict[str, str] = {}

        # Get current traversable graph for this mode
        subgraph = self.road_graph.get_traversable_subgraph(mode=mode)

        # For each origin, sort viable shelters by shortest route distance
        for origin in origins:
            unassigned_in_origin = origin.population
            origin_node = origin.node_id

            # Find candidates that are open and have remaining space
            candidate_shelters: List[Tuple[float, str, List[str]]] = []

            for s_id, s_data in shelter_state.items():
                if s_data["status"] == "closed":
                    continue
                rem_cap = s_data["capacity"] - s_data["occupancy"]
                if rem_cap <= 0:
                    continue
                if mode == "wheelchair" and not s_data["accessible"]:
                    continue

                # Find destination node corresponding to shelter
                shelter_node = self.road_graph.find_nearest_node(s_data["lon"], s_data["lat"])
                if not shelter_node:
                    continue

                if nx.has_path(subgraph, origin_node, shelter_node):
                    try:
                        path = nx.dijkstra_path(subgraph, origin_node, shelter_node, weight="travel_time_s")
                        path_len = sum(
                            subgraph[path[i]][path[i + 1]].get("length_m", 100.0)
                            for i in range(len(path) - 1)
                        )
                        candidate_shelters.append((path_len, s_id, path))
                    except (nx.NetworkXNoPath, nx.NodeNotFound):
                        pass

            # Sort candidate shelters by path length (closest first)
            candidate_shelters.sort(key=lambda x: x[0])

            if not candidate_shelters:
                unassigned_reasons[origin.id] = "No reachable shelter with remaining capacity."
                continue

            # Allocate in batches across available candidates
            for _, s_id, path in candidate_shelters:
                if unassigned_in_origin <= 0:
                    break

                s_data = shelter_state[s_id]
                rem_cap = s_data["capacity"] - s_data["occupancy"]
                if rem_cap <= 0:
                    continue

                batch = min(unassigned_in_origin, rem_cap)
                s_data["occupancy"] += batch
                s_data["assigned_new"] += batch
                unassigned_in_origin -= batch
                total_assigned += batch

                if s_data["occupancy"] >= s_data["capacity"]:
                    s_data["status"] = "full"

                # Trace edges and record flow
                for i in range(len(path) - 1):
                    u, v = path[i], path[i + 1]
                    edge_id = subgraph[u][v].get("edge_id")
                    if edge_id:
                        edge_flows[edge_id] = edge_flows.get(edge_id, 0) + batch

            if unassigned_in_origin > 0:
                unassigned_reasons[origin.id] = (
                    f"Shelter capacities exhausted: {unassigned_in_origin} evacuees could not be sheltered."
                )

        # Build shelter allocation result list
        allocations: List[ShelterAllocation] = []
        for s_id, s_data in shelter_state.items():
            rem = max(0, s_data["capacity"] - s_data["occupancy"])
            status = "full" if rem == 0 else s_data["status"]
            allocations.append(
                ShelterAllocation(
                    shelter_id=s_id,
                    shelter_name=s_data["name"],
                    assigned_count=s_data["assigned_new"],
                    final_occupancy=s_data["occupancy"],
                    capacity=s_data["capacity"],
                    remaining_capacity=rem,
                    status=status,
                )
            )

        # Determine overloaded edges (flow > edge capacity)
        overloaded: List[str] = []
        for edge_id, flow in edge_flows.items():
            edge = self.road_graph.get_edge(edge_id)
            cap = edge.capacity if edge else 400
            if flow > cap:
                overloaded.append(edge_id)

        response = CrowdAssignResponse(
            scenario_id="monsoon_demo",
            minute=minute,
            total_evacuees=total_evacuees,
            total_assigned=total_assigned,
            total_unassigned=total_evacuees - total_assigned,
            shelter_allocations=allocations,
            overloaded_edges=overloaded,
            edge_flows=edge_flows,
            unassigned_reasons=unassigned_reasons,
        )

        return response, edge_flows
