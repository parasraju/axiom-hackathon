"""Comprehensive unit tests for ScenarioManager in SafeRoute simulation engine."""

from __future__ import annotations

import sys
from pathlib import Path
import pytest

# Ensure app is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.simulation.scenario_manager import ScenarioManager


def test_scenario_manager_initialization():
    mgr = ScenarioManager("monsoon_demo")
    assert mgr.scenario_id == "monsoon_demo"
    assert mgr.current_minute == 0
    assert mgr.active_minute == 0
    assert len(mgr.nodes) == 12
    assert len(mgr.edges) >= 20
    assert len(mgr.shelters) == 4
    assert len(mgr.origins) == 3
    assert isinstance(mgr.manual_closures, dict)
    assert isinstance(mgr.audit_log, list)


def test_build_timeline_and_snapshots():
    mgr = ScenarioManager("monsoon_demo")
    timeline = mgr.get_timeline("monsoon_demo")
    assert len(timeline) == 7
    expected_minutes = [0, 15, 30, 45, 60, 75, 90]
    for idx, snap in enumerate(timeline):
        assert snap["scenario_id"] == "monsoon_demo"
        assert snap["minute"] == expected_minutes[idx]
        assert snap["edges_geojson"]["type"] == "FeatureCollection"
        assert snap["flood_geojson"]["type"] == "FeatureCollection"
        assert len(snap["shelters"]) == 4
        assert len(snap["origins"]) == 3
        assert "metrics" in snap
        metrics = snap["metrics"]
        assert "total_evacuees" in metrics
        assert "assigned_count" in metrics
        assert "unassigned_count" in metrics
        assert "bottleneck_edges_count" in metrics
        assert "closed_edges_count" in metrics
        assert metrics["assigned_count"] + metrics["unassigned_count"] == metrics["total_evacuees"]


def test_edge_geojson_properties():
    mgr = ScenarioManager("monsoon_demo")
    snap_30 = mgr.get_snapshot("monsoon_demo", 30)
    features = snap_30["edges_geojson"]["features"]
    assert len(features) > 0

    south_bridge = next((f for f in features if f["id"] == "E15_BRIDGE_SOUTH_EW"), None)
    assert south_bridge is not None
    props = south_bridge["properties"]
    assert "id" in props
    assert "status" in props
    assert "flood_depth_m" in props
    assert "congestion_ratio" in props
    assert "travel_time_s" in props
    assert "color" in props
    assert "is_passable" in props
    assert props["color"] in ("green", "amber", "red")

    # At minute 30, South Bridge is flooded above 0.18m threshold
    assert props["flood_depth_m"] >= 0.20
    assert props["status"] == "closed"
    assert props["color"] == "red"
    assert props["is_passable"] is False


def test_advance_time_and_audit():
    mgr = ScenarioManager("monsoon_demo")
    initial_log_len = len(mgr.get_audit_log())

    snap = mgr.advance_time("monsoon_demo", 45)
    assert mgr.current_minute == 45
    assert mgr.active_minute == 45
    assert snap["minute"] == 45

    logs = mgr.get_audit_log()
    assert len(logs) == initial_log_len + 1
    assert logs[-1]["action"] == "simulation_advanced"
    assert logs[-1]["details"]["target_minute"] == 45


def test_toggle_edge_closure_and_recomputation():
    mgr = ScenarioManager("monsoon_demo")
    initial_log_len = len(mgr.get_audit_log())

    # At minute 0, E01_N01_N02 is normally open
    snap_before = mgr.get_snapshot(0)
    e01_before = next(f for f in snap_before["edges_geojson"]["features"] if f["id"] == "E01_N01_N02")
    assert e01_before["properties"]["status"] == "normal"
    assert e01_before["properties"]["is_passable"] is True

    # Manually close E01_N01_N02
    mgr.toggle_edge_closure("monsoon_demo", "E01_N01_N02", False, "Emergency hazard barrier")
    assert mgr.manual_closures["E01_N01_N02"] is False

    # Check that snapshot at minute 0 now reflects closure
    snap_after = mgr.get_snapshot(0)
    e01_after = next(f for f in snap_after["edges_geojson"]["features"] if f["id"] == "E01_N01_N02")
    assert e01_after["properties"]["status"] == "closed"
    assert e01_after["properties"]["color"] == "red"
    assert e01_after["properties"]["is_passable"] is False

    logs = mgr.get_audit_log()
    assert len(logs) == initial_log_len + 1
    assert logs[-1]["action"] == "manual_edge_closure_toggle"
    assert logs[-1]["details"]["edge_id"] == "E01_N01_N02"
    assert logs[-1]["details"]["is_open"] is False


def test_reset_scenario():
    mgr = ScenarioManager("monsoon_demo")
    mgr.advance_time("monsoon_demo", 60)
    mgr.toggle_edge_closure("monsoon_demo", "E01_N01_N02", False, "test closure")
    assert mgr.current_minute == 60
    assert len(mgr.manual_closures) == 1

    snap = mgr.reset_scenario("monsoon_demo")
    assert mgr.current_minute == 0
    assert len(mgr.manual_closures) == 0
    assert snap["minute"] == 0

    logs = mgr.get_audit_log()
    assert logs[-1]["action"] == "scenario_reset"
