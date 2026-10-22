import pytest

from app.simulation.congestion import CongestionModel, get_bottlenecks


def test_congestion_model_defaults():
    model = CongestionModel()
    assert model.alpha == 0.15
    assert model.beta == 4.0
    assert model.default_capacity == 400
    assert model.max_multiplier == 6.0


def test_zero_flow():
    model = CongestionModel()
    edges = [{"id": "edge_1", "baseline_travel_time_s": 50.0, "capacity": 400}]
    flows = {"edge_1": 0}

    results = model.update_congestion(edges, flows)
    res = results["edge_1"]

    assert res["congestion_ratio"] == 0.0
    assert res["travel_time_s"] == 50.0
    assert not res["is_congested"]
    assert not res["is_overloaded"]


def test_congested_threshold():
    model = CongestionModel()
    # 80% capacity = 320 volume on 400 capacity
    edges = [{"id": "edge_1", "baseline_travel_time_s": 100.0, "capacity": 400}]
    flows = {"edge_1": 320}

    results = model.update_congestion(edges, flows)
    res = results["edge_1"]

    assert res["congestion_ratio"] == 0.8
    assert res["is_congested"] is True
    assert res["is_overloaded"] is False

    # 1.0 + 0.15 * (0.8 ** 4) = 1.0 + 0.15 * 0.4096 = 1.06144 -> 100 * 1.06144 = 106.1
    assert res["travel_time_s"] == 106.1


def test_capacity_at_unity():
    model = CongestionModel()
    # 100% capacity = 400 volume on 400 capacity
    edges = [{"id": "edge_1", "baseline_travel_time_s": 100.0, "capacity": 400}]
    flows = {"edge_1": 400}

    results = model.update_congestion(edges, flows)
    res = results["edge_1"]

    assert res["congestion_ratio"] == 1.0
    assert res["is_congested"] is True
    assert res["is_overloaded"] is False
    # 100 * (1 + 0.15 * 1^4) = 115.0
    assert res["travel_time_s"] == 115.0


def test_overloaded_and_bottlenecks():
    model = CongestionModel()
    edges = [
        {"id": "e_normal", "baseline_travel_time_s": 60.0, "capacity": 400},
        {"id": "e_heavy", "baseline_travel_time_s": 60.0, "capacity": 400},
        {"id": "e_overload", "baseline_travel_time_s": 60.0, "capacity": 400},
    ]
    flows = {
        "e_normal": 100,    # 0.25
        "e_heavy": 360,     # 0.90 -> congested, not overloaded
        "e_overload": 500,  # 1.25 -> congested and overloaded
    }

    results = model.update_congestion(edges, flows)

    assert not results["e_normal"]["is_congested"]
    assert not results["e_normal"]["is_overloaded"]

    assert results["e_heavy"]["is_congested"]
    assert not results["e_heavy"]["is_overloaded"]

    assert results["e_overload"]["is_congested"]
    assert results["e_overload"]["is_overloaded"]

    bottlenecks = model.get_bottlenecks(results)
    assert bottlenecks == ["e_overload"]

    # Also test static/module get_bottlenecks
    assert get_bottlenecks(results) == ["e_overload"]


def test_max_multiplier_clamping():
    model = CongestionModel()
    # Massive overload: volume = 5000 on capacity = 100 (ratio = 50)
    # Unbounded 1 + 0.15 * (50^4) = massive, should be clamped to 6.0
    edges = [{"id": "e_jam", "baseline_travel_time_s": 10.0, "capacity": 100}]
    flows = {"e_jam": 5000}

    results = model.update_congestion(edges, flows)
    res = results["e_jam"]

    assert res["travel_time_s"] == 60.0  # 10.0 * 6.0
    assert res["is_congested"] is True
    assert res["is_overloaded"] is True


def test_edge_id_variations_and_default_capacity():
    model = CongestionModel(default_capacity=250)
    edges = [
        # using 'edge_id' instead of 'id', and omitting capacity
        {"edge_id": "route_A", "baseline_travel_time_s": 40.0},
        # using 'id' with custom capacity
        {"id": "route_B", "baseline_travel_time_s": 20.0, "capacity": 500},
    ]
    flows = {
        "route_A": 250,  # ratio = 250 / 250 = 1.0
        "route_B": 100,  # ratio = 100 / 500 = 0.2
    }

    results = model.update_congestion(edges, flows)

    assert "route_A" in results
    assert "route_B" in results
    assert results["route_A"]["congestion_ratio"] == 1.0
    assert results["route_B"]["congestion_ratio"] == 0.2


def test_missing_flow_defaults_to_zero():
    model = CongestionModel()
    edges = [{"id": "e_empty", "baseline_travel_time_s": 30.0}]
    results = model.update_congestion(edges, {})

    assert results["e_empty"]["congestion_ratio"] == 0.0
    assert results["e_empty"]["travel_time_s"] == 30.0
    assert not results["e_empty"]["is_congested"]
    assert not results["e_empty"]["is_overloaded"]


def test_calculate_edge_metrics_standalone():
    model = CongestionModel()
    res = model.calculate_edge_metrics(
        baseline_travel_time_s=100.0,
        volume=500,
        capacity=400,
    )
    assert res["congestion_ratio"] == 1.25
    assert res["is_congested"] is True
    assert res["is_overloaded"] is True
    # 1.0 + 0.15 * (1.25 ** 4) = 1.0 + 0.15 * 2.44140625 = 1.36621 -> 136.6
    assert res["travel_time_s"] == 136.6
