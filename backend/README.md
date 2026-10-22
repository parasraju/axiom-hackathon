# SafeRoute Backend API

FastAPI-powered disaster-response simulation and hazard-aware evacuation navigation backend.

## Architecture

- **`app/models/schemas.py`**: Pydantic v2 data models for road nodes, edges, flood zones, shelters, routing candidates, and scenario snapshots.
- **`app/data/seed_data.py`**: Riverdale city demo dataset with 12 nodes, 26 edges, 2 river crossings (Bridge North elevated and Bridge South low underpass), 4 shelters, and 3 evacuation origins.
- **`app/graph/road_network.py`**: NetworkX directed road graph engine with distance metrics, wheelchair stair exclusion, and dynamic GeoJSON export.
- **`app/simulation/flood_model.py`**: Time-step flood progression engine (minutes 0, 15, 30, 45, 60, 75, 90) with water depth modeling and polygon generation.
- **`app/simulation/congestion.py`**: Bureau of Public Roads (BPR) volume-delay delay modeling ($T = T_0 (1 + 0.15 (V/C)^4)$).
- **`app/assignment/shelter_allocator.py`**: Capacity-constrained crowd evacuation engine with strict zero-overbooking enforcement and overflow redirection.
- **`app/routing/router.py`**: Dynamic safe router applying hard constraints (water depth, closures, wheelchair stairs), soft hazard penalties, alternative routes, and heuristic resilience scores (0-100).
- **`app/reports/verifier.py`**: Citizen hazard report submission, deduplication, corroboration scoring, and operator moderation.
- **`app/simulation/scenario_manager.py`**: Authoritative scenario orchestrator precomputing timeline snapshots for instant client-side scrubbing.
- **`app/api/endpoints.py`**: REST API endpoints for frontend consumption.

## Setup & Running

```bash
# Run backend server
uv run --python backend/.venv uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation available at `http://localhost:8000/docs`.

## Running Tests

```bash
uv run --python backend/.venv pytest backend/tests/
```
