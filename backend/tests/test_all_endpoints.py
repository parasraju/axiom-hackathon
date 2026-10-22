"""Verify all 16 specified API endpoints for SafeRoute backend."""

import pytest
from starlette.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_endpoint_01_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "SafeRoute API", "version": "1.0.0"}


def test_endpoint_02_scenarios(client):
    r = client.get("/api/scenarios")
    assert r.status_code == 200
    assert len(r.json()) >= 1
    assert r.json()[0]["id"] == "monsoon_demo"


def test_endpoint_03_scenario_details(client):
    r = client.get("/api/scenarios/monsoon_demo")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "monsoon_demo"
    assert "current_minute" in data
    assert "shelters_count" in data


def test_endpoint_04_timeline(client):
    r = client.get("/api/scenarios/monsoon_demo/timeline")
    assert r.status_code == 200
    timeline = r.json()
    assert len(timeline) == 7
    minutes = [snap["minute"] for snap in timeline]
    assert minutes == [0, 15, 30, 45, 60, 75, 90]


def test_endpoint_05_snapshot(client):
    r = client.get("/api/scenarios/monsoon_demo/snapshot?minute=30")
    assert r.status_code == 200
    data = r.json()
    assert data["minute"] == 30
    assert "edges_geojson" in data
    assert "flood_geojson" in data


def test_endpoint_06_advance(client):
    r = client.post("/api/scenarios/monsoon_demo/advance", json={"minute": 45})
    assert r.status_code == 200
    assert r.json()["minute"] == 45


def test_endpoint_07_reset(client):
    r = client.post("/api/scenarios/monsoon_demo/reset")
    assert r.status_code == 200
    assert r.json()["minute"] == 0


def test_endpoint_08_closures(client):
    r = client.post(
        "/api/scenarios/monsoon_demo/closures",
        json={"edge_id": "E01_N01_N02", "is_open": False, "reason": "Operator drill"},
    )
    assert r.status_code == 200


def test_endpoint_09_routes_plan(client):
    payload = {
        "scenario_id": "monsoon_demo",
        "origin_id": "N01",
        "destination_id": "N09",
        "departure_minute": 0,
        "mode": "walk",
        "alternatives": 2,
    }
    r = client.post("/api/routes/plan", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "route_found"
    assert data["primary_route"] is not None
    assert len(data["alternatives"]) >= 1


def test_endpoint_10_evacuation_assign(client):
    payload = {
        "scenario_id": "monsoon_demo",
        "minute": 0,
        "mode": "walk",
    }
    r = client.post("/api/evacuation/assign", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["total_assigned"] > 0
    assert len(data["shelter_allocations"]) == 4


def test_endpoint_11_shelters(client):
    r = client.get("/api/shelters")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 4
    for shelter in data:
        assert "capacity" in shelter
        assert "occupancy" in shelter


def test_endpoint_12_patch_shelter(client):
    r = client.patch("/api/shelters/shelter_west_high", json={"capacity": 490, "status": "open"})
    assert r.status_code == 200
    assert r.json()["capacity"] == 490


def test_endpoint_13_reports_get(client):
    r = client.get("/api/reports")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_endpoint_14_reports_post(client):
    payload = {
        "edge_id": "E07_N03_N05",
        "kind": "road_flooded",
        "reported_minute": 15,
        "description": "Standing water on road",
    }
    r = client.post("/api/reports", json=payload)
    assert r.status_code == 200
    assert r.json()["edge_id"] == "E07_N03_N05"
    assert "id" in r.json()


def test_endpoint_15_reports_review(client):
    submit_r = client.post(
        "/api/reports",
        json={
            "edge_id": "E09_N05_N06",
            "kind": "debris_blocked",
            "reported_minute": 20,
            "description": "Fallen tree",
        },
    )
    rep_id = submit_r.json()["id"]

    review_r = client.post(
        f"/api/reports/{rep_id}/review",
        json={"decision": "verify", "notes": "Tree confirmed by camera"},
    )
    assert review_r.status_code == 200
    assert review_r.json()["status"] == "verified"


def test_endpoint_16_metrics(client):
    r = client.get("/api/metrics/monsoon_demo")
    assert r.status_code == 200
    data = r.json()
    assert data["scenario_id"] == "monsoon_demo"
    assert "metrics" in data
    assert "audit_log" in data
