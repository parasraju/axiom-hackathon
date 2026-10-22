"""Graph data structure and road network management using NetworkX for SafeRoute."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple, Union
import networkx as nx

try:
    from app.models.schemas import RoadNode, RoadEdge, MobilityProfile
except ImportError:
    from pydantic import BaseModel, Field
    from enum import Enum

    class MobilityProfile(str, Enum):  # type: ignore[no-redef]
        WALK = "walk"
        WHEELCHAIR = "wheelchair"
        VEHICLE = "vehicle"

    class RoadNode(BaseModel):  # type: ignore[no-redef]
        id: str
        lon: float
        lat: float
        name: str = ""
        kind: str = "intersection"

    class RoadEdge(BaseModel):  # type: ignore[no-redef]
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


def haversine_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calculate great-circle distance between two geographic coordinates in meters.

    Args:
        lon1: Longitude of point 1 in degrees.
        lat1: Latitude of point 1 in degrees.
        lon2: Longitude of point 2 in degrees.
        lat2: Latitude of point 2 in degrees.

    Returns:
        Distance in meters.
    """
    radius = 6371000.0  # Earth's mean radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return radius * c


class EdgeDict(dict):
    """A dictionary representing road edge properties that also supports attribute access.

    This ensures full compatibility whether callers use dictionary subscription (edge['length_m'])
    or attribute notation (edge.capacity).
    """

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(f"'EdgeDict' object has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value


class RoadGraph:
    """Directed graph representing the road and pedestrian evacuation network.

    Encapsulates NetworkX DiGraph, maintaining synchronized spatial topologies,
    static infrastructure metadata, dynamic flood inundation depths, crowd congestion,
    and routing traversability states.
    """

    def __init__(self) -> None:
        self.graph: nx.DiGraph = nx.DiGraph()
        self.nodes_dict: Dict[str, RoadNode] = {}
        self.edges_dict: Dict[str, RoadEdge] = {}
        self.edge_index: Dict[str, Tuple[str, str]] = {}
        # Dynamic edge runtime states indexed by edge_id
        self.edge_runtime: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def haversine_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
        """Calculate great-circle distance between two coordinates in meters."""
        return haversine_distance(lon1, lat1, lon2, lat2)

    def load_network(
        self,
        nodes: List[Union[RoadNode, Dict[str, Any]]],
        edges: List[Union[RoadEdge, Dict[str, Any]]],
    ) -> None:
        """Populate NetworkX graph from nodes and directed edges.

        Populates:
          - Nodes with lon, lat, name, kind.
          - Directed edges with id, from_node, to_node, length_m, baseline_speed_kmh,
            modes, flood_threshold_m, has_stairs, is_open, capacity, geometry.
          - Baseline travel time computed via:
            travel_time_s = (length_m / 1000.0) / (baseline_speed_kmh / 3600.0)

        Args:
            nodes: List of RoadNode models or dictionary representations.
            edges: List of RoadEdge models or dictionary representations.
        """
        self.graph.clear()
        self.nodes_dict.clear()
        self.edges_dict.clear()
        self.edge_index.clear()
        self.edge_runtime.clear()

        # 1. Ingest Nodes
        for node_item in nodes:
            if isinstance(node_item, dict):
                node = RoadNode(**node_item)
            else:
                node = node_item

            self.nodes_dict[node.id] = node
            self.graph.add_node(
                node.id,
                lon=float(node.lon),
                lat=float(node.lat),
                name=str(node.name),
                kind=str(getattr(node, "kind", "intersection")),
            )

        # 2. Ingest Directed Edges
        for edge_item in edges:
            if isinstance(edge_item, dict):
                edge = RoadEdge(**edge_item)
            else:
                edge = edge_item

            self.edges_dict[edge.id] = edge
            self.edge_index[edge.id] = (edge.from_node, edge.to_node)

            # Compute baseline travel time:
            # travel_time_s = (length_m / 1000.0) / (baseline_speed_kmh / 3600.0)
            safe_speed_kmh = max(0.1, float(edge.baseline_speed_kmh))
            baseline_time_s = (float(edge.length_m) / 1000.0) / (safe_speed_kmh / 3600.0)

            # Ensure valid geometry dictionary
            geom = edge.geometry
            if not isinstance(geom, dict) or not geom.get("coordinates"):
                from_node_obj = self.nodes_dict.get(edge.from_node)
                to_node_obj = self.nodes_dict.get(edge.to_node)
                if from_node_obj and to_node_obj:
                    geom = {
                        "type": "LineString",
                        "coordinates": [
                            [from_node_obj.lon, from_node_obj.lat],
                            [to_node_obj.lon, to_node_obj.lat],
                        ],
                    }
                else:
                    geom = {"type": "LineString", "coordinates": []}

            # Initialize edge runtime state
            initial_runtime = {
                "is_open": bool(edge.is_open),
                "flood_depth_m": 0.0,
                "congestion_ratio": 0.0,
                "travel_time_s": baseline_time_s,
                "baseline_travel_time_s": baseline_time_s,
                "status": "normal" if edge.is_open else "closed",
            }
            self.edge_runtime[edge.id] = initial_runtime

            # Add directed edge to internal NetworkX DiGraph
            self.graph.add_edge(
                edge.from_node,
                edge.to_node,
                id=edge.id,
                edge_id=edge.id,
                from_node=edge.from_node,
                to_node=edge.to_node,
                length_m=float(edge.length_m),
                baseline_speed_kmh=safe_speed_kmh,
                modes=list(edge.modes),
                flood_threshold_m=float(edge.flood_threshold_m),
                has_stairs=bool(edge.has_stairs),
                is_open=bool(edge.is_open),
                capacity=int(edge.capacity),
                geometry=geom,
                travel_time_s=baseline_time_s,
                baseline_travel_time_s=baseline_time_s,
                flood_depth_m=0.0,
                congestion_ratio=0.0,
                status=initial_runtime["status"],
            )

    def get_edge(self, edge_id: str) -> Optional[EdgeDict]:
        """Retrieve edge properties and current dynamic runtime state by edge ID.

        Returns an EdgeDict supporting both dict subscription d['cap'] and attr access d.cap.
        """
        edge = self.edges_dict.get(edge_id)
        if not edge:
            return None

        runtime = self.edge_runtime.get(edge_id, {})
        u, v = edge.from_node, edge.to_node
        nx_data = dict(self.graph[u][v]) if self.graph.has_edge(u, v) else {}

        combined = {
            "id": edge.id,
            "edge_id": edge.id,
            "from_node": edge.from_node,
            "to_node": edge.to_node,
            "length_m": edge.length_m,
            "baseline_speed_kmh": edge.baseline_speed_kmh,
            "modes": list(edge.modes),
            "flood_threshold_m": edge.flood_threshold_m,
            "has_stairs": edge.has_stairs,
            "capacity": edge.capacity,
            "geometry": nx_data.get("geometry", edge.geometry),
            "is_open": runtime.get("is_open", edge.is_open),
            "flood_depth_m": runtime.get("flood_depth_m", 0.0),
            "congestion_ratio": runtime.get("congestion_ratio", 0.0),
            "status": runtime.get("status", "normal"),
            "travel_time_s": runtime.get("travel_time_s", runtime.get("baseline_travel_time_s", 0.0)),
            "baseline_travel_time_s": runtime.get("baseline_travel_time_s", 0.0),
        }
        return EdgeDict(combined)

    def get_edge_between(self, u: str, v: str) -> Optional[EdgeDict]:
        """Retrieve edge properties and current dynamic state between nodes u and v."""
        if not self.graph.has_edge(u, v):
            return None
        edge_data = dict(self.graph[u][v])
        return EdgeDict(edge_data)

    def update_edge_state(
        self,
        edge_id: str,
        is_open: Optional[bool] = None,
        flood_depth_m: Optional[float] = None,
        congestion_ratio: Optional[float] = None,
        status: Optional[str] = None,
        travel_time_s: Optional[float] = None,
    ) -> None:
        """Update runtime hazard, closure, flood depth, or congestion state of an edge.

        Recalculates edge status ('normal', 'caution', 'closed') and effective travel time
        if not explicitly provided.
        """
        if edge_id not in self.edge_runtime:
            return

        edge = self.edges_dict.get(edge_id)
        if not edge:
            return

        state = self.edge_runtime[edge_id]

        if is_open is not None:
            state["is_open"] = bool(is_open)
        if flood_depth_m is not None:
            state["flood_depth_m"] = max(0.0, float(flood_depth_m))
        if congestion_ratio is not None:
            state["congestion_ratio"] = max(0.0, float(congestion_ratio))

        # Determine edge status if not explicitly overridden
        if status is not None:
            state["status"] = status
        else:
            cur_open = state.get("is_open", True)
            cur_flood = state.get("flood_depth_m", 0.0)
            threshold = edge.flood_threshold_m
            cur_congestion = state.get("congestion_ratio", 0.0)

            if (not cur_open) or (cur_flood >= threshold):
                state["status"] = "closed"
            elif cur_flood > 0.05 or cur_congestion >= 0.8:
                state["status"] = "caution"
            else:
                state["status"] = "normal"

        # Determine effective travel time if not explicitly passed
        if travel_time_s is not None:
            state["travel_time_s"] = float(travel_time_s)
        elif congestion_ratio is not None:
            # Volume-delay scaling using BPR multiplier (clamped to 6x baseline)
            base_time = state.get("baseline_travel_time_s", 1.0)
            cong = state["congestion_ratio"]
            multiplier = min(6.0, max(1.0, 1.0 + 0.15 * (cong ** 4.0)))
            state["travel_time_s"] = base_time * multiplier

        # Synchronize updated runtime state into NetworkX edge attributes
        u, v = edge.from_node, edge.to_node
        if self.graph.has_edge(u, v):
            self.graph[u][v].update(state)

    def find_nearest_node(self, lon: float, lat: float) -> Optional[str]:
        """Find the closest graph node ID to given geographic coordinates using Haversine distance."""
        if not self.nodes_dict:
            return None

        best_node: Optional[str] = None
        best_dist = float("inf")

        for node_id, node in self.nodes_dict.items():
            dist = haversine_distance(lon, lat, node.lon, node.lat)
            if dist < best_dist:
                best_dist = dist
                best_node = node_id

        return best_node

    def get_traversable_subgraph(
        self,
        mode: Union[str, MobilityProfile] = "walk",
        minute: Optional[int] = None,
        max_flood_depth: Optional[float] = None,
    ) -> nx.DiGraph:
        """Return a directed subgraph view where impassable or prohibited edges are filtered out.

        Filtered out edges include:
          - Closed edges (is_open is False or status == 'closed').
          - Edges flooded beyond threshold (flood_depth_m >= flood_threshold_m or > max_flood_depth).
          - Edges with stairs when mode == 'wheelchair'.
          - Edges that do not permit the requested transportation mode.

        All graph nodes are retained in the subgraph so connectivity algorithms (e.g., nx.has_path)
        function reliably without NodeNotFound errors.
        """
        # Normalize mobility mode
        if hasattr(mode, "value"):
            mode_str = str(mode.value).lower()
        else:
            mode_str = str(mode).lower()

        if mode_str in ("walk", "walking", "pedestrian"):
            mode_norm = "walk"
        elif mode_str in ("wheelchair", "accessible"):
            mode_norm = "wheelchair"
        elif mode_str in ("vehicle", "car", "emergency"):
            mode_norm = "vehicle"
        else:
            mode_norm = mode_str

        subgraph = nx.DiGraph()

        # Retain all nodes with spatial metadata
        for n, data in self.graph.nodes(data=True):
            subgraph.add_node(n, **data)

        # Iterate over edges and filter based on constraints
        for u, v, data in self.graph.edges(data=True):
            edge_id = data.get("id") or data.get("edge_id")
            runtime = self.edge_runtime.get(edge_id, {})

            # 1. Manual or structural closure
            if not runtime.get("is_open", data.get("is_open", True)):
                continue
            if runtime.get("status") == "closed":
                continue

            # 2. Flood depth constraint
            flood_depth = runtime.get("flood_depth_m", data.get("flood_depth_m", 0.0))
            threshold = data.get("flood_threshold_m", 0.20)
            if flood_depth >= threshold:
                continue
            if max_flood_depth is not None and flood_depth > max_flood_depth:
                continue

            # 3. Transportation mode compatibility
            permitted_modes = [str(m).lower() for m in data.get("modes", ["walk", "wheelchair", "vehicle"])]
            if mode_norm not in permitted_modes and mode_str not in permitted_modes:
                # Wheelchair users can use walk paths only if wheelchair is explicitly permitted
                continue

            # 4. Wheelchair stairs exclusion
            if mode_norm == "wheelchair" and data.get("has_stairs", False):
                continue

            # Edge is traversable: populate with merged static and dynamic properties
            combined_edge_data = dict(data)
            combined_edge_data.update(runtime)
            subgraph.add_edge(u, v, **combined_edge_data)

        return subgraph

    def to_geojson(self) -> Dict[str, Any]:
        """Export current graph nodes and directed edges as a GeoJSON FeatureCollection.

        Edge features include:
          - Current flood status ('normal', 'caution', 'closed')
          - Dynamic congestion ratio and effective travel time
          - Color ('green' for normal, 'amber' for caution, 'red' for closed/flooded)
          - color_hex for direct map rendering
        """
        features: List[Dict[str, Any]] = []

        # Export Nodes as Point Features
        for node_id, node in self.nodes_dict.items():
            features.append(
                {
                    "type": "Feature",
                    "id": node.id,
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(node.lon), float(node.lat)],
                    },
                    "properties": {
                        "id": node.id,
                        "name": node.name,
                        "kind": getattr(node, "kind", "intersection"),
                        "type": "node",
                        "entity_type": "node",
                    },
                }
            )

        # Export Directed Edges as LineString Features
        for edge_id, edge in self.edges_dict.items():
            runtime = self.edge_runtime.get(edge_id, {})
            status = runtime.get("status", "normal")
            is_open = runtime.get("is_open", edge.is_open)
            flood_depth = runtime.get("flood_depth_m", 0.0)
            congestion = runtime.get("congestion_ratio", 0.0)
            travel_time = runtime.get("travel_time_s", runtime.get("baseline_travel_time_s", 0.0))

            # Determine color and status classification
            # 'green' for normal, 'amber' for caution, 'red' for closed/flooded
            if not is_open or flood_depth >= edge.flood_threshold_m or status == "closed":
                color_name = "red"
                color_hex = "#ef4444"
                status_label = "closed"
            elif status == "caution" or flood_depth > 0.05 or congestion >= 0.8:
                color_name = "amber"
                color_hex = "#f59e0b"
                status_label = "caution"
            else:
                color_name = "green"
                color_hex = "#10b981"
                status_label = "normal"

            # Geometry fallback
            u, v = edge.from_node, edge.to_node
            geom = edge.geometry
            if not isinstance(geom, dict) or not geom.get("coordinates"):
                from_node = self.nodes_dict.get(u)
                to_node = self.nodes_dict.get(v)
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

            features.append(
                {
                    "type": "Feature",
                    "id": edge.id,
                    "geometry": geom,
                    "properties": {
                        "id": edge.id,
                        "edge_id": edge.id,
                        "from_node": edge.from_node,
                        "to_node": edge.to_node,
                        "length_m": round(float(edge.length_m), 1),
                        "baseline_speed_kmh": float(edge.baseline_speed_kmh),
                        "modes": list(edge.modes),
                        "flood_threshold_m": float(edge.flood_threshold_m),
                        "has_stairs": bool(edge.has_stairs),
                        "capacity": int(edge.capacity),
                        "is_open": is_open,
                        "status": status_label,
                        "color": color_name,
                        "color_hex": color_hex,
                        "flood_depth_m": round(flood_depth, 3),
                        "congestion_ratio": round(congestion, 2),
                        "travel_time_s": round(travel_time, 1),
                        "type": "edge",
                        "entity_type": "edge",
                    },
                }
            )

        return {"type": "FeatureCollection", "features": features}
