"""Dynamic safe-routing engine with multi-factor costs and resilience scoring."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import networkx as nx

from app.graph.road_network import RoadGraph
from app.models.schemas import RouteResponse, RouteCandidate, MobilityProfile


class SafeRouter:
    """Calculates hazard-aware evacuation routes with alternatives and resilience ratings."""

    def __init__(self, graph: RoadGraph) -> None:
        self.road_graph = graph

    def plan_route(
        self,
        origin_id: str,
        destination_id: str,
        mode: str = "walk",
        departure_minute: int = 0,
        alternatives: int = 2,
    ) -> RouteResponse:
        """Find primary and alternative safe evacuation routes."""
        # Validate existence of origin and destination in graph
        if origin_id not in self.road_graph.nodes_dict:
            return RouteResponse(
                scenario_id="monsoon_demo",
                evaluated_minute=departure_minute,
                status="no_route_found",
                warnings=[f"Origin node '{origin_id}' not found in road network"],
            )

        if destination_id not in self.road_graph.nodes_dict:
            return RouteResponse(
                scenario_id="monsoon_demo",
                evaluated_minute=departure_minute,
                status="no_route_found",
                warnings=[f"Destination node '{destination_id}' not found in road network"],
            )

        # 1. Obtain traversable subgraph (hard constraints applied)
        subgraph = self.road_graph.get_traversable_subgraph(mode=mode)

        if not nx.has_path(subgraph, origin_id, destination_id):
            warnings = ["No verified safe path available."]
            if mode == "wheelchair":
                warnings.append("Accessible step-free paths may be blocked by flood waters or stairs.")
            else:
                warnings.append("All connecting road segments are impassable due to flood depth or closures.")

            return RouteResponse(
                scenario_id="monsoon_demo",
                evaluated_minute=departure_minute,
                status="no_route_found",
                warnings=warnings,
                data_freshness={
                    "scenario_snapshot_minute": departure_minute,
                    "is_simulated": True,
                },
            )

        # 2. Define edge weight function for safe routing
        def edge_weight(u: str, v: str, d: Dict[str, Any]) -> float:
            base_time = d.get("travel_time_s", 60.0)
            congestion = d.get("congestion_ratio", 0.0)
            status = d.get("status", "normal")

            # Soft hazard penalty: avoid caution edges unless necessary
            hazard_penalty = 300.0 if status == "caution" else 0.0
            return (base_time * (1.0 + congestion * 1.5)) + hazard_penalty

        # 3. Find primary path using Dijkstra
        try:
            primary_nodes = nx.dijkstra_path(subgraph, origin_id, destination_id, weight=edge_weight)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return RouteResponse(
                scenario_id="monsoon_demo",
                evaluated_minute=departure_minute,
                status="no_route_found",
                warnings=["Path calculation failed due to disconnected network components."],
            )

        primary_candidate = self._build_candidate("route_primary", primary_nodes, subgraph)

        # 4. Find alternative paths by penalizing primary edges
        candidate_alternatives: List[RouteCandidate] = []
        alt_subgraph = subgraph.copy()

        for alt_idx in range(1, alternatives + 1):
            # Penalize edges of already discovered routes
            for i in range(len(primary_nodes) - 1):
                u, v = primary_nodes[i], primary_nodes[i + 1]
                if alt_subgraph.has_edge(u, v):
                    alt_subgraph[u][v]["travel_time_s"] = alt_subgraph[u][v].get("travel_time_s", 60.0) * 3.5

            try:
                alt_nodes = nx.dijkstra_path(alt_subgraph, origin_id, destination_id, weight=edge_weight)
                # Ensure it's not identical to primary
                if alt_nodes != primary_nodes and alt_nodes not in [c.path_nodes for c in candidate_alternatives]:
                    candidate = self._build_candidate(f"route_alt_{alt_idx}", alt_nodes, subgraph)
                    candidate_alternatives.append(candidate)
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                break

        return RouteResponse(
            scenario_id="monsoon_demo",
            evaluated_minute=departure_minute,
            status="route_found",
            primary_route=primary_candidate,
            alternatives=candidate_alternatives,
            warnings=primary_candidate.warnings,
            data_freshness={
                "scenario_snapshot_minute": departure_minute,
                "is_simulated": True,
            },
        )

    def _build_candidate(
        self,
        route_id: str,
        node_ids: List[str],
        graph: nx.DiGraph,
    ) -> RouteCandidate:
        """Construct a structured RouteCandidate from a sequence of nodes."""
        path_edges: List[str] = []
        coordinates: List[List[float]] = []
        total_distance_m = 0.0
        total_duration_s = 0.0
        caution_count = 0
        congested_count = 0
        warnings: List[str] = []

        # Add origin node coord
        if node_ids:
            first_node = self.road_graph.nodes_dict.get(node_ids[0])
            if first_node:
                coordinates.append([first_node.lon, first_node.lat])

        for i in range(len(node_ids) - 1):
            u, v = node_ids[i], node_ids[i + 1]
            edge_data = graph[u][v]
            edge_id = edge_data.get("edge_id", f"E_{u}_{v}")
            path_edges.append(edge_id)

            total_distance_m += edge_data.get("length_m", 0.0)
            total_duration_s += edge_data.get("travel_time_s", 0.0)

            # Check hazards
            status = edge_data.get("status", "normal")
            if status == "caution":
                caution_count += 1
            if edge_data.get("congestion_ratio", 0.0) >= 0.8:
                congested_count += 1

            # Append segment geometry if available
            geom = edge_data.get("geometry", {})
            seg_coords = geom.get("coordinates", [])
            if seg_coords:
                for pt in seg_coords[1:]:
                    coordinates.append(pt)
            else:
                next_node = self.road_graph.nodes_dict.get(v)
                if next_node:
                    coordinates.append([next_node.lon, next_node.lat])

        # Calculate heuristic resilience score (0-100)
        resilience = 100 - (caution_count * 15) - (congested_count * 10)
        resilience = max(10, min(100, resilience))

        if caution_count > 0:
            hazard_level = "moderate"
            warnings.append(f"Route crosses {caution_count} segment(s) under caution/minor waterlogging.")
        else:
            hazard_level = "low"

        if congested_count > 0:
            warnings.append(f"Route experiences elevated crowd congestion on {congested_count} segment(s).")

        return RouteCandidate(
            route_id=route_id,
            path_nodes=node_ids,
            path_edges=path_edges,
            distance_m=round(total_distance_m, 1),
            estimated_duration_s=round(total_duration_s, 1),
            resilience_score=resilience,
            score_type="heuristic_not_probability",
            hazard_exposure=hazard_level,
            warnings=warnings,
            geometry={"type": "LineString", "coordinates": coordinates},
        )
