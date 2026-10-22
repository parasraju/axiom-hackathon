"""Dynamic safe-routing engine with multi-factor costs and resilience scoring."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import networkx as nx
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points

from app.graph.road_network import RoadGraph, haversine_distance
from app.models.schemas import RouteResponse, RouteCandidate, MobilityProfile
from app.simulation.flood_model import FloodSimulator


class DictRouteCandidate(RouteCandidate):
    """RouteCandidate supporting both attribute and dict-item access."""

    def __getitem__(self, item: str) -> Any:
        try:
            return getattr(self, item)
        except AttributeError:
            raise KeyError(item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

    def __contains__(self, item: str) -> bool:
        return hasattr(self, item)

    def keys(self) -> Any:
        return self.model_dump().keys()

    def values(self) -> Any:
        return self.model_dump().values()

    def items(self) -> Any:
        return self.model_dump().items()


class DictRouteResponse(RouteResponse):
    """RouteResponse supporting both attribute and dict-item access."""

    def __getitem__(self, item: str) -> Any:
        try:
            return getattr(self, item)
        except AttributeError:
            raise KeyError(item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

    def __contains__(self, item: str) -> bool:
        return hasattr(self, item)

    def keys(self) -> Any:
        return self.model_dump().keys()

    def values(self) -> Any:
        return self.model_dump().values()

    def items(self) -> Any:
        return self.model_dump().items()


class SafeRouter:
    """Calculates hazard-aware evacuation routes with alternatives and resilience ratings."""

    def __init__(
        self,
        graph: Optional[Any] = None,
        flood_simulator: Optional[FloodSimulator] = None,
    ) -> None:
        self.road_graph = graph
        self.flood_simulator = flood_simulator or FloodSimulator()

    def plan_route(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Union[DictRouteResponse, Dict[str, Any]]:
        """Find primary and alternative safe evacuation routes.

        Supports invocation patterns:
        - plan_route(graph, origin_id, destination_id, mode='walk', departure_minute=0, alternatives=2)
        - plan_route(origin_id, destination_id, mode='walk', departure_minute=0, alternatives=2)
        - plan_route(origin_id='...', destination_id='...', ...)
        - SafeRouter.plan_route(graph, origin_id, destination_id, ...)
        """
        # 1. Resolve 'self' if invoked as an unbound function or class method
        actual_self = self
        if not isinstance(self, SafeRouter):
            # Called as SafeRouter.plan_route(graph, ...) or plan_route(graph, ...)
            active_graph = self
            actual_self = SafeRouter(active_graph)
            return actual_self.plan_route(*args, **kwargs)

        # 2. Parse positional and keyword arguments
        active_graph = kwargs.get("graph", actual_self.road_graph)
        origin_id = kwargs.get("origin_id")
        destination_id = kwargs.get("destination_id")
        mode = kwargs.get("mode", "walk")
        departure_minute = kwargs.get("departure_minute", 0)
        alternatives = kwargs.get("alternatives", 2)
        as_dict = kwargs.get("as_dict", False)

        remaining_args = list(args)

        if len(remaining_args) >= 3:
            # Pattern: plan_route(graph, origin_id, destination_id, [mode, departure_minute, alternatives])
            active_graph = remaining_args[0]
            origin_id = remaining_args[1]
            destination_id = remaining_args[2]
            if len(remaining_args) >= 4:
                mode = remaining_args[3]
            if len(remaining_args) >= 5:
                departure_minute = remaining_args[4]
            if len(remaining_args) >= 6:
                alternatives = remaining_args[5]
        elif len(remaining_args) == 2:
            # Pattern: plan_route(origin_id, destination_id)
            origin_id = remaining_args[0]
            destination_id = remaining_args[1]
        elif len(remaining_args) == 1:
            if origin_id is None:
                if isinstance(remaining_args[0], (str, int)):
                    origin_id = remaining_args[0]
                else:
                    active_graph = remaining_args[0]

        # Normalize mode
        if hasattr(mode, "value"):
            mode = mode.value
        mode = str(mode).lower()

        departure_minute = int(departure_minute)
        alternatives = max(0, int(alternatives))

        # 3. Ensure active graph is available
        if active_graph is None:
            return self._build_no_route(
                departure_minute=departure_minute,
                warnings=["Graph is not provided or initialized."],
                as_dict=as_dict,
            )

        # 4. Extract underlying networkx graph and helper lookups
        nx_graph, nodes_dict, edge_runtime = self._extract_graph_components(active_graph)

        # 5. Validate origin and destination exist in graph
        if not self._node_exists(origin_id, nx_graph, nodes_dict):
            return self._build_no_route(
                departure_minute=departure_minute,
                warnings=[f"Origin node '{origin_id}' not found in road network"],
                as_dict=as_dict,
            )

        if not self._node_exists(destination_id, nx_graph, nodes_dict):
            return self._build_no_route(
                departure_minute=departure_minute,
                warnings=[f"Destination node '{destination_id}' not found in road network"],
                as_dict=as_dict,
            )

        # Handle trivial case: origin is destination
        if origin_id == destination_id:
            origin_coord = self._get_node_coord(origin_id, nx_graph, nodes_dict)
            single_candidate = DictRouteCandidate(
                route_id="route_primary",
                path_nodes=[origin_id],
                path_edges=[],
                distance_m=0.0,
                estimated_duration_s=0.0,
                resilience_score=100,
                score_type="heuristic_not_probability",
                hazard_exposure="low",
                warnings=[],
                geometry={"type": "LineString", "coordinates": [origin_coord, origin_coord]},
            )
            response = DictRouteResponse(
                scenario_id="monsoon_demo",
                evaluated_minute=departure_minute,
                status="route_found",
                primary_route=single_candidate,
                alternatives=[],
                warnings=[],
                data_freshness={
                    "evaluated_minute": departure_minute,
                    "scenario_snapshot_minute": departure_minute,
                    "is_simulated": True,
                },
            )
            return response.model_dump() if as_dict else response

        # 6. Apply HARD constraints to construct filtered traversable subgraph
        subgraph = self._build_traversable_subgraph(
            nx_graph=nx_graph,
            edge_runtime=edge_runtime,
            mode=mode,
        )

        # 7. Check path connectivity in traversable subgraph
        if (
            not subgraph.has_node(origin_id)
            or not subgraph.has_node(destination_id)
            or not nx.has_path(subgraph, origin_id, destination_id)
        ):
            warnings = ["All feasible paths blocked by flood/closure"]
            if mode == "wheelchair":
                warnings.append("Accessible step-free paths may be blocked by flood waters or stairs.")
            return self._build_no_route(
                departure_minute=departure_minute,
                warnings=warnings,
                as_dict=as_dict,
            )

        # 8. Compute primary path using Dijkstra with dynamic edge cost
        try:
            primary_nodes = nx.dijkstra_path(subgraph, origin_id, destination_id, weight="cost")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return self._build_no_route(
                departure_minute=departure_minute,
                warnings=["All feasible paths blocked by flood/closure"],
                as_dict=as_dict,
            )

        primary_candidate = self._build_candidate(
            route_id="route_primary",
            node_ids=primary_nodes,
            subgraph=subgraph,
            nx_graph=nx_graph,
            nodes_dict=nodes_dict,
            active_graph=active_graph,
            departure_minute=departure_minute,
        )

        # 9. Compute up to `alternatives` distinct paths by penalizing primary and alternate edges
        candidate_alternatives: List[DictRouteCandidate] = []
        if alternatives > 0:
            alt_subgraph = subgraph.copy()
            discovered_node_paths = [primary_nodes]

            for alt_idx in range(1, alternatives + 1):
                # Apply penalty to edges belonging to already discovered routes
                for path in discovered_node_paths:
                    for i in range(len(path) - 1):
                        u, v = path[i], path[i + 1]
                        if alt_subgraph.has_edge(u, v):
                            # Multiplicative cost penalty + flat bump
                            current_cost = alt_subgraph[u][v].get("cost", 50.0)
                            alt_subgraph[u][v]["cost"] = current_cost * 3.5 + 250.0

                try:
                    alt_nodes = nx.dijkstra_path(alt_subgraph, origin_id, destination_id, weight="cost")
                    if alt_nodes not in discovered_node_paths:
                        candidate = self._build_candidate(
                            route_id=f"route_alt_{len(candidate_alternatives) + 1}",
                            node_ids=alt_nodes,
                            subgraph=subgraph,
                            nx_graph=nx_graph,
                            nodes_dict=nodes_dict,
                            active_graph=active_graph,
                            departure_minute=departure_minute,
                        )
                        candidate_alternatives.append(candidate)
                        discovered_node_paths.append(alt_nodes)
                    else:
                        # Further penalization yields duplicate; terminate alternative search
                        break
                except (nx.NetworkXNoPath, nx.NodeNotFound):
                    break

        response = DictRouteResponse(
            scenario_id="monsoon_demo",
            evaluated_minute=departure_minute,
            status="route_found",
            primary_route=primary_candidate,
            alternatives=candidate_alternatives,
            warnings=primary_candidate.warnings,
            data_freshness={
                "evaluated_minute": departure_minute,
                "scenario_snapshot_minute": departure_minute,
                "is_simulated": True,
            },
        )
        return response.model_dump() if as_dict else response

    # -------------------------------------------------------------------------
    # Helper methods
    # -------------------------------------------------------------------------

    def _extract_graph_components(
        self, active_graph: Any
    ) -> Tuple[nx.DiGraph, Dict[str, Any], Dict[str, Dict[str, Any]]]:
        """Extract NetworkX graph, nodes lookup, and edge runtime data."""
        if isinstance(active_graph, RoadGraph):
            return active_graph.graph, active_graph.nodes_dict, active_graph.edge_runtime

        if isinstance(active_graph, (nx.DiGraph, nx.Graph)):
            nodes_dict: Dict[str, Any] = {}
            for n, d in active_graph.nodes(data=True):
                nodes_dict[n] = d
            return active_graph, nodes_dict, {}

        # Default fallback if wrapper object
        underlying = getattr(active_graph, "graph", None)
        if underlying is not None and isinstance(underlying, (nx.DiGraph, nx.Graph)):
            nodes_dict = getattr(active_graph, "nodes_dict", {})
            edge_runtime = getattr(active_graph, "edge_runtime", {})
            return underlying, nodes_dict, edge_runtime

        raise ValueError(f"Unsupported graph type: {type(active_graph)}")

    def _node_exists(
        self,
        node_id: Optional[str],
        nx_graph: nx.DiGraph,
        nodes_dict: Dict[str, Any],
    ) -> bool:
        """Validate if a node exists in graph or nodes dictionary."""
        if not node_id:
            return False
        return node_id in nodes_dict or nx_graph.has_node(node_id)

    def _get_node_coord(
        self,
        node_id: str,
        nx_graph: nx.DiGraph,
        nodes_dict: Dict[str, Any],
    ) -> List[float]:
        """Return [lon, lat] for a node."""
        if node_id in nodes_dict:
            node_obj = nodes_dict[node_id]
            if hasattr(node_obj, "lon") and hasattr(node_obj, "lat"):
                return [float(node_obj.lon), float(node_obj.lat)]
            if isinstance(node_obj, dict):
                return [float(node_obj.get("lon", 0.0)), float(node_obj.get("lat", 0.0))]

        if nx_graph.has_node(node_id):
            nd = nx_graph.nodes[node_id]
            return [float(nd.get("lon", 0.0)), float(nd.get("lat", 0.0))]

        return [0.0, 0.0]

    def _build_traversable_subgraph(
        self,
        nx_graph: nx.DiGraph,
        edge_runtime: Dict[str, Dict[str, Any]],
        mode: str,
    ) -> nx.DiGraph:
        """Filter impassable edges using HARD constraints and compute dynamic edge costs."""
        subgraph = nx.DiGraph()

        # Add all nodes
        for n, data in nx_graph.nodes(data=True):
            subgraph.add_node(n, **data)

        for u, v, data in nx_graph.edges(data=True):
            edge_attrs = dict(data)
            edge_id = edge_attrs.get("edge_id", f"E_{u}_{v}")

            # Merge dynamic runtime state if available
            runtime = edge_runtime.get(edge_id, {})
            edge_attrs.update(runtime)

            # -------------------------------------------------------------
            # HARD CONSTRAINT 1: Edge closure
            # -------------------------------------------------------------
            if edge_attrs.get("is_open") is False:
                continue
            if not edge_attrs.get("is_open", True):
                continue

            # -------------------------------------------------------------
            # HARD CONSTRAINT 2: Flood depth exceeds threshold
            # -------------------------------------------------------------
            flood_depth_m = float(edge_attrs.get("flood_depth_m", 0.0))
            flood_threshold_m = float(edge_attrs.get("flood_threshold_m", 0.20))
            if flood_depth_m > flood_threshold_m:
                continue

            # -------------------------------------------------------------
            # HARD CONSTRAINT 3: Wheelchair stair exclusion
            # -------------------------------------------------------------
            has_stairs = bool(edge_attrs.get("has_stairs", False))
            if mode == "wheelchair" and has_stairs:
                continue

            # -------------------------------------------------------------
            # HARD CONSTRAINT 4: Mode permissions
            # -------------------------------------------------------------
            modes = edge_attrs.get("modes")
            if modes is not None and isinstance(modes, (list, tuple, set)):
                modes_set = {str(m).lower() for m in modes}
                if mode not in modes_set:
                    continue

            # -------------------------------------------------------------
            # DYNAMIC COST FORMULA:
            # cost = travel_time_s * (1.0 + congestion_ratio * 1.5)
            #        + (hazard_penalty: 300.0 if status == 'caution' else 0.0)
            # -------------------------------------------------------------
            travel_time_s = float(edge_attrs.get("travel_time_s", 0.0))
            if travel_time_s <= 0.0:
                length_m = float(edge_attrs.get("length_m", 100.0))
                speed_kmh = float(edge_attrs.get("baseline_speed_kmh", 25.0))
                speed_mps = max(0.1, (speed_kmh * 1000.0) / 3600.0)
                travel_time_s = length_m / speed_mps

            congestion_ratio = max(0.0, float(edge_attrs.get("congestion_ratio", 0.0)))
            status = str(edge_attrs.get("status", "normal")).lower()
            hazard_penalty = 300.0 if status == "caution" else 0.0

            dynamic_cost = travel_time_s * (1.0 + congestion_ratio * 1.5) + hazard_penalty

            edge_attrs["travel_time_s"] = travel_time_s
            edge_attrs["congestion_ratio"] = congestion_ratio
            edge_attrs["status"] = status
            edge_attrs["cost"] = dynamic_cost

            subgraph.add_edge(u, v, **edge_attrs)

        return subgraph

    def _is_route_near_active_flood_zone(
        self,
        route_coords: List[List[float]],
        departure_minute: int,
        active_graph: Any,
    ) -> bool:
        """Return True if route coordinates pass within 200m of an active flood zone."""
        if not route_coords:
            return False

        # Build route Shapely geometry
        if len(route_coords) >= 2:
            route_geom: Union[LineString, Point] = LineString(route_coords)
        else:
            route_geom = Point(route_coords[0])

        # 1. Check against FloodSimulator active flood polygons
        if departure_minute > 0 and self.flood_simulator is not None:
            flood_geojson = self.flood_simulator.get_flood_geojson(departure_minute)
            features = flood_geojson.get("features", [])
            for feat in features:
                geom_dict = feat.get("geometry", {})
                if geom_dict.get("type") == "Polygon":
                    poly_coords = geom_dict.get("coordinates", [])
                    if poly_coords and len(poly_coords[0]) >= 3:
                        poly = Polygon(poly_coords[0])
                        # If route intersects or is within 200m
                        if route_geom.intersects(poly):
                            return True
                        p1, p2 = nearest_points(route_geom, poly)
                        dist_m = haversine_distance(p1.x, p1.y, p2.x, p2.y)
                        if dist_m <= 200.0:
                            return True

        # 2. Check against flooded road edges (actual water inundation: flood_depth_m >= 0.05)
        nx_graph, _, edge_runtime = self._extract_graph_components(active_graph)
        for u, v, data in nx_graph.edges(data=True):
            edge_attrs = dict(data)
            edge_id = edge_attrs.get("edge_id", f"E_{u}_{v}")
            edge_attrs.update(edge_runtime.get(edge_id, {}))

            flood_depth = float(edge_attrs.get("flood_depth_m", 0.0))
            if flood_depth >= 0.05:
                edge_geom_data = edge_attrs.get("geometry", {})
                coords = edge_geom_data.get("coordinates", [])
                if len(coords) >= 2:
                    edge_line = LineString(coords)
                    p1, p2 = nearest_points(route_geom, edge_line)
                    dist_m = haversine_distance(p1.x, p1.y, p2.x, p2.y)
                    if dist_m <= 200.0:
                        return True
                elif coords:
                    pt = Point(coords[0])
                    p1, p2 = nearest_points(route_geom, pt)
                    dist_m = haversine_distance(p1.x, p1.y, p2.x, p2.y)
                    if dist_m <= 200.0:
                        return True

        return False

    def _build_candidate(
        self,
        route_id: str,
        node_ids: List[str],
        subgraph: nx.DiGraph,
        nx_graph: nx.DiGraph,
        nodes_dict: Dict[str, Any],
        active_graph: Any,
        departure_minute: int,
    ) -> DictRouteCandidate:
        """Construct a structured RouteCandidate with resilience scoring and GeoJSON geometry."""
        path_edges: List[str] = []
        coordinates: List[List[float]] = []
        total_distance_m = 0.0
        total_duration_s = 0.0
        caution_count = 0
        congested_count = 0
        warnings: List[str] = []

        # Add origin node coordinate
        if node_ids:
            coordinates.append(self._get_node_coord(node_ids[0], nx_graph, nodes_dict))

        for i in range(len(node_ids) - 1):
            u, v = node_ids[i], node_ids[i + 1]
            edge_data = subgraph[u][v]
            edge_id = edge_data.get("edge_id", f"E_{u}_{v}")
            path_edges.append(edge_id)

            total_distance_m += float(edge_data.get("length_m", 0.0))
            total_duration_s += float(edge_data.get("travel_time_s", 0.0))

            status = str(edge_data.get("status", "normal")).lower()
            if status == "caution":
                caution_count += 1

            congestion_ratio = float(edge_data.get("congestion_ratio", 0.0))
            if congestion_ratio > 0.8:
                congested_count += 1

            # Append segment geometry if available
            geom = edge_data.get("geometry", {})
            seg_coords = geom.get("coordinates", [])
            if seg_coords:
                for pt in seg_coords[1:]:
                    coordinates.append([float(pt[0]), float(pt[1])])
            else:
                coordinates.append(self._get_node_coord(v, nx_graph, nodes_dict))

        # Check proximity to active flood zones
        near_flood_zone = self._is_route_near_active_flood_zone(
            route_coords=coordinates,
            departure_minute=departure_minute,
            active_graph=active_graph,
        )

        # -----------------------------------------------------------------
        # RESILIENCE SCORE (0-100):
        # Starts at 100, deducts:
        # - 15 points per segment under 'caution'
        # - 10 points per segment with congestion_ratio > 0.8
        # - 20 points if route passes within 200m of an active flood zone
        # Bounds score between 5 and 100.
        # -----------------------------------------------------------------
        resilience = 100 - (caution_count * 15) - (congested_count * 10)
        if near_flood_zone:
            resilience -= 20
        resilience = max(5, min(100, resilience))

        # Warnings and hazard exposure rating
        if caution_count > 0:
            warnings.append(f"Route crosses {caution_count} segment(s) under caution/minor waterlogging.")

        if congested_count > 0:
            warnings.append(f"Route experiences elevated crowd congestion on {congested_count} segment(s).")

        if near_flood_zone:
            warnings.append("Route passes within 200m of an active flood zone.")

        if caution_count == 0 and not near_flood_zone and congested_count == 0:
            hazard_exposure = "low"
        elif resilience >= 60 and caution_count <= 1:
            hazard_exposure = "moderate"
        else:
            hazard_exposure = "high"

        # GeoJSON LineString requires at least 2 points
        if len(coordinates) == 1:
            coordinates.append(coordinates[0])

        return DictRouteCandidate(
            route_id=route_id,
            path_nodes=node_ids,
            path_edges=path_edges,
            distance_m=round(total_distance_m, 1),
            estimated_duration_s=round(total_duration_s, 1),
            resilience_score=resilience,
            score_type="heuristic_not_probability",
            hazard_exposure=hazard_exposure,
            warnings=warnings,
            geometry={"type": "LineString", "coordinates": coordinates},
        )

    def _build_no_route(
        self,
        departure_minute: int,
        warnings: List[str],
        as_dict: bool = False,
    ) -> Union[DictRouteResponse, Dict[str, Any]]:
        """Construct standardized response when no route is found."""
        response = DictRouteResponse(
            scenario_id="monsoon_demo",
            evaluated_minute=departure_minute,
            status="no_route_found",
            primary_route=None,
            alternatives=[],
            warnings=warnings,
            data_freshness={
                "evaluated_minute": departure_minute,
                "scenario_snapshot_minute": departure_minute,
                "is_simulated": True,
            },
        )
        return response.model_dump() if as_dict else response
