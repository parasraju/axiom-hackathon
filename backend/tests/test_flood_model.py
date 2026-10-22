"""Unit and integration tests for FloodSimulator."""

import pytest
from shapely.geometry import LineString, Polygon

from app.data.seed_data import SEED_EDGES, get_seed_edges
from app.simulation.flood_model import (
    BRIDGE_NORTH_EDGES,
    BRIDGE_SOUTH_EDGES,
    SURROUNDING_SOUTH_STREETS,
    FloodOriginZone,
    FloodSimulator,
)


def test_flood_simulator_init():
    sim = FloodSimulator()
    assert sim.discrete_intervals == [0, 15, 30, 45, 60, 75, 90]
    assert sim.default_flood_threshold_m == 0.20
    assert len(sim.origin_zones) >= 1
    for oz in sim.origin_zones:
        assert isinstance(oz, FloodOriginZone)
        assert isinstance(oz.polygon, Polygon)
        assert len(oz.bounding_box) == 4


def test_minute_0_zero_flood():
    sim = FloodSimulator()
    depths = sim.calculate_edge_flood_depths(minute=0)

    # Every single edge must have 0.0m flood depth
    assert len(depths) > 0
    for edge_id, depth in depths.items():
        assert depth == 0.0

    # Status must be normal on all edges
    step_results = sim.simulate_step(minute=0)
    for edge_id, state in step_results.items():
        assert state["flood_depth_m"] == 0.0
        assert state["status"] == "normal"
        assert state["is_passable"] is True

    # GeoJSON FeatureCollection must be empty
    geojson = sim.get_flood_geojson(minute=0)
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 0


def test_minute_15_initial_rise():
    sim = FloodSimulator()
    depths = sim.calculate_edge_flood_depths(minute=15)

    # Bridge South edges get depth ~0.08m
    for b_id in BRIDGE_SOUTH_EDGES:
        assert depths[b_id] == 0.08
        status = sim.get_edge_status(depths[b_id], threshold_m=0.20)
        assert status == "caution"

    # Northern bridge remains completely safe (0.0m)
    for b_id in BRIDGE_NORTH_EDGES:
        assert depths[b_id] == 0.0
        assert sim.get_edge_status(depths[b_id], threshold_m=0.20) == "normal"

    # GeoJSON verification
    geojson = sim.get_flood_geojson(minute=15)
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) >= 1
    first_feat = geojson["features"][0]
    assert first_feat["properties"]["minute"] == 15
    assert first_feat["properties"]["water_level"] == 0.08
    assert first_feat["properties"]["severity"] == 1


def test_minute_30_breach_and_caution():
    sim = FloodSimulator()
    depths = sim.calculate_edge_flood_depths(minute=30)

    # Bridge South reaches depth ~0.28m > 0.20m threshold -> status 'closed'
    for b_id in BRIDGE_SOUTH_EDGES:
        assert depths[b_id] == 0.28
        assert depths[b_id] > 0.20
        status = sim.get_edge_status(depths[b_id], threshold_m=0.20)
        assert status == "closed"

    # Bridge South helper reports closed
    assert sim.is_bridge_south_closed(minute=30) is True

    # Surrounding streets get 0.10m caution (e.g. E09, E10, E21, E22)
    for s_id in ["E09_N05_N06", "E10_N06_N05", "E21_N10_N11", "E22_N11_N10"]:
        assert depths[s_id] == 0.10
        status = sim.get_edge_status(depths[s_id], threshold_m=0.20)
        assert status == "caution"

    # Northern bridge remains completely safe (0.0m)
    for b_id in BRIDGE_NORTH_EDGES:
        assert depths[b_id] == 0.0
        assert sim.get_edge_status(depths[b_id], threshold_m=0.20) == "normal"

    assert sim.is_bridge_north_safe(minute=30) is True

    # GeoJSON contains breach properties
    geojson = sim.get_flood_geojson(minute=30)
    water_levels = [f["properties"]["water_level"] for f in geojson["features"]]
    assert 0.28 in water_levels
    assert 0.10 in water_levels


def test_minute_60_southern_expansion():
    sim = FloodSimulator()
    depths = sim.calculate_edge_flood_depths(minute=60)

    # Flood expands further into southern quadrant
    for b_id in BRIDGE_SOUTH_EDGES:
        assert depths[b_id] == 0.48
        assert sim.get_edge_status(depths[b_id], threshold_m=0.20) == "closed"

    # Northern bridge remains safe (0.0m)
    for b_id in BRIDGE_NORTH_EDGES:
        assert depths[b_id] == 0.0
        assert sim.get_edge_status(depths[b_id], threshold_m=0.20) == "normal"

    assert sim.is_bridge_north_safe(minute=60) is True
    assert sim.is_bridge_south_closed(minute=60) is True


def test_minute_90_peak_cresting():
    sim = FloodSimulator()
    depths = sim.calculate_edge_flood_depths(minute=90)

    # Bridge South reaches peak crest 0.60m
    for b_id in BRIDGE_SOUTH_EDGES:
        assert depths[b_id] == 0.60
        assert sim.get_edge_status(depths[b_id], threshold_m=0.20) == "closed"

    # Northern bridge remains safe (0.0m)
    for b_id in BRIDGE_NORTH_EDGES:
        assert depths[b_id] == 0.0
        assert sim.get_edge_status(depths[b_id], threshold_m=0.20) == "normal"

    assert sim.is_bridge_north_safe(minute=90) is True


def test_get_edge_status_logic():
    # Both static and instance calls
    sim = FloodSimulator()

    # Normal: depth 0.0
    assert FloodSimulator.get_edge_status(0.0, 0.20, False) == "normal"
    assert sim.get_edge_status(0.0, 0.20, False) == "normal"

    # Caution: depth > 0.0 and < threshold
    assert FloodSimulator.get_edge_status(0.08, 0.20, False) == "caution"
    assert FloodSimulator.get_edge_status(0.19, 0.20, False) == "caution"

    # Closed: depth >= threshold
    assert FloodSimulator.get_edge_status(0.20, 0.20, False) == "closed"
    assert FloodSimulator.get_edge_status(0.28, 0.20, False) == "closed"
    assert FloodSimulator.get_edge_status(0.60, 0.20, False) == "closed"

    # Closed: manual closure even with 0 depth
    assert FloodSimulator.get_edge_status(0.0, 0.20, True) == "closed"
    assert FloodSimulator.get_edge_status(0.05, 0.20, True) == "closed"


def test_geojson_feature_properties():
    sim = FloodSimulator()

    for minute in [15, 30, 45, 60, 75, 90]:
        geojson = sim.get_flood_geojson(minute)
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) >= 1

        for feature in geojson["features"]:
            assert feature["type"] == "Feature"
            assert feature["geometry"]["type"] == "Polygon"
            coords = feature["geometry"]["coordinates"][0]
            # Valid closed polygon ring: first == last
            assert coords[0] == coords[-1]
            assert len(coords) >= 4

            props = feature["properties"]
            assert "severity" in props
            assert "minute" in props
            assert "water_level" in props
            assert props["minute"] == minute
            assert props["severity"] in (1, 2, 3, 4)
            assert props["water_level"] > 0.0


def test_custom_edges_with_shapely_intersection():
    sim = FloodSimulator()

    # Custom edge crossing the southern river corridor
    custom_edges = [
        {
            "id": "custom_south_crossing",
            "geometry": {
                "type": "LineString",
                "coordinates": [[74.8730, 31.6320], [74.8780, 31.6320]],
            },
            "flood_threshold_m": 0.25,
        },
        {
            "id": "custom_north_crossing",
            "geometry": {
                "type": "LineString",
                "coordinates": [[74.8730, 31.6410], [74.8780, 31.6410]],
            },
            "flood_threshold_m": 0.25,
        },
    ]

    depths_30 = sim.calculate_edge_flood_depths(minute=30, edges=custom_edges)
    assert depths_30["custom_south_crossing"] > 0.0
    assert depths_30["custom_north_crossing"] == 0.0

    step = sim.simulate_step(minute=30, edges=custom_edges)
    assert step["custom_south_crossing"]["flood_depth_m"] > 0.0
    assert step["custom_north_crossing"]["flood_depth_m"] == 0.0
    assert step["custom_north_crossing"]["status"] == "normal"


def test_minute_interpolation():
    sim = FloodSimulator()

    # Minute 20 is between 15 (depth 0.08) and 30 (depth 0.28)
    depths_20 = sim.calculate_edge_flood_depths(minute=20)
    for b_id in BRIDGE_SOUTH_EDGES:
        assert 0.08 < depths_20[b_id] < 0.28

    # Clamping tests: < 0 clamped to 0, > 90 clamped to 90
    depths_neg = sim.calculate_edge_flood_depths(minute=-10)
    for b_id in BRIDGE_SOUTH_EDGES:
        assert depths_neg[b_id] == 0.0

    depths_high = sim.calculate_edge_flood_depths(minute=120)
    for b_id in BRIDGE_SOUTH_EDGES:
        assert depths_high[b_id] == 0.60
