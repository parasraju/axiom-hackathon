---
aliases:
- SafeRoute
- Emergency Navigation Simulator
status: planning
tags:
- project
- simulation
- disaster-management
- routing
- GIS
title: SafeRoute --- Disaster-Aware Evacuation Simulator
---

# SafeRoute --- Full Project Blueprint

> \[!abstract\] Project goal Build a disaster-response simulation
> platform that models how roads, floods, congestion, crowds, and
> shelter capacity change over time, then recalculates safe evacuation
> routes. The first release is a **simulation and decision-support
> prototype**, not a certified real-world emergency navigation system.

## 1. Executive summary

Ordinary navigation generally optimizes travel time or distance. During
a disaster, the fastest route may be flooded, blocked, congested, unsafe
for a wheelchair user, or lead to a full shelter.

SafeRoute combines:

-   An interactive road-network map.
-   Time slider for scenario simulation at +0, +30, +60, and +90
    minutes.
-   Flood and road-blockage scenarios.
-   Safety-aware, time-dependent route finding.
-   Route alternatives and a route-survival estimate.
-   Crowd assignment and congestion modelling.
-   Shelter-capacity-aware destination assignment.
-   Verified community incident reports.
-   Mobility profiles for vulnerable users.
-   An emergency-authority dashboard.
-   Offline-first PWA support and a clearly labelled SMS-fallback
    prototype.

### Primary demo story

1.  Show the city and several evacuation origins.
2.  Calculate the normal shortest/fastest route.
3.  Advance the simulation by 30 minutes.
4.  Watch simulated flood zones expand and road segments change from
    green to amber/red.
5.  Show the original route becoming invalid or riskier.
6.  Recalculate routes and show why the alternative is safer.
7.  Send different groups to different routes and shelters to prevent
    overload.
8.  Fill one shelter, then show the system redirecting new evacuees.
9.  Switch the interface offline and show cached map/scenario data.

## 2. Scope and safety boundaries

### What the prototype can claim

-   It simulates road closures, flood severity, congestion, and shelter
    occupancy using configured scenario data.
-   It can compare routing strategies under the same scenario.
-   It can demonstrate a forecast-style survival estimate **only if the
    estimate is derived from an explicit model and its uncertainty is
    shown**.
-   It can use external road, weather, and flood information as
    contextual inputs, with source and timestamp displayed.

### What it must not claim

-   Do not label synthetic flood propagation as a real flood forecast.
-   Do not call a route "safe" merely because an algorithm returned it.
-   Do not present "passable for 47 minutes" as fact unless a validated,
    time-dependent prediction model supports that estimate.
-   Do not use coarse river-discharge forecasts as street-level flood
    depth. River forecasts can be useful context but do not directly
    predict which individual streets are inundated.
-   Do not make a real emergency response depend on the demo or
    unverified crowd reports.
-   Do not send real emergency SMS messages without an explicitly
    configured provider, consent, rate limits, and operational
    safeguards.

For a hackathon, clearly label simulated data and show the assumptions.
Real-world use requires authoritative data, validation, accessibility
testing, and coordination with emergency-management agencies.

## 3. Users and interfaces

### A. Evacuee interface

-   Select a start point on the map or use device location with
    permission.
-   Select a safe destination or shelter.
-   Choose a mobility profile: standard walking, wheelchair-accessible,
    elderly/limited mobility, or emergency vehicle (simulation profile).
-   View the recommended route, alternate route, estimated travel time,
    known hazards, and data freshness.
-   Receive a clear warning if no route can be verified.
-   View cached map and last-downloaded instructions when offline.

### B. Operations dashboard

-   Start, pause, reset, and scrub through a disaster scenario.
-   Toggle flood, congestion, road closure, and incident-report layers.
-   Close or reopen road segments manually.
-   Set population origins and evacuation demand.
-   Monitor routes, estimated flow, bottlenecks, and shelter occupancy.
-   Mark a report as verified, rejected, or uncertain.
-   Broadcast simulated alerts and review the audit log.

### C. Scenario configuration panel

-   Scenario name and start time.
-   Flood spread rate and severity.
-   Rainfall/river input (optional).
-   Road-blockage events and timestamps.
-   Population by zone.
-   Shelter capacity and service availability.
-   Evacuation demand curve.
-   Random seed so a demo is reproducible.

## 4. Recommended stack

Choose one coherent stack and avoid adding unnecessary services before
the simulation works.

  --------------------------------------------------------------------------
  Layer                   Recommended choice         Why
  ----------------------- -------------------------- -----------------------
  Frontend                React + TypeScript + Vite  Fast iteration, typed
                                                     UI

  Styling                 Tailwind CSS               Consistent dashboard
                                                     layout

  Map                     MapLibre GL JS             Interactive map and
                                                     styled layers

  Basemap                 OpenStreetMap-compatible   Road and place context;
                          tiles                      check provider terms

  Road data               OpenStreetMap extract or   Build a local road
                          Overpass for small test    graph
                          areas                      

  Backend API             Python + FastAPI           Routing, scenario and
                                                     simulation endpoints

  Graph algorithms        NetworkX initially; custom Easy algorithm
                          adjacency graph if needed  experimentation

  Spatial processing      GeoPandas + Shapely        Geometry, point/line
                                                     intersection, spatial
                                                     joins

  Database                PostgreSQL + PostGIS       Road geometries, zones,
                                                     incidents, shelters

  Fast prototype storage  JSON/GeoJSON files +       Simplify first
                          SQLite                     milestone

  Background jobs         In-process scenario runner Add Redis/Celery only
                          initially                  if genuinely needed

  Charts                  Recharts or ECharts        Metrics and time-series
                                                     display

  Offline PWA             Service worker + IndexedDB Cache shell, scenario
                                                     and selected map data

  Testing                 pytest + Vitest +          Unit, component, and
                          Playwright                 end-to-end tests

  Deployment              Static frontend + API      Keep frontend and
                          container                  backend independently
                                                     deployable
  --------------------------------------------------------------------------

**Practical recommendation:** start with React/TypeScript, MapLibre,
FastAPI, NetworkX, and static GeoJSON. Introduce PostGIS after the core
graph and simulation are working. Do not start with machine learning,
live feeds, SMS, and complex infrastructure simultaneously.

## 5. High-level system architecture

``` mermaid
flowchart TB
    U[Evacuee PWA] --> FE[React + TypeScript UI]
    O[Operations Dashboard] --> FE
    FE --> API[FastAPI REST API]
    FE --> CACHE[Service Worker + IndexedDB]
    API --> SC[Scenario Manager]
    API --> ROUTE[Routing Engine]
    API --> CROWD[Crowd Assignment Engine]
    API --> SHELTER[Shelter Manager]
    API --> REPORT[Incident Report Verification]
    SC --> SIM[Time-Step Simulation Engine]
    SIM --> GRAPH[Dynamic Road Graph]
    ROUTE --> GRAPH
    CROWD --> ROUTE
    CROWD --> SHELTER
    REPORT --> GRAPH
    DATA[OSM / Scenario GeoJSON / Optional Weather Inputs] --> INGEST[Data Ingestion + Validation]
    INGEST --> GRAPH
    INGEST --> DB[(PostgreSQL + PostGIS or prototype files)]
    SC --> DB
    SHELTER --> DB
    REPORT --> DB
    API --> AUDIT[Audit Events + Metrics]
```

### Core architectural rule

Keep the simulation clock and the scenario state authoritative on the
backend. The frontend sends commands such as "advance to +60 minutes"
and renders the resulting state. This prevents different browser
components from independently inventing inconsistent flood or occupancy
states.

For a fully local demo, the simulation can run in the browser or a
single backend process. The data contracts should remain the same so
components can be moved later.

## 6. End-to-end data pipeline

``` mermaid
flowchart TD
    A[Choose city/test area] --> B[Acquire road and place data]
    B --> C[Validate CRS, geometry and attributes]
    C --> D[Build nodes and road edges]
    D --> E[Attach baseline speed, travel time and accessibility]
    E --> F[Load scenario events]
    F --> G[Advance simulation clock]
    G --> H[Calculate flood/blockage/congestion state]
    H --> I[Update edge passability and cost]
    I --> J[Find feasible routes]
    J --> K[Assign evacuees and shelter destinations]
    K --> L[Update edge flow and shelter occupancy]
    L --> M{Congestion or capacity changed materially?}
    M -- Yes --> N[Recompute affected assignments]
    N --> L
    M -- No --> O[Publish scenario snapshot]
    O --> P[Map, metrics, alerts and audit log]
    P --> G
```

### Data provenance fields

Every external or simulated dataset should have:

-   `source_name`
-   `source_url` (where applicable)
-   `retrieved_at`
-   `valid_time` or scenario timestamp
-   `resolution`
-   `is_simulated`
-   `confidence` or quality status
-   `license_or_attribution`

Do not silently mix simulated data with observed or forecast data.

## 7. Data model

A prototype can use typed Python models and GeoJSON files. Use these
logical entities even if the first version stores them in memory.

### Road node

``` json
{
  "id": "node_100",
  "lon": 74.8723,
  "lat": 31.6340,
  "kind": "intersection"
}
```

### Road edge

``` json
{
  "id": "edge_204",
  "from_node": "node_100",
  "to_node": "node_101",
  "length_m": 180,
  "baseline_speed_kmh": 25,
  "modes": ["walk", "wheelchair", "vehicle"],
  "flood_threshold_m": 0.15,
  "is_open": true,
  "geometry": {
    "type": "LineString",
    "coordinates": [[74.8723, 31.6340], [74.8731, 31.6345]]
  }
}
```

The example threshold is a **demo configuration only**, not a universal
safety standard. Thresholds must be mode-specific and approved by
relevant authorities before real use.

### Edge state at a simulation time

``` json
{
  "edge_id": "edge_204",
  "scenario_id": "monsoon_demo",
  "minute": 30,
  "flood_depth_m": 0.08,
  "congestion_ratio": 0.65,
  "status": "caution",
  "travel_time_s": 48,
  "is_passable": true,
  "is_simulated": true
}
```

### Shelter

``` json
{
  "id": "shelter_01",
  "name": "Demo Shelter North",
  "lon": 74.8750,
  "lat": 31.6380,
  "capacity": 500,
  "occupancy": 120,
  "accessible": true,
  "services": ["first_aid", "water"],
  "status": "open"
}
```

### Incident report

``` json
{
  "id": "report_101",
  "reporter_id_hash": "pseudonymous-demo-id",
  "edge_id": "edge_204",
  "kind": "road_flooded",
  "reported_at": "2026-10-22T06:30:00Z",
  "status": "pending",
  "verification_score": 0.0,
  "evidence_count": 1
}
```

Do not store unnecessary personal information. Avoid publicly exposing a
reporter's exact identity or location history.

### Simulation scenario

-   `id`, `name`, `seed`, `start_time`
-   `duration_minutes`, `time_step_minutes`
-   event list
-   population origins
-   shelters and capacities
-   model parameters
-   version and creation timestamp

## 8. Build the city road graph

### Step 8.1 --- Choose a bounded area

Start with a small, representative test area: a few kilometres across,
enough for multiple alternative routes and several shelters. A synthetic
city is acceptable for early development and makes results reproducible.

### Step 8.2 --- Acquire the data

Possible inputs:

1.  OpenStreetMap road data for the road network and mapped amenities.
2.  Hand-authored GeoJSON for flood zones, evacuation origins, and
    shelters.
3.  Synthetic incident events for the demo.
4.  Optional weather or river-discharge inputs for contextual analysis,
    with limitations clearly shown.

For a small area, an Overpass query can be convenient. For repeatable
development or larger areas, download an extract and process it locally.
Follow the relevant data and tile-provider usage terms and attribution
requirements.

### Step 8.3 --- Clean and normalize

-   Ensure all coordinates use WGS84 for GeoJSON exchange.
-   Use a suitable projected CRS for metric distance and spatial
    calculations.
-   Remove invalid or duplicate geometries.
-   Preserve one-way direction and road access restrictions when
    available.
-   Add edge length, baseline travel time, mode permissions, and source
    tags.
-   Handle disconnected components and missing road attributes.
-   Record data freshness.

### Step 8.4 --- Build graph structures

Represent intersections as nodes and road segments as directed edges. A
two-way road usually requires traversable edges in both directions.
One-way roads must not be treated as bidirectional.

For each edge store:

-   Distance and baseline speed.
-   Travel mode permissions.
-   Current and forecast hazard states.
-   Current congestion and capacity.
-   Closure reason and valid time range.
-   Accessibility constraints.

### Step 8.5 --- Render on the map

Use MapLibre layers for:

-   Road network.
-   Recommended route and alternatives.
-   Flood polygon/heat layer.
-   Closed roads.
-   Population origins.
-   Shelters, including occupancy.
-   Incident reports.
-   Evacuation flow arrows.

Keep the visual legend explicit: green = currently passable under this
scenario; amber = caution/uncertain; red = closed or prohibited by the
configured rule. These colors represent the model's current state, not
an official guarantee of safety.

## 9. Simulation engine and time slider

This is the centrepiece of the project.

### Time model

Use a deterministic discrete time-step model. For example:

-   Start: `t = 0 minutes`
-   Step size: 5 minutes
-   User can jump to +30, +60, or +90 minutes
-   The engine calculates every intermediate step so hazards and
    congestion do not jump arbitrarily from start to end.

The simulation should be reproducible with a fixed random seed.

### Scenario events

Represent changes as timestamped events:

``` json
[
  {"minute": 10, "type": "flood_expand", "zone_id": "zone_a", "severity": 1},
  {"minute": 20, "type": "road_close", "edge_id": "edge_204"},
  {"minute": 30, "type": "demand_increase", "origin_id": "zone_03", "people": 250}
]
```

### Simplified flood-spread model

For a hackathon simulation, create flood zones or grid cells with a
severity value. At each time step:

1.  Increase severity in configured source zones.
2.  Spread a fraction of severity to neighbouring cells based on the
    scenario's spread parameter.
3.  Optionally use elevation or hand-authored low-lying zones to bias
    spread.
4.  Apply a decay/drainage parameter if the scenario calls for it.
5.  Intersect flood geometry with road edges.
6.  Derive a simulated water-depth estimate for each affected edge.
7.  Convert that estimate to passable, caution, or closed according to
    explicit mode-specific demo thresholds.

This is a visualization model, **not a hydraulic model**. If you use
real elevation and hydrology data later, validate the results against
authoritative inundation maps and observed events.

### Simplified congestion model

At each step, estimate edge demand and capacity:

-   `flow_ratio = assigned_people_per_step / estimated_edge_capacity_per_step`
-   Below capacity: ordinary speed.
-   Near capacity: speed decreases.
-   Over capacity: queue grows and travel time rises.
-   If a queue exceeds a configured threshold, the edge becomes
    congested and rerouting can be triggered.

Keep units consistent. People-per-step and vehicles-per-hour cannot be
mixed without conversion.

### State update order

Use one fixed update sequence:

1.  Apply scheduled events.
2.  Update hazard fields.
3.  Update road passability.
4.  Recalculate edge costs.
5.  Route current demand.
6.  Estimate flow and queues.
7.  Update shelter arrivals and occupancy.
8.  Trigger capacity/congestion rerouting if necessary.
9.  Store snapshot and metrics.
10. Publish the snapshot to the frontend.

This order prevents a shelter from appearing available after it has
already received more people than its remaining capacity.

### Time slider behaviour

The UI should include:

-   Slider with labelled ticks at 0, 30, 60, 90 minutes.
-   Play/pause and reset.
-   Speed selector, such as 1×, 2×, 4×.
-   Current simulated time.
-   Layer toggles for flood, congestion, closures, crowd flow, and
    shelters.
-   A side-by-side baseline versus forecast comparison.
-   A warning label stating "SIMULATED SCENARIO" when using synthetic
    data.

Dragging the slider should request or select a cached scenario snapshot,
not create an unrelated simulation state in the browser.

## 10. Dynamic safe-routing engine

### Baseline routing

Start with Dijkstra's algorithm or A\* using travel time or distance as
the edge weight. Use the baseline route as a comparison point, not the
only recommendation.

### Dynamic edge cost

A useful prototype cost function is:

``` text
edge_cost =
    estimated_travel_time
  + hazard_penalty
  + congestion_penalty
  + accessibility_penalty
  + uncertainty_penalty
```

Hard constraints must be applied before cost optimization:

-   A closed edge is not traversable.
-   An edge prohibited for the selected mode is not traversable.
-   An edge exceeding a configured hazard limit for that mode is not
    traversable.
-   If no feasible path exists, report no verified route instead of
    returning the least-bad prohibited path.

Penalties should be interpretable and configurable. Do not let a large
time saving outweigh a hard safety constraint.

### Routing pipeline

``` mermaid
flowchart TD
    A[Origin + destination + mode] --> B[Load scenario snapshot]
    B --> C[Filter closed and prohibited edges]
    C --> D[Calculate time and risk costs]
    D --> E[Run A* or Dijkstra]
    E --> F[Generate candidate paths]
    F --> G[Check hazards across expected traversal times]
    G --> H[Score and rank feasible routes]
    H --> I[Return best route + alternatives + reasons]
    I --> J{New hazard or closure?}
    J -- Yes --> B
    J -- No --> K[Continue guidance with timestamp]
```

### Time-dependent route checking

A road may be passable now but unsafe when the evacuee reaches it. For
each route edge:

1.  Estimate the arrival time at that edge.
2.  Read the edge's predicted state at that time.
3.  Reject the route if the edge is expected to be closed or prohibited.
4.  Recompute the route if the scenario changes materially.
5.  Show the time of the last calculation and forecast horizon.

For a first version, discretize the route's travel into five-minute
buckets. Later, implement a time-dependent shortest-path algorithm where
edge cost depends on departure time and arrival time.

### Alternative routes

-   Return up to three candidate routes.
-   Compare estimated time, distance, hazard exposure, congestion, and
    number of uncertain segments.
-   Penalize routes that are almost identical if the UI promises
    meaningful alternatives.
-   Recalculate after closure, flood threshold crossing, or a material
    capacity change.

### Route survival score

This is a key demo feature, but define it honestly.

Do not simply call `100 - risk_penalty` a probability. Start with a
**route resilience score** (0--100) based on documented inputs, or use
labels such as "low / moderate / high modeled risk."

If you later want a probability that a route remains passable through a
forecast horizon, you need labelled historical/observed outcomes or a
validated physical/statistical model, calibrated probability estimates,
uncertainty bounds, and out-of-sample evaluation. The UI should say
"model estimate" and show assumptions and freshness.

For the MVP, display:

-   `Passable under current scenario: Yes/No/Uncertain`
-   `Known closed edges: N`
-   `Hazard exposure: Low/Moderate/High`
-   `Last updated: simulated minute N`
-   `Forecast confidence: Not calibrated` when using the toy model.

## 11. Crowd-aware routing and load balancing

A shortest path can become the wrong choice when thousands of people use
it simultaneously. Crowd-aware routing treats evacuation as an
assignment problem.

### Inputs

-   Population by origin zone.
-   Number of people needing evacuation.
-   Candidate routes from each origin.
-   Edge capacity per time step.
-   Shelter capacity and current occupancy.
-   Mode and accessibility requirements.
-   Priority policy set by the scenario operator.

### Iterative assignment algorithm

1.  Generate feasible candidate routes from each origin to suitable
    shelters.
2.  Estimate each route's current travel time and risk.
3.  Sort or prioritize demand using an explicit, auditable policy.
4.  Assign a batch of evacuees to the best route/shelter combination
    with available capacity.
5.  Add their expected flow to each edge.
6.  Recompute congestion and queues.
7.  Re-evaluate the assignments that depend on overloaded edges.
8.  Repeat until demand is assigned, the iteration limit is reached, or
    no feasible route remains.
9.  Report unassigned people and the exact reason.

Do not repeatedly reroute everyone every frame without hysteresis; this
causes route oscillation. Only reassign when the benefit or safety
change exceeds a configured threshold, or when a route/shelter becomes
infeasible.

### Capacity constraints

For each edge and time interval:

``` text
predicted_flow(edge, interval) <= configured_capacity(edge, interval)
```

This is a simplified model. Real road capacity varies by width,
direction, mode, terrain, obstruction, and incident conditions. The
prototype must identify capacity as a configurable assumption.

### Metrics to show

-   Total evacuees assigned.
-   People awaiting assignment.
-   Peak edge utilization.
-   Average and maximum predicted travel time.
-   Number of overloaded edges.
-   Route distribution by percentage.
-   Evacuation completion estimate under the scenario.

## 12. Shelter-capacity-aware assignment

A route is only useful if the destination can receive people.

### Shelter fields

-   Total capacity and current occupancy.
-   Reserved or unavailable places.
-   Accessibility features.
-   Available services (water, first aid, sanitation, etc.).
-   Operational state: open, restricted, full, closed, unknown.
-   Timestamp and source for capacity data.

### Assignment logic

1.  Filter shelters by operational status and accessibility needs.
2.  Calculate remaining capacity:
    `capacity - occupancy - reserved_places`.
3.  Calculate a feasible route to each candidate shelter.
4.  Reject a shelter if remaining capacity is zero or the route is
    infeasible.
5.  Rank candidates by travel time, hazard exposure, congestion, service
    fit, and load.
6.  Reserve capacity transactionally before confirming assignment.
7.  Increase occupancy only when arrival is simulated or confirmed,
    according to the model.
8.  If a shelter fills or closes, recalculate affected assignments.
9.  If all shelters are unavailable, clearly show "No verified
    destination available" and alert the operator.

For simultaneous assignments, update capacity in a single serialized
simulation step or use database transactions to prevent overbooking.

### Dashboard display

Each shelter card should show occupancy and capacity, such as
`320 / 500`, remaining places, accessibility status, incoming assigned
people, and operational status. Use a bar and text, not color alone.

## 13. Verified crowd reports

Crowd reports are useful but may be delayed, duplicated, mistaken, or
malicious.

### Report types

-   Road blocked.
-   Flooding observed.
-   Traffic stopped.
-   Bridge or underpass inaccessible.
-   Shelter full or closed.
-   Route obstruction.

### Verification pipeline

``` mermaid
flowchart TD
    A[User submits report] --> B[Validate fields and rate limit]
    B --> C[Match report to road or place]
    C --> D[Check timestamp and expiry]
    D --> E[Detect duplicates and nearby reports]
    E --> F[Compare with authoritative feeds and scenario state]
    F --> G[Calculate confidence / evidence score]
    G --> H{Confidence threshold?}
    H -- High --> I[Mark corroborated or auto-verified]
    H -- Medium --> J[Keep provisional / request more evidence]
    H -- Low --> K[Flag for review or reject]
    I --> L[Update routing state with audit record]
    J --> M[Show as unconfirmed; do not hard-close road automatically]
    K --> N[Retain moderation record]
```

### MVP verification rules

Use transparent rules rather than machine learning at first:

-   Freshness: newer reports count more.
-   Corroboration: independent reports close in time and location
    increase confidence.
-   Source reliability: historical accuracy may contribute, but do not
    expose sensitive reporter histories.
-   Consistency: compare against operator actions and available trusted
    feeds.
-   Contradictions: show conflicting reports and keep the state
    uncertain.
-   Expiry: reports automatically become stale and are not treated as
    current indefinitely.

Do not treat weather and elevation as proof that a specific road is
blocked. They are contextual evidence, not direct confirmation. Keep an
audit trail for every automated state change.

## 14. Vulnerable-user and accessibility mode

Build accessibility into the graph and route filters, not merely into
the UI.

### Profiles

-   Standard pedestrian.
-   Wheelchair-accessible.
-   Elderly / limited mobility (configurable slower walking speed and
    rest assumptions).
-   Emergency vehicle (separate simulated access and priority rules).

### Relevant edge attributes

-   Stairs and step-free access.
-   Surface type and condition where known.
-   Road/footpath width where known.
-   Slope/gradient where known.
-   Crossing type and curb ramps where mapped.
-   Flood restrictions.
-   Access permissions.

### Routing rules

-   Exclude known stairs for wheelchair profiles.
-   Exclude edges beyond configured gradient limits.
-   Use a profile-specific speed model.
-   Apply stricter hazard limits where the scenario specifies them.
-   Show unknown accessibility attributes explicitly; unknown is not the
    same as accessible.
-   Never claim an accessible route if critical edge attributes are
    missing.

The emergency-vehicle profile must be treated as a separate scenario
mode. Real vehicle access and priority routing require authoritative
permissions and coordination; do not assume every road is available.

## 15. Authority dashboard

### Main panels

1.  **Scenario controls:** play, pause, reset, time slider, event
    editor.
2.  **Map:** flood zones, closures, route flows, shelters, incident
    reports.
3.  **Evacuation KPIs:** people assigned, pending, arriving, and
    unassigned.
4.  **Road status:** open, caution, closed, unknown; closure reason and
    timestamp.
5.  **Shelter status:** occupancy, capacity, service availability,
    incoming demand.
6.  **Reports queue:** new, corroborated, disputed, stale, rejected.
7.  **Alerts:** scenario-generated warnings and their intended audience.
8.  **Audit timeline:** every operator action and automated routing
    change.

### Authority actions

-   Close/reopen a road.
-   Change a shelter status or capacity.
-   Verify/reject a report.
-   Create an event at a future simulated minute.
-   Broadcast a demo alert.
-   Export a scenario report.

All administrative actions should record who/what initiated the change,
timestamp, reason, previous state, new state, and scenario ID. For the
demo, use a seeded demo account rather than public admin access.

## 16. Offline PWA and SMS fallback

### Offline MVP

Cache:

-   App shell (HTML, JS, CSS).
-   A selected, bounded area's map data.
-   Last downloaded scenario snapshot.
-   Route geometry and instructions for the currently selected route.
-   Shelter information with a visible timestamp.
-   A small emergency-information page.

Use a service worker for static assets and IndexedDB for structured
data. Show an offline banner and the last sync time. Disable claims that
require live data when offline. Cached directions can become dangerously
stale, so display "last updated" and "offline --- conditions may have
changed."

### Offline pipeline

``` mermaid
flowchart TD
    A[Online app] --> B[Download selected area + scenario]
    B --> C[Validate and store in cache/IndexedDB]
    C --> D[Connectivity lost]
    D --> E[Load cached map and last snapshot]
    E --> F{Is the requested route available in cache?}
    F -- Yes --> G[Show cached route with stale-data warning]
    F -- No --> H[Show cached map and emergency guidance]
    G --> I[Queue permitted reports locally]
    H --> I
    I --> J[Connectivity restored]
    J --> K[Sync queued items with timestamps]
    K --> L[Resolve conflicts and refresh scenario]
```

### SMS fallback: staged implementation

Do not begin with real SMS. First build an SMS simulator panel that
accepts a mock message like `HELP + 30.123,74.456` and returns a
simulated response.

A real SMS service later requires:

-   An explicitly configured SMS provider and verified sender.
-   Consent, rate limiting, abuse prevention, and clear service
    limitations.
-   Parsing and validating the incoming location.
-   A current authoritative incident and routing source.
-   Safe response wording, timestamps, and an uncertainty warning.
-   Logging, retention rules, and an escalation plan.
-   Tests for invalid, stale, malicious, and duplicate messages.

SMS does not magically provide live routing when the backend or its data
sources are unavailable. If the service cannot verify current
conditions, it must say so rather than fabricate directions.

## 17. Optional data and ML extensions

### External data

Possible extensions include:

-   OpenStreetMap for roads and mapped amenities.
-   Official municipal or disaster-management road closures.
-   Authoritative flood inundation maps and hydrological products.
-   Weather forecasts and rainfall observations.
-   Elevation/terrain data.
-   Verified shelter feeds.

The Open-Meteo Flood API provides river-discharge forecasts at a
relatively coarse spatial resolution; it should be treated as
hydrological context, not a street-level flood-depth map. Check
licensing, coverage, timestamps, and local relevance before use. See
[Open-Meteo Flood API
documentation](https://open-meteo.com/en/docs/flood-api).

OSRM can be used as a baseline route service or source of alternative
paths, but a standard route service does not automatically understand
your custom flood states or shelter capacity. You still need your own
dynamic graph and constraints. See [OSRM API
documentation](https://project-osrm.org/docs/v5.22.0/api/).

For offline support, service workers can cache application resources and
support offline-first PWA patterns; see [MDN's PWA offline
guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation).

### ML should come later

A credible ML task could predict road-segment passability or travel-time
degradation using labelled historical events. Pipeline:

1.  Gather historical observations with timestamps and locations.
2.  Define the target label and prediction horizon.
3.  Split training and test data by event/time/location to avoid
    leakage.
4.  Train a simple baseline before trying more complex models.
5.  Calibrate probability outputs and quantify uncertainty.
6.  Compare against a non-ML baseline.
7.  Evaluate false-safe predictions separately; a false claim that a
    road is passable is especially serious.
8.  Monitor data drift and document when the model must abstain.

Do not add a model simply to call the project AI-powered. A
deterministic simulation is enough for a strong first demonstration.

## 18. API design

Suggested FastAPI routes:

  ------------------------------------------------------------------------------------------
  Method                  Endpoint                                   Purpose
  ----------------------- ------------------------------------------ -----------------------
  GET                     `/api/health`                              Service health

  GET                     `/api/map/roads?area=demo`                 Road network and
                                                                     metadata

  GET                     `/api/scenarios`                           List scenarios

  POST                    `/api/scenarios`                           Create a scenario

  GET                     `/api/scenarios/{id}`                      Scenario configuration

  POST                    `/api/scenarios/{id}/reset`                Reset deterministic
                                                                     state

  POST                    `/api/scenarios/{id}/advance`              Advance to a simulation
                                                                     minute

  GET                     `/api/scenarios/{id}/snapshot?minute=30`   Retrieve scenario
                                                                     snapshot

  POST                    `/api/routes/plan`                         Plan route for origin,
                                                                     destination, and mode

  POST                    `/api/evacuation/assign`                   Assign groups to routes
                                                                     and shelters

  GET                     `/api/shelters`                            Shelter list and
                                                                     current state

  PATCH                   `/api/shelters/{id}`                       Update shelter state
                                                                     (admin only)

  POST                    `/api/reports`                             Submit an incident
                                                                     report

  GET                     `/api/reports`                             Review reports (admin
                                                                     filters)

  POST                    `/api/reports/{id}/review`                 Verify/reject report

  POST                    `/api/roads/{id}/closure`                  Close/reopen road in a
                                                                     scenario

  GET                     `/api/metrics/{scenario_id}`               Simulation metrics and
                                                                     timeline

  GET                     `/api/audit/{scenario_id}`                 Scenario audit events
  ------------------------------------------------------------------------------------------

### Example route request

``` json
{
  "scenario_id": "monsoon_demo",
  "origin_id": "origin_01",
  "destination_id": "shelter_02",
  "departure_minute": 30,
  "mode": "wheelchair",
  "alternatives": 3
}
```

### Example route response

``` json
{
  "scenario_id": "monsoon_demo",
  "evaluated_minute": 30,
  "status": "route_found",
  "route_id": "route_02",
  "distance_m": 1850,
  "estimated_duration_s": 780,
  "resilience_score": 82,
  "score_type": "heuristic_not_probability",
  "warnings": ["One segment has incomplete accessibility data"],
  "alternatives": [],
  "data_freshness": {
    "scenario_snapshot_minute": 30,
    "external_data_timestamp": null,
    "is_simulated": true
  }
}
```

These are proposed contracts, not actual live API responses. Validate
inputs, bound request sizes, and use typed schemas.

## 19. Frontend pages and components

### Pages

-   `/` --- public evacuation map.
-   `/operations` --- authority dashboard.
-   `/scenario/:id` --- simulation detail.
-   `/shelters` --- shelter list and capacity.
-   `/reports` --- report submission/review.
-   `/offline` --- offline status and cached resources.

### Components

-   `MapCanvas`
-   `MapLegend`
-   `TimeSlider`
-   `ScenarioControls`
-   `HazardLayerToggle`
-   `RouteComparisonPanel`
-   `RouteMetricsCard`
-   `MobilityProfileSelect`
-   `ShelterCard`
-   `ShelterCapacityBar`
-   `EvacuationFlowLayer`
-   `IncidentReportForm`
-   `ReportVerificationQueue`
-   `KpiStrip`
-   `AuditTimeline`
-   `OfflineStatusBanner`

Keep state categories separate:

-   **Server state:** scenario snapshot, road graph metadata, shelter
    data.
-   **UI state:** open panel, selected layer, selected route, slider
    position.
-   **Simulation state:** authoritative scenario clock, event queue,
    edge states, demand, occupancy.
-   **Offline state:** cached timestamp, pending local reports, sync
    status.

## 20. Repository structure

``` text
saferoute/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── map/
│       │   │   ├── routing/
│       │   │   ├── simulation/
│       │   │   ├── shelters/
│       │   │   ├── reports/
│       │   │   └── offline/
│       │   ├── lib/
│       │   └── types/
│       └── public/
├── services/
│   └── api/
│       ├── app/
│       │   ├── api/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── data/
│       │   ├── simulation/
│       │   ├── graph/
│       │   ├── routing/
│       │   ├── assignment/
│       │   ├── shelters/
│       │   ├── reports/
│       │   └── audit/
│       └── tests/
├── data/
│   ├── roads/
│   ├── shelters/
│   ├── zones/
│   └── scenarios/
├── docs/
│   ├── architecture.md
│   ├── data-dictionary.md
│   ├── model-assumptions.md
│   └── demo-script.md
├── scripts/
│   ├── import_roads.py
│   └── validate_geojson.py
├── docker-compose.yml
└── README.md
```

## 21. Implementation roadmap

Work in vertical slices: each milestone should result in something that
runs and can be demonstrated.

### Phase 0 --- Define the demo (half day)

-   [ ] Choose a bounded city area or synthetic city.
-   [ ] Define 2--4 evacuation origins and 3--5 shelters.
-   [ ] Define one flood scenario, one closure event, and one congestion
    event.
-   [ ] Decide whether the first version uses real OSM geometry or
    synthetic roads.
-   [ ] Write down all simulation assumptions.
-   [ ] Create a fixed random seed and a scripted demo scenario.

**Done when:** the scenario can be explained in one minute and all test
data is reproducible.

### Phase 1 --- Map and road network (1--2 days)

-   [ ] Create the React/Vite project.
-   [ ] Add MapLibre and a compliant basemap.
-   [ ] Load roads, shelters, origins, and flood zones from GeoJSON.
-   [ ] Add map legend and layer toggles.
-   [ ] Build the road graph in Python.
-   [ ] Validate directions, disconnected components, and coordinate
    systems.

**Done when:** the city renders, road segments can be selected, and the
graph is inspectable.

### Phase 2 --- Baseline routing (1--2 days)

-   [ ] Implement Dijkstra or A\*.
-   [ ] Add origin/destination selection.
-   [ ] Draw the route on the map.
-   [ ] Show distance and estimated time.
-   [ ] Add alternative paths.
-   [ ] Write tests for shortest path, disconnected graphs, one-way
    roads, and invalid endpoints.

**Done when:** a route can be calculated and reproduced from a known
test fixture.

### Phase 3 --- Scenario clock and time slider (1--2 days)

-   [ ] Define scenario/event schema.
-   [ ] Implement reset and advance commands.
-   [ ] Add 0/30/60/90-minute slider marks.
-   [ ] Implement deterministic snapshots.
-   [ ] Add play/pause and playback speed.
-   [ ] Display "SIMULATED SCENARIO" for synthetic conditions.

**Done when:** jumping to +60 minutes always produces the same state for
the same seed and inputs.

### Phase 4 --- Flooding and closures (2--3 days)

-   [ ] Implement a toy flood-spread model.
-   [ ] Intersect flood zones with road edges.
-   [ ] Update edge status over time.
-   [ ] Add operator-controlled road closures.
-   [ ] Animate map colors as time advances.
-   [ ] Recalculate routes when edges close.
-   [ ] Show the reason an edge is blocked.

**Done when:** a route is valid at t=0, becomes infeasible or risky
later, and an alternative is found when possible.

### Phase 5 --- Safety-aware route alternatives (1--2 days)

-   [ ] Add mode-specific hard constraints.
-   [ ] Add hazard, congestion, and uncertainty costs.
-   [ ] Validate hazards at estimated edge-arrival times.
-   [ ] Return up to three feasible alternatives.
-   [ ] Show route comparison and model assumptions.
-   [ ] Label resilience as heuristic until calibrated.

**Done when:** a shorter route that crosses a prohibited edge is
rejected in favour of a feasible route, or the system abstains if none
exists.

### Phase 6 --- Crowd flow and congestion (2--4 days)

-   [ ] Add demand by origin zone.
-   [ ] Add edge capacities and queue estimates.
-   [ ] Assign groups to candidate routes.
-   [ ] Recalculate congestion as assignments accumulate.
-   [ ] Add route reassignment with hysteresis.
-   [ ] Display flow distribution and bottlenecks.
-   [ ] Test high-demand and no-feasible-route scenarios.

**Done when:** sending everyone through one route increases its modeled
congestion and the allocator spreads demand when alternatives exist.

### Phase 7 --- Shelter capacity (1--2 days)

-   [ ] Add shelter capacity and occupancy.
-   [ ] Add accessibility and service filters.
-   [ ] Route to feasible shelters.
-   [ ] Prevent over-capacity assignments.
-   [ ] Trigger reassignment when a shelter fills or closes.
-   [ ] Show unassigned people and reasons.

**Done when:** filling a shelter causes new assignments to use another
feasible shelter without overbooking either destination.

### Phase 8 --- Incident reports and authority tools (2--3 days)

-   [ ] Add report form and report types.
-   [ ] Add duplicate and stale-report detection.
-   [ ] Add confidence rules and review queue.
-   [ ] Add operator close/reopen actions.
-   [ ] Add audit history.
-   [ ] Ensure unconfirmed reports do not silently create permanent
    closures.

**Done when:** a report can be submitted, reviewed, applied to a
scenario, and traced in the audit log.

### Phase 9 --- Mobility and accessibility (1--2 days)

-   [ ] Add mobility profiles.
-   [ ] Mark known stairs, access restrictions, slopes, and barriers.
-   [ ] Apply profile-specific route constraints.
-   [ ] Show unknown data clearly.
-   [ ] Test cases where no accessible route exists.

**Done when:** profile changes can change the recommended route and
missing accessibility data is never presented as verified accessibility.

### Phase 10 --- Offline PWA (1--2 days)

-   [ ] Cache app shell.
-   [ ] Store a selected area's data and last scenario snapshot.
-   [ ] Add offline banner and last-sync time.
-   [ ] Display stale-data warnings.
-   [ ] Test airplane mode and reconnection.
-   [ ] Add a simulated SMS fallback panel if time permits.

**Done when:** the demo still opens and shows cached data with Wi-Fi
disabled, without pretending that live conditions are known.

### Phase 11 --- Polish, evaluate, and present (1--2 days)

-   [ ] Add responsive layout and keyboard support.
-   [ ] Add loading, empty, error, and no-route states.
-   [ ] Add scenario reset and deterministic demo script.
-   [ ] Record baseline versus SafeRoute comparisons.
-   [ ] Add automated tests and basic performance metrics.
-   [ ] Add README, architecture diagram, assumptions, and known
    limitations.
-   [ ] Rehearse the demo and prepare screenshots/video as backup.

**Estimated prototype effort:** approximately 2--4 weeks for a small
team familiar with the stack, depending on map-data preparation and the
amount of polish. A solo developer may need longer. Build the first six
phases before attempting all advanced features.

## 22. Test plan and evaluation

### Unit tests

-   Graph directionality and connectivity.
-   Edge-cost calculations.
-   Hazard hard constraints.
-   Time-dependent edge state.
-   Shelter capacity accounting.
-   Report confidence and expiry.
-   Deterministic simulation state.
-   Mobility profile filters.

### Integration tests

-   Advancing the clock updates road states.
-   Closed roads are removed from feasible routes.
-   A shelter reaching capacity triggers reassignment.
-   Crowd assignment changes edge congestion.
-   New verified incidents trigger route recalculation.
-   Offline cache loads the last saved snapshot.
-   Admin actions create audit events.

### End-to-end demo tests

1.  Open a scenario and calculate a baseline route.
2.  Advance to +30 minutes.
3.  Confirm the expected road changes to caution/closed.
4.  Confirm the original route is rejected or flagged.
5.  Confirm a feasible alternate route is shown.
6.  Increase demand and confirm congestion changes.
7.  Fill a shelter and confirm capacity-aware reassignment.
8.  Submit a road report and review it.
9.  Disable connectivity and confirm cached data appears with a
    stale-data warning.

### Quantitative metrics

  -----------------------------------------------------------------------
  Metric                              How to evaluate
  ----------------------------------- -----------------------------------
  Route feasibility                   Fraction of recommended routes that
                                      obey all configured hard
                                      constraints

  Recalculation latency               Time from a state-changing event to
                                      updated route output

  Evacuation assignment rate          People assigned to a feasible route
                                      and shelter / total demand

  Shelter overbooking                 Must be zero in the model

  Peak edge overload                  Count and severity of edges
                                      exceeding configured capacity

  Route resilience                    Compare outcomes after simulated
                                      closures/flood progression

  False-safe rate                     Routes marked feasible that violate
                                      known scenario constraints

  Offline readiness                   Required screens and cached
                                      scenario open without connectivity

  Reproducibility                     Same seed and inputs produce the
                                      same simulation snapshots
  -----------------------------------------------------------------------

For a strong project report, compare three baselines: shortest path
only, hazard-aware routing, and hazard + crowd + shelter-aware
assignment. Use the same scenarios and report both improvements and
trade-offs.

## 23. Suggested demo scenario

Use fictional or clearly labelled simulation data so you can control the
narrative.

### Starting conditions

-   Three evacuation origin zones.
-   Four shelters with different capacities.
-   One bridge/underpass that becomes impassable.
-   One low-lying zone where simulated flooding expands.
-   One narrow road that becomes congested.
-   One wheelchair-accessible profile.
-   A fixed population demand and random seed.

### Demo timeline

  -----------------------------------------------------------------------
  Simulated time          Event                   Expected visible result
  ----------------------- ----------------------- -----------------------
  00 min                  Normal conditions       Baseline shortest route
                                                  displayed

  15 min                  Flood zone begins       Nearby edges become
                          expanding               amber

  30 min                  Underpass closes        Route changes to an
                                                  alternative

  45 min                  Evacuation demand rises Route load and queue
                                                  estimates increase

  60 min                  Shelter A fills         New assignments move to
                                                  other shelters

  75 min                  Crowd report            Operator verifies and
                          corroborates a blockage applies the closure

  90 min                  Network is stressed     Dashboard shows
                                                  completed, pending, and
                                                  unassigned demand

  Offline                 Connectivity disabled   Cached map and last
                                                  state remain visible
                                                  with warnings
  -----------------------------------------------------------------------

## 24. Common failure modes

-   **Building too much before a working map:** make map + route the
    first deliverable.
-   **Calling synthetic flooding a prediction:** label it as simulation
    and document its limitations.
-   **Using only the shortest path:** apply hard constraints before
    optimization.
-   **Treating a river forecast as street-level depth:** use appropriate
    spatial data and do not overclaim.
-   **Inventing a survival probability:** use a transparent heuristic
    until calibrated.
-   **Overloading every route with penalties:** hard safety constraints
    must remain hard constraints.
-   **Infinite rerouting loops:** use thresholds, hysteresis, and a
    maximum iteration count.
-   **Overbooking shelters:** enforce capacity during assignment, not
    after it.
-   **Trusting one crowd report:** use expiry, corroboration, and
    operator review.
-   **Offline data appearing current:** always show last update and
    stale-data warnings.
-   **Uncontrolled scope:** postpone real SMS, ML, live feeds, and
    multi-user real-time synchronization until the core demo works.

## 25. Final MVP acceptance checklist

-   [ ] City map and road network render.
-   [ ] Baseline shortest/fastest route works.
-   [ ] Alternative routes are visible.
-   [ ] Time slider advances a deterministic scenario.
-   [ ] Flooding and closures change road status.
-   [ ] Unsafe edges cannot be selected by the route planner.
-   [ ] Route is recalculated when scenario state changes.
-   [ ] Route risk/resilience is clearly identified as a heuristic
    unless validated.
-   [ ] Crowd demand changes modeled congestion.
-   [ ] Evacuees are distributed across feasible paths.
-   [ ] Shelter capacity is respected.
-   [ ] Filled shelters trigger reassignment.
-   [ ] Reports can be reviewed and audited.
-   [ ] Mobility profile changes routing constraints.
-   [ ] Offline mode displays cached information and its timestamp.
-   [ ] Demo scenario can be reset and reproduced.
-   [ ] README includes data sources, attribution, assumptions,
    limitations, and test instructions.

## 26. Build order in one sentence

**Map → graph → baseline routing → deterministic time slider →
flood/closure simulation → dynamic safe routing → crowd assignment →
shelter capacity → verified reports → mobility modes → offline PWA →
evaluation and demo polish.**

This order creates a usable product at every stage and gives the project
a clear, judge-friendly progression.
