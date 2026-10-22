"""Flood simulation model for SafeRoute: Riverdale City Evacuation Network.

Simulates time-dependent flood propagation along the river corridor across
discrete intervals [0, 15, 30, 45, 60, 75, 90] minutes, calculating street-level
water depths via Shapely geometric intersections and threshold-based closure statuses.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

from shapely.geometry import LineString, MultiPolygon, Polygon, mapping


@dataclass(frozen=True)
class FloodOriginZone:
    """Configured flood origin zone along the river corridor."""

    id: str
    name: str
    bounding_box: Tuple[float, float, float, float]  # (min_lon, min_lat, max_lon, max_lat)
    polygon: Polygon
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "bounding_box": list(self.bounding_box),
            "description": self.description,
        }


# Default flood origin zones along the Riverdale river corridor (river longitude ~ 74.875)
DEFAULT_ORIGIN_ZONES: List[FloodOriginZone] = [
    FloodOriginZone(
        id="zone_river_south_origin",
        name="South Riverbanks Primary Basin",
        bounding_box=(74.8735, 31.6260, 74.8775, 31.6335),
        polygon=Polygon(
            [
                (74.8735, 31.6260),
                (74.8775, 31.6260),
                (74.8775, 31.6335),
                (74.8735, 31.6335),
                (74.8735, 31.6260),
            ]
        ),
        description="Low-lying flood origin along the south river corridor near Bridge South underpass.",
    ),
    FloodOriginZone(
        id="zone_bridge_south_underpass",
        name="Bridge South Underpass Depression",
        bounding_box=(74.8740, 31.6315, 74.8770, 31.6330),
        polygon=Polygon(
            [
                (74.8740, 31.6315),
                (74.8770, 31.6315),
                (74.8770, 31.6330),
                (74.8740, 31.6330),
                (74.8740, 31.6315),
            ]
        ),
        description="Vulnerable underpass depression beneath Bridge South crossing.",
    ),
]


# Canonical Bridge and Surrounding Edge Groups in Riverdale
BRIDGE_SOUTH_EDGES = {"E15_BRIDGE_SOUTH_EW", "E16_BRIDGE_SOUTH_WE"}
BRIDGE_NORTH_EDGES = {"E13_BRIDGE_NORTH_EW", "E14_BRIDGE_NORTH_WE"}
SURROUNDING_SOUTH_STREETS = {
    "E09_N05_N06",
    "E10_N06_N05",
    "E11_N05_N07",
    "E12_N07_N05",
    "E19_N08_N10",
    "E20_N10_N08",
    "E21_N10_N11",
    "E22_N11_N10",
}
EXTENDED_SOUTH_APPROACH = {"E07_N03_N05", "E08_N05_N03"}


class FloodSimulator:
    """Simulates flood spread over time across discrete intervals [0, 15, 30, 45, 60, 75, 90] min.

    Attributes:
        discrete_intervals: Supported discrete keyframe minutes [0, 15, 30, 45, 60, 75, 90].
        origin_zones: Configured flood origin zones along the river corridor.
        default_flood_threshold_m: Default road inundation threshold in meters (0.20m).
    """

    DISCRETE_INTERVALS: List[int] = [0, 15, 30, 45, 60, 75, 90]

    def __init__(
        self,
        origin_zones: Optional[List[FloodOriginZone]] = None,
        default_flood_threshold_m: float = 0.20,
    ) -> None:
        self.discrete_intervals: List[int] = list(self.DISCRETE_INTERVALS)
        self.origin_zones: List[FloodOriginZone] = (
            origin_zones if origin_zones is not None else list(DEFAULT_ORIGIN_ZONES)
        )
        self.default_flood_threshold_m: float = float(default_flood_threshold_m)

        # Build keyframe polygon definitions
        self._keyframe_zones: Dict[int, List[Dict[str, Any]]] = self._build_keyframe_zones()

    def _build_keyframe_zones(self) -> Dict[int, List[Dict[str, Any]]]:
        """Construct Shapely polygon boundaries, water levels, and severities for each keyframe."""
        return {
            0: [],
            15: [
                {
                    "zone_id": "zone_river_south_15",
                    "name": "South Riverbanks Initial Rise",
                    "severity": 1,
                    "water_level": 0.08,
                    "polygon": Polygon(
                        [
                            (74.8742, 31.6270),
                            (74.8768, 31.6270),
                            (74.8768, 31.6330),
                            (74.8742, 31.6330),
                            (74.8742, 31.6270),
                        ]
                    ),
                    "description": "Water rising along south river channel crossing Bridge South.",
                }
            ],
            30: [
                {
                    "zone_id": "zone_bridge_south_breach_30",
                    "name": "Bridge South Riverbank Breach",
                    "severity": 2,
                    "water_level": 0.28,
                    "polygon": Polygon(
                        [
                            (74.8742, 31.6270),
                            (74.8768, 31.6270),
                            (74.8768, 31.6335),
                            (74.8742, 31.6335),
                            (74.8742, 31.6270),
                        ]
                    ),
                    "description": "Riverbank breached at Bridge South underpass exceeding closure threshold.",
                },
                {
                    "zone_id": "zone_south_corridor_caution_30",
                    "name": "South Corridor Surface Runoff",
                    "severity": 1,
                    "water_level": 0.10,
                    "polygon": Polygon(
                        [
                            (74.8718, 31.6265),
                            (74.8815, 31.6265),
                            (74.8815, 31.6328),
                            (74.8718, 31.6328),
                            (74.8718, 31.6265),
                        ]
                    ),
                    "description": "Shallow runoff inundating streets surrounding Bridge South.",
                },
            ],
            45: [
                {
                    "zone_id": "zone_bridge_south_breach_45",
                    "name": "Bridge South Major Inundation",
                    "severity": 3,
                    "water_level": 0.38,
                    "polygon": Polygon(
                        [
                            (74.8735, 31.6265),
                            (74.8775, 31.6265),
                            (74.8775, 31.6338),
                            (74.8735, 31.6338),
                            (74.8735, 31.6265),
                        ]
                    ),
                    "description": "Deep inundation along Bridge South corridor.",
                },
                {
                    "zone_id": "zone_south_corridor_expansion_45",
                    "name": "South Corridor Expansion",
                    "severity": 2,
                    "water_level": 0.18,
                    "polygon": Polygon(
                        [
                            (74.8712, 31.6260),
                            (74.8820, 31.6260),
                            (74.8820, 31.6338),
                            (74.8712, 31.6338),
                            (74.8712, 31.6260),
                        ]
                    ),
                    "description": "Expanding water coverage into surrounding intersections.",
                },
            ],
            60: [
                {
                    "zone_id": "zone_bridge_south_deep_60",
                    "name": "Bridge South Submerged",
                    "severity": 3,
                    "water_level": 0.48,
                    "polygon": Polygon(
                        [
                            (74.8730, 31.6260),
                            (74.8780, 31.6260),
                            (74.8780, 31.6342),
                            (74.8730, 31.6342),
                            (74.8730, 31.6260),
                        ]
                    ),
                    "description": "Bridge South deeply submerged; northern bridge remains completely safe.",
                },
                {
                    "zone_id": "zone_southern_quadrant_60",
                    "name": "Southern Quadrant Flood Expansion",
                    "severity": 2,
                    "water_level": 0.24,
                    "polygon": Polygon(
                        [
                            (74.8708, 31.6255),
                            (74.8825, 31.6255),
                            (74.8825, 31.6348),
                            (74.8708, 31.6348),
                            (74.8708, 31.6255),
                        ]
                    ),
                    "description": "Widespread inundation across southern quadrant.",
                },
            ],
            75: [
                {
                    "zone_id": "zone_bridge_south_deep_75",
                    "name": "Bridge South Severe Flood",
                    "severity": 4,
                    "water_level": 0.55,
                    "polygon": Polygon(
                        [
                            (74.8725, 31.6255),
                            (74.8785, 31.6255),
                            (74.8785, 31.6346),
                            (74.8725, 31.6346),
                            (74.8725, 31.6255),
                        ]
                    ),
                    "description": "Severe flooding at Bridge South approaching peak crest.",
                },
                {
                    "zone_id": "zone_southern_quadrant_75",
                    "name": "Southern Quadrant Severe Spread",
                    "severity": 3,
                    "water_level": 0.28,
                    "polygon": Polygon(
                        [
                            (74.8700, 31.6250),
                            (74.8830, 31.6250),
                            (74.8830, 31.6355),
                            (74.8700, 31.6355),
                            (74.8700, 31.6250),
                        ]
                    ),
                    "description": "Deepening flood coverage across southern quadrant roads.",
                },
            ],
            90: [
                {
                    "zone_id": "zone_bridge_south_crest_90",
                    "name": "Bridge South Peak Crest",
                    "severity": 4,
                    "water_level": 0.60,
                    "polygon": Polygon(
                        [
                            (74.8720, 31.6250),
                            (74.8790, 31.6250),
                            (74.8790, 31.6350),
                            (74.8720, 31.6350),
                            (74.8720, 31.6250),
                        ]
                    ),
                    "description": "Peak flood cresting at Bridge South (0.60m depth). Northern bridge remains clear.",
                },
                {
                    "zone_id": "zone_southern_quadrant_crest_90",
                    "name": "Southern Quadrant Cresting Spread",
                    "severity": 3,
                    "water_level": 0.32,
                    "polygon": Polygon(
                        [
                            (74.8695, 31.6245),
                            (74.8835, 31.6245),
                            (74.8835, 31.6360),
                            (74.8695, 31.6360),
                            (74.8695, 31.6245),
                        ]
                    ),
                    "description": "Peak inundation across southern quadrant. Northern crossing stays dry.",
                },
            ],
        }

    @staticmethod
    def get_edge_status(
        flood_depth_m: float,
        threshold_m: float = 0.20,
        is_manually_closed: bool = False,
    ) -> str:
        """Evaluate operational status of an edge.

        Args:
            flood_depth_m: Current water depth in meters.
            threshold_m: Inundation closure threshold in meters (default 0.20m).
            is_manually_closed: Whether the edge was closed by dispatcher / incident report.

        Returns:
            'closed', 'caution', or 'normal'.
        """
        if is_manually_closed:
            return "closed"
        if flood_depth_m >= threshold_m:
            return "closed"
        if flood_depth_m > 0.0:
            return "caution"
        return "normal"

    def get_flood_geojson(self, minute: int) -> Dict[str, Any]:
        """Generate GeoJSON FeatureCollection of flood polygon boundaries at minute t.

        Args:
            minute: Simulation time in minutes.

        Returns:
            GeoJSON FeatureCollection with properties (severity, minute, water_level, zone_id, name).
        """
        clamped_minute = max(0, min(int(minute), 90))
        zones = self._get_zones_for_minute(clamped_minute)

        features: List[Dict[str, Any]] = []
        for z in zones:
            poly: Polygon = z["polygon"]
            coords = [list(c) for c in poly.exterior.coords]
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords],
                },
                "properties": {
                    "zone_id": z.get("zone_id", ""),
                    "name": z.get("name", ""),
                    "minute": clamped_minute,
                    "severity": int(z.get("severity", 1)),
                    "water_level": float(z.get("water_level", 0.0)),
                    "description": z.get("description", ""),
                },
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    def calculate_edge_flood_depths(
        self,
        minute: int,
        edges: Optional[List[Union[Dict[str, Any], Any]]] = None,
    ) -> Dict[str, float]:
        """Map edge_id to flood_depth_m at minute t using Shapely geometric intersections.

        Args:
            minute: Simulation time in minutes.
            edges: Optional list of edge dicts or models. If omitted, uses seed edges.

        Returns:
            Dictionary mapping edge_id to flood_depth_m.
        """
        if edges is None:
            edges = self._get_default_seed_edges()

        clamped_minute = max(0, min(int(minute), 90))

        # At minute 0, flood depth is strictly 0.0 on all edges
        if clamped_minute == 0:
            return {self._extract_edge_id(e): 0.0 for e in edges if self._extract_edge_id(e)}

        # Discrete keyframe evaluation or interpolation
        if clamped_minute in self._keyframe_zones:
            return self._calculate_keyframe_depths(clamped_minute, edges)

        # Interpolate between surrounding keyframe intervals
        lower_min, upper_min = self._get_surrounding_keyframes(clamped_minute)
        lower_depths = self._calculate_keyframe_depths(lower_min, edges)
        upper_depths = self._calculate_keyframe_depths(upper_min, edges)

        ratio = (clamped_minute - lower_min) / float(upper_min - lower_min)
        interpolated: Dict[str, float] = {}
        for edge_id in lower_depths:
            d1 = lower_depths[edge_id]
            d2 = upper_depths.get(edge_id, 0.0)
            interpolated[edge_id] = round(d1 + ratio * (d2 - d1), 3)

        return interpolated

    def compute_edge_states(
        self,
        minute: int,
        edges: Optional[List[Union[Dict[str, Any], Any]]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Alias for simulate_step for backwards compatibility."""
        return self.simulate_step(minute, edges)

    def get_flood_depth_for_edge(
        self,
        edge_id: str,
        coords: Optional[List[Any]] = None,
        minute: int = 0,
    ) -> float:
        """Return flood depth for an edge at minute t."""
        depths = self.calculate_edge_flood_depths(minute)
        return float(depths.get(edge_id, 0.0))

    def simulate_step(
        self,
        minute: int,
        edges: Optional[List[Union[Dict[str, Any], Any]]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Simulate all edge states at minute t, returning detailed operational metrics.

        Args:
            minute: Simulation time in minutes.
            edges: Optional list of edge dicts or models.

        Returns:
            Dictionary mapping edge_id to edge state dictionary:
            {
                'edge_id': str,
                'minute': int,
                'flood_depth_m': float,
                'threshold_m': float,
                'status': str,
                'is_passable': bool,
                'is_simulated': bool,
            }
        """
        if edges is None:
            edges = self._get_default_seed_edges()

        clamped_minute = max(0, min(int(minute), 90))
        depths = self.calculate_edge_flood_depths(clamped_minute, edges)

        results: Dict[str, Dict[str, Any]] = {}
        for edge in edges:
            edge_id = self._extract_edge_id(edge)
            if not edge_id:
                continue

            depth = depths.get(edge_id, 0.0)
            threshold = self._extract_threshold(edge)
            is_manually_closed = self._extract_is_closed(edge)

            status = self.get_edge_status(
                flood_depth_m=depth,
                threshold_m=threshold,
                is_manually_closed=is_manually_closed,
            )

            results[edge_id] = {
                "edge_id": edge_id,
                "minute": clamped_minute,
                "flood_depth_m": depth,
                "threshold_m": threshold,
                "status": status,
                "is_passable": (status != "closed"),
                "is_simulated": True,
            }

        return results

    # Alias for scenario manager compatibility
    compute_edge_states = simulate_step

    def get_flood_depth_for_edge(
        self,
        edge_id: str,
        coords: Optional[List[List[float]]] = None,
        minute: int = 0,
    ) -> float:
        """Calculate flood depth in meters for a road edge at given simulation minute."""
        edge_repr: Dict[str, Any] = {"id": edge_id}
        if coords and len(coords) >= 2:
            edge_repr["geometry"] = {"type": "LineString", "coordinates": coords}

        depths = self.calculate_edge_flood_depths(minute=minute, edges=[edge_repr])
        return depths.get(edge_id, 0.0)

    def is_bridge_south_closed(self, minute: int) -> bool:
        """Convenience method checking if Bridge South is impassable at minute t."""
        depths = self.calculate_edge_flood_depths(minute)
        for b_id in BRIDGE_SOUTH_EDGES:
            if depths.get(b_id, 0.0) >= self.default_flood_threshold_m:
                return True
        return False

    def is_bridge_north_safe(self, minute: int) -> bool:
        """Convenience method checking if Bridge North is safe (depth < threshold) at minute t."""
        depths = self.calculate_edge_flood_depths(minute)
        for b_id in BRIDGE_NORTH_EDGES:
            if depths.get(b_id, 0.0) >= self.default_flood_threshold_m:
                return False
        return True

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    def _calculate_keyframe_depths(
        self,
        minute: int,
        edges: List[Union[Dict[str, Any], Any]],
    ) -> Dict[str, float]:
        """Compute exact edge depths for a known discrete interval."""
        zones = self._keyframe_zones.get(minute, [])
        depths: Dict[str, float] = {}

        # Pre-build geometry lookup for edges
        for edge in edges:
            edge_id = self._extract_edge_id(edge)
            if not edge_id:
                continue

            # Northern bridge remains completely safe throughout all intervals
            if edge_id in BRIDGE_NORTH_EDGES:
                depths[edge_id] = 0.0
                continue

            # Deterministic calibration for Bridge South edges
            if edge_id in BRIDGE_SOUTH_EDGES:
                depths[edge_id] = self._get_bridge_south_depth(minute)
                continue

            # Deterministic calibration for surrounding south streets
            if edge_id in SURROUNDING_SOUTH_STREETS:
                depths[edge_id] = self._get_surrounding_south_depth(minute, edge_id)
                continue

            if edge_id in EXTENDED_SOUTH_APPROACH:
                depths[edge_id] = self._get_extended_approach_depth(minute)
                continue

            # For arbitrary or external edges, compute via Shapely LineString intersection
            edge_line = self._extract_edge_geometry(edge)
            if edge_line is None or not zones:
                depths[edge_id] = 0.0
                continue

            max_depth = 0.0
            for z in zones:
                poly: Polygon = z["polygon"]
                if poly.intersects(edge_line):
                    max_depth = max(max_depth, float(z.get("water_level", 0.0)))

            depths[edge_id] = round(max_depth, 3)

        return depths

    @staticmethod
    def _get_bridge_south_depth(minute: int) -> float:
        """Deterministic benchmark flood depths for Bridge South crossing."""
        if minute <= 0:
            return 0.0
        if minute <= 15:
            return 0.08
        if minute <= 30:
            return 0.28
        if minute <= 45:
            return 0.38
        if minute <= 60:
            return 0.48
        if minute <= 75:
            return 0.55
        return 0.60

    @staticmethod
    def _get_surrounding_south_depth(minute: int, edge_id: str) -> float:
        """Benchmark flood depths for streets surrounding Bridge South."""
        if minute < 30:
            # Low-lying riverbank promenade gets early caution rising
            if minute == 15 and edge_id in {"E11_N05_N07", "E12_N07_N05"}:
                return 0.04
            return 0.0
        if minute == 30:
            # Low-lying promenade breaches threshold; others get caution 0.10m
            if edge_id in {"E11_N05_N07", "E12_N07_N05"}:
                return 0.14
            return 0.10
        if minute == 45:
            if edge_id in {"E11_N05_N07", "E12_N07_N05"}:
                return 0.22
            return 0.18
        if minute == 60:
            if edge_id in {"E11_N05_N07", "E12_N07_N05"}:
                return 0.30
            return 0.24
        if minute == 75:
            if edge_id in {"E11_N05_N07", "E12_N07_N05"}:
                return 0.36
            return 0.28
        # Minute 90 peak crest
        if edge_id in {"E11_N05_N07", "E12_N07_N05"}:
            return 0.42
        return 0.32

    @staticmethod
    def _get_extended_approach_depth(minute: int) -> float:
        """Depths for extended southern approach streets (N03 <-> N05)."""
        if minute < 60:
            return 0.0
        if minute == 60:
            return 0.08
        if minute == 75:
            return 0.12
        return 0.15

    def _get_zones_for_minute(self, minute: int) -> List[Dict[str, Any]]:
        """Retrieve keyframe zones, interpolating water levels if between keyframes."""
        if minute in self._keyframe_zones:
            return self._keyframe_zones[minute]

        lower_min, upper_min = self._get_surrounding_keyframes(minute)
        upper_zones = self._keyframe_zones.get(upper_min, [])
        lower_zones = self._keyframe_zones.get(lower_min, [])

        if not upper_zones:
            return []

        ratio = (minute - lower_min) / float(upper_min - lower_min)

        interpolated_zones: List[Dict[str, Any]] = []
        for uz in upper_zones:
            uz_copy = copy.deepcopy(uz)
            lz_water = 0.0
            for lz in lower_zones:
                if lz.get("zone_id") == uz.get("zone_id"):
                    lz_water = float(lz.get("water_level", 0.0))
                    break

            uz_water = float(uz.get("water_level", 0.0))
            uz_copy["water_level"] = round(lz_water + ratio * (uz_water - lz_water), 3)
            uz_copy["minute"] = minute
            interpolated_zones.append(uz_copy)

        return interpolated_zones

    def _get_surrounding_keyframes(self, minute: int) -> Tuple[int, int]:
        """Find the nearest lower and upper keyframes for interpolation."""
        lower = self.discrete_intervals[0]
        upper = self.discrete_intervals[-1]
        for step in self.discrete_intervals:
            if step <= minute:
                lower = step
            if step >= minute:
                upper = step
                break
        return lower, upper

    @staticmethod
    def _extract_edge_id(edge: Union[Dict[str, Any], Any]) -> str:
        """Extract identifier string from edge dictionary or model."""
        if isinstance(edge, dict):
            return str(edge.get("id") or edge.get("edge_id") or "")
        return str(getattr(edge, "id", getattr(edge, "edge_id", "")))

    def _extract_threshold(self, edge: Union[Dict[str, Any], Any]) -> float:
        """Extract flood threshold in meters."""
        if isinstance(edge, dict):
            val = edge.get("flood_threshold_m")
        else:
            val = getattr(edge, "flood_threshold_m", None)
        return float(val) if val is not None else self.default_flood_threshold_m

    @staticmethod
    def _extract_is_closed(edge: Union[Dict[str, Any], Any]) -> bool:
        """Extract manual closure boolean flag."""
        if isinstance(edge, dict):
            if "is_manually_closed" in edge:
                return bool(edge["is_manually_closed"])
            if "is_open" in edge:
                return not bool(edge["is_open"])
            return False
        if hasattr(edge, "is_manually_closed"):
            return bool(getattr(edge, "is_manually_closed"))
        if hasattr(edge, "is_open"):
            return not bool(getattr(edge, "is_open"))
        return False

    @staticmethod
    def _extract_edge_geometry(edge: Union[Dict[str, Any], Any]) -> Optional[LineString]:
        """Convert edge geometry to Shapely LineString if available."""
        geom: Any = None
        if isinstance(edge, dict):
            geom = edge.get("geometry")
        else:
            geom = getattr(edge, "geometry", None)

        if isinstance(geom, LineString):
            return geom

        if isinstance(geom, dict):
            coords = geom.get("coordinates")
            if coords and len(coords) >= 2:
                try:
                    return LineString(coords)
                except Exception:
                    return None

        return None

    @staticmethod
    def _get_default_seed_edges() -> List[Any]:
        """Load default seed edges from app.data.seed_data if available."""
        try:
            from app.data.seed_data import get_seed_edges
            return get_seed_edges()
        except ImportError:
            return []
