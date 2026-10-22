"""Flood propagation simulation engine across discrete time-steps."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple
from shapely.geometry import Polygon, LineString, Point, mapping


class FloodSimulator:
    """Simulates water propagation along Riverdale river corridor."""

    def __init__(self) -> None:
        # River corridor centerline approximately lon = 74.875
        # Low-lying southern riverbank centered at (74.875, 31.631)
        self.river_lon = 74.875
        self.river_lat_south = 31.6310

    def get_flood_depth_for_edge(
        self,
        edge_id: str,
        coords: List[List[float]],
        minute: int,
    ) -> float:
        """Calculate flood depth in meters for a road edge at given simulation minute."""
        if minute <= 0:
            return 0.0

        # Known critical infrastructure markers
        # Bridge South: E15, E16 (low elevation underpass)
        if "BRIDGE_SOUTH" in edge_id or edge_id in ("E15_BRIDGE_SOUTH_EW", "E16_BRIDGE_SOUTH_WE"):
            if minute < 15:
                return 0.02 * (minute / 15.0)
            elif minute < 30:
                # 15 min: 0.08m (caution) -> 30 min: 0.28m (closed)
                progress = (minute - 15.0) / 15.0
                return 0.08 + progress * 0.20
            elif minute < 60:
                progress = (minute - 30.0) / 30.0
                return 0.28 + progress * 0.12
            else:
                return 0.40

        # Low lying promenade (E11, E12 near South River)
        if edge_id in ("E11_N05_N07", "E12_N07_N05"):
            if minute < 20:
                return 0.0
            elif minute < 45:
                return 0.05 + 0.05 * ((minute - 20) / 25.0)  # caution
            else:
                return 0.16  # closed (> 0.12m threshold)

        # Bridge North (High elevation bridge: safe throughout demo)
        if "BRIDGE_NORTH" in edge_id or edge_id in ("E13_BRIDGE_NORTH_EW", "E14_BRIDGE_NORTH_WE"):
            if minute >= 60:
                return 0.04  # Well below 0.35m threshold, remains passable
            return 0.0

        # General spatial distance check to river
        # If road is close to low-lying southern river basin
        if coords:
            avg_lon = sum(pt[0] for pt in coords) / len(coords)
            avg_lat = sum(pt[1] for pt in coords) / len(coords)
            dist_to_south_river = ((avg_lon - self.river_lon) ** 2 + (avg_lat - self.river_lat_south) ** 2) ** 0.5
            if dist_to_south_river < 0.003:
                if minute >= 30:
                    return min(0.12, 0.04 * (minute / 30.0))

        return 0.0

    def compute_edge_states(
        self,
        minute: int,
        edges: List[Dict[str, Any]],
    ) -> Dict[str, Dict[str, Any]]:
        """Return computed flood depth and status for all edges at simulation minute."""
        results: Dict[str, Dict[str, Any]] = {}

        for edge in edges:
            edge_id = edge["id"]
            threshold = edge.get("flood_threshold_m", 0.20)
            geometry = edge.get("geometry", {})
            coords = geometry.get("coordinates", [])

            depth = self.get_flood_depth_for_edge(edge_id, coords, minute)

            if depth > threshold:
                status = "closed"
                is_passable = False
            elif depth >= 0.05:
                status = "caution"
                is_passable = True
            else:
                status = "normal"
                is_passable = True

            results[edge_id] = {
                "flood_depth_m": round(depth, 3),
                "status": status,
                "is_passable": is_passable,
            }

        return results

    def get_flood_geojson(self, minute: int) -> Dict[str, Any]:
        """Generate GeoJSON MultiPolygon representing the expanding flood boundary."""
        if minute <= 0:
            return {"type": "FeatureCollection", "features": []}

        # Expansion radius in geographic degrees based on time minute
        # At minute 15: narrow river corridor
        # At minute 30: bulges around South Bridge
        # At minute 60-90: inundates southern floodplain
        expansion = min(0.004, 0.001 + (minute / 90.0) * 0.003)

        # Polygon around River Basin South
        p1 = [self.river_lon - expansion, self.river_lat_south - 0.005]
        p2 = [self.river_lon + expansion, self.river_lat_south - 0.005]
        p3 = [self.river_lon + expansion * 1.2, self.river_lat_south + 0.004]
        p4 = [self.river_lon - expansion * 1.2, self.river_lat_south + 0.004]

        feature = {
            "type": "Feature",
            "id": f"flood_zone_m{minute}",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[p1, p2, p3, p4, p1]],
            },
            "properties": {
                "minute": minute,
                "severity": 1 if minute < 30 else (2 if minute < 60 else 3),
                "water_level_description": "Minor waterlogging" if minute < 30 else ("Dangerous flood crest" if minute >= 60 else "Bridge overtopping"),
                "color": "rgba(59, 130, 246, 0.45)",  # Translucent blue
            },
        }

        return {"type": "FeatureCollection", "features": [feature]}
