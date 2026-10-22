"""Bureau of Public Roads (BPR) Congestion Model for SafeRoute.

Calculates dynamic traffic and pedestrian congestion using the standard BPR
volume-delay formulation:
    travel_time = baseline_time * (1.0 + alpha * (volume / capacity) ** beta)
"""

from __future__ import annotations

from typing import Any


class CongestionModel:
    """Bureau of Public Roads (BPR) volume-delay congestion model.

    Attributes:
        alpha: BPR calibration parameter governing delay scaling (default: 0.15).
        beta: BPR power exponent controlling congestion onset steepness (default: 4.0).
        default_capacity: Default edge capacity in people or vehicles per step (default: 400).
        max_multiplier: Upper bound on travel time multiplier to prevent infinite delays (default: 6.0).
    """

    def __init__(
        self,
        alpha: float = 0.15,
        beta: float = 4.0,
        default_capacity: int = 400,
        max_multiplier: float = 6.0,
    ) -> None:
        self.alpha = float(alpha)
        self.beta = float(beta)
        self.default_capacity = int(default_capacity)
        self.max_multiplier = float(max_multiplier)

    def calculate_edge_metrics(
        self,
        baseline_travel_time_s: float,
        volume: int,
        capacity: int | None = None,
    ) -> dict[str, Any]:
        """Compute congestion metrics for a single edge.

        Args:
            baseline_travel_time_s: Uncongested free-flow travel time in seconds.
            volume: Current pedestrian or vehicle flow count on the edge.
            capacity: Maximum flow capacity of the edge per step (falls back to default_capacity).

        Returns:
            Dictionary with congestion_ratio, travel_time_s, is_congested, and is_overloaded.
        """
        edge_capacity = (
            int(capacity)
            if capacity is not None and capacity > 0
            else self.default_capacity
        )
        safe_capacity = max(edge_capacity, 1)
        safe_volume = max(int(volume), 0)

        ratio = safe_volume / safe_capacity
        raw_multiplier = 1.0 + self.alpha * (ratio**self.beta)
        multiplier = min(raw_multiplier, self.max_multiplier)

        effective_time_s = float(baseline_travel_time_s) * multiplier
        is_congested = ratio >= 0.8
        is_overloaded = ratio > 1.0

        return {
            "congestion_ratio": round(ratio, 2),
            "travel_time_s": round(effective_time_s, 1),
            "is_congested": is_congested,
            "is_overloaded": is_overloaded,
        }

    def update_congestion(
        self,
        edges: list[dict[str, Any]],
        edge_flows: dict[str, int],
    ) -> dict[str, dict[str, Any]]:
        """Calculate dynamic congestion metrics across all provided edges.

        Args:
            edges: List of edge dictionaries containing at least an identifier
                ('id' or 'edge_id') and 'baseline_travel_time_s', with optional 'capacity'.
            edge_flows: Mapping of edge identifier to current flow count.

        Returns:
            Mapping of edge_id to congestion metrics dictionary:
            {
                'congestion_ratio': float,
                'travel_time_s': float,
                'is_congested': bool,
                'is_overloaded': bool,
            }
        """
        results: dict[str, dict[str, Any]] = {}

        for edge in edges:
            edge_id_val = edge.get("id") if "id" in edge else edge.get("edge_id")
            if edge_id_val is None:
                continue
            edge_id = str(edge_id_val)

            # Retrieve volume matching string representation or raw key
            volume = edge_flows.get(edge_id, edge_flows.get(edge_id_val, 0))

            # Retrieve capacity with fallback to default_capacity
            capacity = edge.get("capacity", self.default_capacity)
            if capacity is None or capacity <= 0:
                capacity = self.default_capacity

            # Retrieve baseline travel time
            baseline_time = float(
                edge.get("baseline_travel_time_s", edge.get("travel_time_s", 0.0))
            )

            ratio = volume / max(capacity, 1)
            raw_multiplier = 1.0 + self.alpha * (ratio**self.beta)
            multiplier = min(raw_multiplier, self.max_multiplier)

            effective_time_s = baseline_time * multiplier
            is_congested = ratio >= 0.8
            is_overloaded = ratio > 1.0

            results[edge_id] = {
                "congestion_ratio": round(ratio, 2),
                "travel_time_s": round(effective_time_s, 1),
                "is_congested": is_congested,
                "is_overloaded": is_overloaded,
            }

        return results

    @staticmethod
    def get_bottlenecks(congestion_results: dict[str, dict[str, Any]]) -> list[str]:
        """Identify edges where demand exceeds capacity.

        Args:
            congestion_results: Output mapping from update_congestion.

        Returns:
            List of edge IDs where flow exceeds edge capacity (is_overloaded is True).
        """
        return [
            edge_id
            for edge_id, metrics in congestion_results.items()
            if metrics.get("is_overloaded", False)
            or metrics.get("congestion_ratio", 0.0) > 1.0
        ]


# Module-level convenience function / alias
get_bottlenecks = CongestionModel.get_bottlenecks
