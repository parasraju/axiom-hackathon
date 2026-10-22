# SafeRoute — Hackathon Pitch

Disaster-Aware Evacuation Platform

---

## Elevator version (30 seconds, if you only get one shot)

> Google Maps finds the fastest route. During a flood, the fastest route is the one that
> drowns you. SafeRoute is a disaster-aware evacuation platform: it simulates how water,
> crowds, and shelter capacity evolve over 90 minutes, then recalculates a route that is
> not just fast, but survivable. It models wheelchair constraints, prevents shelter
> overbooking, and lets authorities override the map live — all over a real road network,
> with 103 passing backend tests.

---

# Full 3-Minute Pitch Script

Word count ~430, so it fits 3 minutes with demo pauses.

## Slide 1 — Problem (20s)

> In a real evacuation, three things change every minute: where the water is, where the
> crowd is, and which shelter still has room. Existing navigation apps know none of these.
> They optimize for the shortest path on a dry day. In Riverdale's monsoon scenario, that
> path goes straight through Bridge South — which is 0.28 metres underwater by minute 30.
>
> People do not die because the route was long. They die because the route was wrong and
> nobody updated it in time.

## Slide 2 — Solution (20s)

> SafeRoute is a deterministic disaster-response simulator plus a hazard-aware router. It
> models a 12-intersection road network as a directed graph, simulates flood inundation on a
> 15-minute timeline, and recalculates safe routes as conditions change.
>
> We are not predicting the flood. We are making the evacuation logic correct for whatever
> conditions are on screen.

## Demo 1 — Flood kills the route (40s)

> Here is T+0. Every road is green. I plan a route from Downtown Central to Riverdale West
> High School — the system picks Bridge South, the fastest crossing.
>
> Now I advance the slider to T+30. Water expands over the south basin, Bridge South crosses
> its 0.18-metre threshold and turns red, and the route **recalculates automatically** — it
> reroutes north via Bridge North.
>
> Nobody clicked anything. The map changed, so the answer changed.

## Demo 2 — Accessibility (30s)

> Destination: Hilltop Plateau. In pedestrian mode, the route takes the direct stone stairs —
> fastest.
>
> I switch to wheelchair. Stairs are a hard constraint, not a penalty. They are removed from
> the graph entirely, and the route moves onto the paved ramp. A route that cannot be walked
> is not an alternative.

## Demo 3 — Shelters (25s)

> Now the crowd problem. One click assigns every origin population across shelters. The
> allocator sorts by travel time, then fills each shelter strictly to capacity and spills the
> overflow to the next reachable one.
>
> Zero overbooking. If people cannot be placed, it tells us why: no capacity, or no passable
> route.

## Demo 4 — Authority override (20s)

> Authorities are not passive here. I can force-close a bridge, or verify a citizen flood
> report. Two corroborating reports in the same 15-minute window auto-verify it, and that
> closure propagates through the whole timeline. Every action is audit-logged.

## Slide 5 — Tech (25s)

> Backend is FastAPI and Python 3.13, Pydantic v2 for every contract, NetworkX for Dijkstra,
> Shapely for real flood-polygon geometry. Frontend is React 19, TypeScript, Vite, and
> MapLibre rendering live GeoJSON layers.
>
> Routing cost is travel time, penalized by congestion, plus a 300-point hazard penalty. Each
> route gets a resilience score — and we label it honestly as a heuristic, not a probability
> field. 103 tests pass.

## Slide 6 — Why it wins (30s)

> Four things make this different. One: the route is tied to time — scrubbing the timeline is
> the core interaction, not a settings page. Two: constraints are hard, not soft. Three:
> simulation and UI share the same data contract, so what you see is what the router actually
> used. Four: it degrades gracefully — no backend, and the UI falls back to a bundled
> timeline.
>
> SafeRoute is not a prettier map. It is an evacuation decision engine with a map on top.

---

# Slide Deck Outline

| # | Slide | One line on it |
|---|-------|----------------|
| 1 | Problem | Fastest route != safe route. Bridge South is closed at T+30. |
| 2 | Product | Timeline-driven evacuation router + shelter allocator + authority console |
| 3 | Live demo | The four demo beats above |
| 4 | Architecture | React/MapLibre -> FastAPI -> NetworkX + Shapely + BPR |
| 5 | Differentiators | Hard constraints, time-coupled routing, honest scoring, offline fallback |
| 6 | Impact + roadmap | Real OSM import, live sensor feed, multi-agency sync |

---

# Differentiators (repeat these if judges push)

1. **Time is the primary axis, not a filter.** The route is a function of the minute, so it
   invalidates itself when conditions change.
2. **Hard constraints instead of penalties.** Flooded and stair edges are deleted from the
   graph, so an inaccessible route is structurally impossible to return.
3. **Capacity is decremented during allocation**, not checked afterward — that is what makes
   zero overbooking provable rather than approximate.
4. **Corroboration scoring** (0.35 base, +0.35 per corroborating report, auto-verify at 0.70)
   turns noisy citizen reports into a graded signal.
5. **Deterministic and tested.** Same timeline every run, 103 tests — demoable without
   network access.

---

# Likely Judge Questions

## "Is the flood data real?"

> No — it is a calibrated simulated scenario for Riverdale, with explicit keyframe depths.
> The architecture takes any polygon source; swapping in a real DEM or sensor feed changes
> the data adapter, not the router.

## "How is this different from Google Maps with traffic?"

> Traffic is one variable and it is observed. We handle two hazard variables that are
> predicted forward in time, plus capacity constraints on both roads and shelters, plus
> accessibility. And it recalculates on a scenario timeline rather than live traffic.

## "What is the resilience score actually measuring?"

> A deduction heuristic: -15 per caution segment, -10 per congested segment, -20 if the route
> passes within 200 m of an active flood zone, clamped to 5-100. We surface
> `score_type: heuristic_not_probability` in the API precisely so nobody mistakes it for a
> flood-risk probability.

## "What breaks at city scale?"

> Timeline precomputation is O(edges x keyframes) and currently synchronous. At city scale we
> would precompute in a worker, cache per scenario version, and use contraction hierarchies
> instead of plain Dijkstra. The data contract already supports it.

## "Who is the user?"

> Three: an evacuee choosing a route, an emergency operations officer assigning crowds and
> closing roads, and a citizen submitting a hazard report that feeds verification.

---

# Tech Stack (reference for slides)

| Layer | Tech | Role |
|-------|------|------|
| Frontend | React 19, TypeScript 6, Vite 8 | SPA shell, state, build |
| UI | Tailwind 3, lucide-react | Styling and icons |
| Map | MapLibre GL 6 + raster tiles (CARTO/OSM) | Map render, GeoJSON layers, markers, popups |
| Backend | Python 3.13, FastAPI, Uvicorn | REST API, OpenAPI docs |
| Models | Pydantic v2 | Request/response validation |
| Graph | NetworkX DiGraph | Road network + Dijkstra routing |
| Geometry | Shapely | Flood polygons, line intersection, distance checks |
| Tests | pytest (103 tests) | backend/tests/ |

No database. All state lives in a singleton `ScenarioManager` in memory; the timeline is
precomputed and cached.

---

# Core Numbers to Memorize

- Timeline: T+0 to T+90 minutes, 7 keyframes (0/15/30/45/60/75/90)
- Network: 12 intersections, directed edges, Riverdale
- Flood closure threshold: 0.20 m (Bridge South hits 0.28 m at T+30)
- BPR congestion: `t = baseline * (1 + 0.15 * (v/c)^4)`, capped at 6x
- Route hazard penalty: 300 points on caution segments
- Resilience score: -15 caution, -10 congested, -20 near flood, clamped 5-100
- Report auto-verify: 0.35 base, +0.35 per corroboration, threshold 0.70
- Tests: 103 passing

---

# Closing Line

> We built the thing that should have existed before the last flood: a map that changes its
> mind when the water rises.

---

# Before You Present

Open README.md:65 and walk the five demo beats once, out loud, with the app running. That is
the 15-minute rehearsal that decides the pitch.

Run commands:

```
cd backend
uv run --python .venv uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

cd frontend
npm run dev
```
