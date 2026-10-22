import fallbackData from './fallbackTimeline.json';
import type {
  ScenarioSnapshot,
  RouteResponse,
  RouteCandidate,
  MobilityProfile,
  CrowdAssignResponse,
  Shelter,
} from '../types';

export const NODE_COORDINATES: Record<string, [number, number]> = {
  N01: [74.8710, 31.6420],
  N02: [74.8740, 31.6410],
  N03: [74.8720, 31.6370],
  N04: [74.8745, 31.6380],
  N05: [74.8715, 31.6330],
  N06: [74.8740, 31.6320],
  N07: [74.8730, 31.6280],
  N08: [74.8775, 31.6385],
  N09: [74.8810, 31.6400],
  N10: [74.8770, 31.6325],
  N11: [74.8820, 31.6310],
  N12: [74.8850, 31.6360],
};

export const ORIGIN_TO_NODE: Record<string, string> = {
  origin_north: 'N01',
  origin_east: 'N03',
  origin_central: 'N05',
};

export const SHELTER_TO_NODE: Record<string, string> = {
  shelter_west_high: 'N09',
  shelter_south_stadium: 'N11',
  shelter_hill_station: 'N12',
  shelter_east_center: 'N02',
  shelter_regional_overflow: 'N08',
};

export const BASELINE_SHELTERS: Shelter[] = [
  {
    id: 'shelter_west_high',
    name: 'Riverdale West High School',
    lon: 74.8810,
    lat: 31.6400,
    capacity: 450,
    occupancy: 0,
    accessible: true,
    services: ['first_aid', 'water', 'food', 'generator'],
    status: 'open',
  },
  {
    id: 'shelter_south_stadium',
    name: 'South Sports Complex & Arena',
    lon: 74.8820,
    lat: 31.6310,
    capacity: 500,
    occupancy: 0,
    accessible: true,
    services: ['emergency_cots', 'water', 'blankets'],
    status: 'open',
  },
  {
    id: 'shelter_hill_station',
    name: 'Hilltop Observation Center',
    lon: 74.8850,
    lat: 31.6360,
    capacity: 300,
    occupancy: 0,
    accessible: false,
    services: ['satellite_radio', 'emergency_shelter'],
    status: 'open',
  },
  {
    id: 'shelter_east_center',
    name: 'East Community Relief Center',
    lon: 74.8740,
    lat: 31.6410,
    capacity: 200,
    occupancy: 0,
    accessible: true,
    services: ['food', 'water', 'first_aid'],
    status: 'open',
  },
];

export const OVERFLOW_SHELTER: Shelter = {
  id: 'shelter_regional_overflow',
  name: 'Regional Airport Mutual Aid Staging Camp',
  lon: 74.8775,
  lat: 31.6385,
  capacity: 500,
  occupancy: 0,
  accessible: true,
  services: ['first_aid', 'emergency_cots', 'generator', 'water', 'food'],
  status: 'open',
};

// Generate realistic progressive baseline occupancy across timeline
const rawSnapshots = fallbackData as unknown as ScenarioSnapshot[];
export const FALLBACK_TIMELINE: ScenarioSnapshot[] = rawSnapshots.map((snap) => {
  const m = snap.minute;
  let sOcc = { west: 0, south: 0, east: 0, hill: 0 };
  if (m === 15) {
    sOcc = { west: 100, south: 120, east: 50, hill: 0 };
  } else if (m === 30) {
    sOcc = { west: 220, south: 250, east: 120, hill: 20 };
  } else if (m === 45) {
    sOcc = { west: 320, south: 360, east: 170, hill: 40 };
  } else if (m === 60) {
    sOcc = { west: 390, south: 440, east: 200, hill: 70 };
  } else if (m === 75) {
    sOcc = { west: 430, south: 480, east: 200, hill: 90 };
  } else if (m === 90) {
    sOcc = { west: 450, south: 500, east: 200, hill: 100 };
  }

  const updatedShelters = BASELINE_SHELTERS.map((s) => {
    let occ = 0;
    if (s.id === 'shelter_west_high') occ = sOcc.west;
    else if (s.id === 'shelter_south_stadium') occ = sOcc.south;
    else if (s.id === 'shelter_east_center') occ = sOcc.east;
    else if (s.id === 'shelter_hill_station') occ = sOcc.hill;

    return {
      ...s,
      occupancy: occ,
      status: (occ >= s.capacity ? 'full' : 'open') as 'open' | 'full' | 'closed',
    };
  });

  return {
    ...snap,
    shelters: updatedShelters,
  };
});

/**
 * Offline Route Planner: Evaluates Dijkstra shortest path using current minute's edge weights,
 * avoiding closed roads, waterlogged bridges, and mode constraints (e.g. stairs for wheelchairs).
 */
export function offlinePlanRoute(
  originId: string,
  destId: string,
  minute: number,
  mode: MobilityProfile = 'walk'
): RouteResponse {
  const resolvedOrigin = ORIGIN_TO_NODE[originId] || originId;
  const resolvedDest = SHELTER_TO_NODE[destId] || destId;

  const snapshot = FALLBACK_TIMELINE.find((s) => s.minute === minute) || FALLBACK_TIMELINE[0];
  const edgesFeatures = snapshot.edges_geojson?.features || [];

  // Build adjacency list for passable edges
  interface AdjEdge {
    edgeId: string;
    target: string;
    weight: number;
    hasStairs: boolean;
    floodDepth: number;
    coords: [number, number][];
  }

  const adj: Record<string, AdjEdge[]> = {};
  for (const feat of edgesFeatures) {
    const props = feat.properties as any;
    const u = props.from_node;
    const v = props.to_node;
    const status = props.status;
    const isOpen = props.is_open !== false;
    const floodDepth = Number(props.flood_depth_m || 0);
    const hasStairs = Boolean(props.has_stairs);
    const lengthM = Number(props.length_m || 300);
    const travelTime = Number(props.travel_time_s || lengthM / 1.4);

    // Filter by mode constraints
    if (!isOpen || status === 'closed') continue;
    if (mode === 'wheelchair' && (hasStairs || floodDepth > 0.10)) continue;
    if (mode === 'vehicle' && floodDepth > 0.20) continue;

    // Weight penalty for water and congestion
    const penalty = 1.0 + floodDepth * 3.0 + (props.congestion_ratio || 0) * 1.5;
    const weight = travelTime * penalty;

    const coords = (feat.geometry as any)?.coordinates || [
      NODE_COORDINATES[u] || [74.87, 31.63],
      NODE_COORDINATES[v] || [74.88, 31.64],
    ];

    if (!adj[u]) adj[u] = [];
    adj[u].push({ edgeId: props.id, target: v, weight, hasStairs, floodDepth, coords });
  }

  // Dijkstra
  const dist: Record<string, number> = {};
  const prev: Record<string, { node: string; edge: AdjEdge } | null> = {};
  const visited = new Set<string>();

  const nodes = Object.keys(NODE_COORDINATES);
  for (const n of nodes) {
    dist[n] = Infinity;
    prev[n] = null;
  }
  dist[resolvedOrigin] = 0;

  for (let step = 0; step < nodes.length; step++) {
    let u: string | null = null;
    let minD = Infinity;
    for (const n of nodes) {
      if (!visited.has(n) && dist[n] < minD) {
        minD = dist[n];
        u = n;
      }
    }
    if (!u || u === resolvedDest) break;
    visited.add(u);

    for (const edge of adj[u] || []) {
      const v = edge.target;
      const alt = dist[u] + edge.weight;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = { node: u, edge };
      }
    }
  }

  if (dist[resolvedDest] === Infinity || (!visited.has(resolvedDest) && dist[resolvedDest] === Infinity)) {
    return {
      scenario_id: 'monsoon_demo',
      evaluated_minute: minute,
      status: 'no_route_found',
      primary_route: null,
      alternatives: [],
      warnings: [
        `No safe ${mode} path available at T+${minute}m due to flood closures or stairs barrier.`,
      ],
      data_freshness: { evaluated_minute: minute, scenario_snapshot_minute: minute, is_simulated: true },
    };
  }

  // Reconstruct path
  const pathNodes: string[] = [];
  const pathEdges: string[] = [];
  const coordsList: [number, number][] = [];

  let curr = resolvedDest;
  while (curr && prev[curr]) {
    pathNodes.unshift(curr);
    pathEdges.unshift(prev[curr]!.edge.edgeId);
    curr = prev[curr]!.node;
  }
  pathNodes.unshift(resolvedOrigin);

  // Build route line coordinates
  for (let i = 0; i < pathNodes.length; i++) {
    const c = NODE_COORDINATES[pathNodes[i]];
    if (c) coordsList.push(c);
  }

  const warnings: string[] = [];
  if (minute >= 15) {
    warnings.push('Caution: Route passes near rising water perimeter.');
  }

  // Check if destination shelter is full
  const destShelter = snapshot.shelters?.find((s) => s.id === destId);
  if (destShelter && ((destShelter.occupancy || 0) >= destShelter.capacity || destShelter.status === 'full')) {
    warnings.push(`Warning: Destination ${destShelter.name} is at 100% capacity upon arrival. Gate diversion protocols active.`);
  }

  const primary: RouteCandidate = {
    route_id: 'route_primary',
    path_nodes: pathNodes,
    path_edges: pathEdges,
    distance_m: Math.round(pathNodes.length * 380),
    estimated_duration_s: Math.round(dist[resolvedDest]),
    resilience_score: Math.max(20, Math.min(95, 100 - Math.round(dist[resolvedDest] / 8))),
    score_type: 'heuristic_not_probability',
    hazard_exposure: minute >= 30 ? 'high' : 'medium',
    geometry: {
      type: 'LineString',
      coordinates: coordsList,
    },
    warnings,
  };

  return {
    scenario_id: 'monsoon_demo',
    evaluated_minute: minute,
    status: 'route_found',
    primary_route: primary,
    alternatives: [],
    warnings,
    data_freshness: { evaluated_minute: minute, scenario_snapshot_minute: minute, is_simulated: true },
  };
}

/**
 * Offline crowd allocation calculation:
 * Distributes 1,250 evacuees (North: 400, East: 350, Central: 500) into shelters.
 * Supports forceAllFull for testing overcapacity scenarios, and overflowActive for regional refuge.
 */
export function offlineAssignEvacuation(
  minute: number,
  options?: { forceAllFull?: boolean; overflowActive?: boolean }
): CrowdAssignResponse {
  const forceAllFull = Boolean(options?.forceAllFull);
  const overflowActive = Boolean(options?.overflowActive);

  // Allocations when crowd evacuates
  let allocations: Array<{
    shelter_id: string;
    shelter_name: string;
    capacity: number;
    assigned_count: number;
    final_occupancy: number;
    remaining_capacity: number;
    status: 'open' | 'full' | 'closed';
  }> = [];

  if (forceAllFull) {
    // Fill all 4 primary city shelters to 100%
    allocations = [
      {
        shelter_id: 'shelter_west_high',
        shelter_name: 'Riverdale West High School',
        capacity: 450,
        assigned_count: 450,
        final_occupancy: 450,
        remaining_capacity: 0,
        status: 'full',
      },
      {
        shelter_id: 'shelter_south_stadium',
        shelter_name: 'South Sports Complex & Arena',
        capacity: 500,
        assigned_count: 500,
        final_occupancy: 500,
        remaining_capacity: 0,
        status: 'full',
      },
      {
        shelter_id: 'shelter_east_center',
        shelter_name: 'East Community Relief Center',
        capacity: 200,
        assigned_count: 200,
        final_occupancy: 200,
        remaining_capacity: 0,
        status: 'full',
      },
      {
        shelter_id: 'shelter_hill_station',
        shelter_name: 'Hilltop Observation Center',
        capacity: 300,
        assigned_count: 300,
        final_occupancy: 300,
        remaining_capacity: 0,
        status: 'full',
      },
    ];
  } else {
    // Standard crowd evacuation of 1,250 civilians
    // East Relief Center: 200/200 (full)
    // Riverdale West High: 450/450 (full)
    // South Sports Complex: 500/500 (full)
    // Hilltop Center: 100/300 (open, 200 buffer)
    allocations = [
      {
        shelter_id: 'shelter_west_high',
        shelter_name: 'Riverdale West High School',
        capacity: 450,
        assigned_count: 450,
        final_occupancy: 450,
        remaining_capacity: 0,
        status: 'full',
      },
      {
        shelter_id: 'shelter_south_stadium',
        shelter_name: 'South Sports Complex & Arena',
        capacity: 500,
        assigned_count: 500,
        final_occupancy: 500,
        remaining_capacity: 0,
        status: 'full',
      },
      {
        shelter_id: 'shelter_east_center',
        shelter_name: 'East Community Relief Center',
        capacity: 200,
        assigned_count: 200,
        final_occupancy: 200,
        remaining_capacity: 0,
        status: 'full',
      },
      {
        shelter_id: 'shelter_hill_station',
        shelter_name: 'Hilltop Observation Center',
        capacity: 300,
        assigned_count: 100,
        final_occupancy: 100,
        remaining_capacity: 200,
        status: 'open',
      },
    ];
  }

  // If overflow is active, append the Regional Airport Mutual Aid Camp
  if (overflowActive) {
    allocations.push({
      shelter_id: OVERFLOW_SHELTER.id,
      shelter_name: OVERFLOW_SHELTER.name,
      capacity: OVERFLOW_SHELTER.capacity,
      assigned_count: 0,
      final_occupancy: 0,
      remaining_capacity: OVERFLOW_SHELTER.capacity,
      status: 'open',
    });
  }

  const totalAssigned = allocations.reduce((acc, a) => acc + a.assigned_count, 0);
  const totalEvacuees = forceAllFull ? 1450 : 1250;
  const totalUnassigned = Math.max(0, totalEvacuees - totalAssigned);

  return {
    scenario_id: 'monsoon_demo',
    minute,
    total_evacuees: totalEvacuees,
    total_assigned: totalAssigned,
    total_unassigned: totalUnassigned,
    shelter_allocations: allocations,
    overloaded_edges: minute >= 30 ? ['E13_BRIDGE_NORTH_EW'] : [],
    edge_flows: {},
    unassigned_reasons: totalUnassigned > 0 ? { overflow: 'All city shelters reached maximum capacity' } : {},
  };
}
