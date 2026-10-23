"""Prints the evacuation plan for 3 weather situations. No server needed.

    python run_demo.py                      # built-in sample data
    python run_demo.py --backend http://localhost:8000 --scenario monsoon_demo --minute 30
"""
import argparse
import json
import urllib.request

from core import build_plan
from mock_data import make_mock
from weather_risk import preset_weather


def fetch(backend, scenario):
    def get(path):
        with urllib.request.urlopen(f"{backend}{path}", timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    snap = get(f"/api/scenarios/{scenario}/snapshot")
    try:
        tl = get(f"/api/scenarios/{scenario}/timeline")
    except Exception:
        tl = None
    return snap, tl


ap = argparse.ArgumentParser()
ap.add_argument("--backend", default="")
ap.add_argument("--scenario", default="monsoon_demo")
ap.add_argument("--minute", type=float, default=30)
a = ap.parse_args()

if a.backend:
    snapshot, timeline = fetch(a.backend, a.scenario)
    free = None
    print(f"Using REAL data from {a.backend}")
else:
    snapshot, timeline = make_mock()
    free = {"shelter_west_high": 250, "shelter_south_stadium": 300,
            "shelter_hill_station": 200, "shelter_east_center": 150}
    print("Using built-in SAMPLE data (hazards in it are invented)")

for weather in ("clear", "monsoon_building", "cloudburst"):
    plan = build_plan(snapshot, timeline, preset_weather(weather), a.minute, free_override=free)
    opt, cmp_ = plan["optimal"], plan["comparison"]
    print("\n" + "=" * 70)
    print(f"WEATHER: {weather}   (leaving at minute {a.minute:g}, solver: {opt['solver']})")
    print("why:", "; ".join(plan["weather"]["why"]))
    for f in opt["flows"]:
        print(f"  {f['origin_id']:>15} -> {f['shelter_id']:<22} {f['people']:>4} people  "
              f"route {'>'.join(f['route_nodes'])}  reliability {f['reliability']}")
    for origin, reason in opt["unassigned_reasons"].items():
        print(f"  NOT PLACED {origin}: {reason}")
    print(f"  placed: smart {cmp_['people_placed']['optimal']} | simple greedy {cmp_['people_placed']['greedy']}")
    print(f"  people sent onto risky routes: smart {cmp_['people_on_risky_routes']['optimal']} | "
          f"simple greedy {cmp_['people_on_risky_routes']['greedy']}")
print("\nDone.")