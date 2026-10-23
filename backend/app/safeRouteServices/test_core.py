"""Run: python test_core.py   (tests the pipeline on built-in sample data)"""
from core import WeatherProvider, build_plan, risk_forecast
from graph import Network
from mock_data import make_mock
from weather_risk import preset_weather

FREE = {"shelter_west_high": 250, "shelter_south_stadium": 300,
        "shelter_hill_station": 200, "shelter_east_center": 150}


def _plan(weather="clear", minute=0, **kw):
    snap, tl = make_mock()
    return build_plan(snap, tl, preset_weather(weather), minute, free_override=FREE, **kw)


def test_plan_has_all_sections():
    res = _plan()
    assert {"weather", "free_seats", "optimal", "greedy", "comparison"} <= set(res)
    assert res["optimal"]["total_assigned"] > 0


def test_shelter_capacity_and_roads_respected():
    res = _plan("monsoon_building", 30)
    for a in res["optimal"]["shelter_allocations"]:
        assert a["assigned_count"] <= FREE[a["shelter_id"]]
    assert res["optimal"]["overloaded_edges"] == []


def test_worse_weather_means_less_reliable_plan():
    clear = _plan("clear", 30)["optimal"]["flows"]
    storm = _plan("cloudburst", 30)["optimal"]["flows"]
    avg = lambda fl: (sum(f["people"] * f["reliability"] for f in fl) / max(1, sum(f["people"] for f in fl)))
    assert not storm or avg(storm) <= avg(clear)


def test_cloudburst_flags_people_it_cannot_send_safely():
    res = _plan("cloudburst", 30)
    assert res["optimal"]["total_unassigned"] > 0
    assert res["optimal"]["unassigned_reasons"]


def test_optimal_plan_has_no_overloaded_roads_and_comparison_is_reported():
    res = _plan("monsoon_building", 30)
    assert res["optimal"]["overloaded_edges"] == []
    cmp_ = res["comparison"]
    assert set(cmp_["people_placed"]) == {"optimal", "greedy"}
    assert cmp_["expected_safe_arrivals"]["optimal"] > 0
    assert cmp_["people_on_risky_routes"]["optimal"] <= cmp_["people_on_risky_routes"]["greedy"]


def test_wheelchair_mode_avoids_inaccessible_shelter():
    res = _plan("clear", 0, mode="wheelchair")
    assert all(f["shelter_id"] != "shelter_hill_station" for f in res["optimal"]["flows"])


def test_risk_forecast_rises_with_storm():
    snap, tl = make_mock()
    net = Network(snap, tl)
    calm = risk_forecast(net, preset_weather("clear"), [0, 60])
    storm = risk_forecast(net, preset_weather("cloudburst"), [0, 60])
    eid = "E01_N01_N02"      # a road with no scripted hazard in the sample timeline
    assert storm[eid][60] > calm[eid][60]


def test_weather_provider_modes():
    wp = WeatherProvider(mode="clear")
    assert wp.get().source == "preset:clear"
    wp.set_mode("custom", {"rain_mm_h": 30, "humidity": 95})
    assert wp.get().hazard_at(60) > 0.2
    try:
        wp.set_mode("hurricane")
        assert False
    except ValueError:
        pass


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    failed = 0
    for name, fn in tests:
        try:
            fn(); print("PASS", name)
        except Exception as exc:
            failed += 1; print("FAIL", name, "->", repr(exc))
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)