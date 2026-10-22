import fallbackData from './fallbackTimeline.json';
import type { ScenarioSnapshot, RouteResponse, RouteCandidate, MobilityProfile, CrowdAssignResponse } from '../types';

export const FALLBACK_TIMELINE: ScenarioSnapshot[] = fallbackData as unknown as ScenarioSnapshot[];

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
};

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

  let curr: string | null = resolvedDest;
  while (curr && curr !== resolvedOrigin) {
    pathNodes.unshift(curr);
    const p: { node: string; edge: AdjEdge } | null = prev[curr];
    if (!p) break;
    pathEdges.unshift(p.edge.edgeId);
    curr = p.node;
  }
  pathNodes.unshift(resolvedOrigin);

  // Build route line coordinates
  for (let i = 0; i < pathNodes.length; i++) {
    const c = NODE_COORDINATES[pathNodes[i]];
    if (c) coordsList.push(c);
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
    warnings: minute >= 15 ? ['Caution: Route passes near rising water perimeter.'] : [],
  };

  return {
    scenario_id: 'monsoon_demo',
    evaluated_minute: minute,
    status: 'route_found',
    primary_route: primary,
    alternatives: [],
    warnings: minute >= 15 ? ['Caution: Route passes near rising water perimeter.'] : [],
    data_freshness: { evaluated_minute: minute, scenario_snapshot_minute: minute, is_simulated: true },
  };
}


/**
 * Offline crowd allocation calculation
 */
export function offlineAssignEvacuation(minute: number): CrowdAssignResponse {
  const snapshot = FALLBACK_TIMELINE.find((s) => s.minute === minute) || FALLBACK_TIMELINE[0];
  return {
    scenario_id: 'monsoon_demo',
    minute,
    total_evacuees: snapshot.metrics?.total_evacuees || 1250,
    total_assigned: snapshot.metrics?.assigned_count || 1250,
    total_unassigned: snapshot.metrics?.unassigned_count || 0,
    shelter_allocations: (snapshot.shelters || []).map((s) => ({
      shelter_id: s.id,
      shelter_name: s.name,
      assigned_count: s.occupancy || 0,
      remaining_capacity: Math.max(0, s.capacity - (s.occupancy || 0)),
      status: s.status,
      final_occupancy: s.occupancy || 0,
      capacity: s.capacity,
    })),
    overloaded_edges: snapshot.metrics?.bottleneck_edges || [],
    edge_flows: {},
    unassigned_reasons: snapshot.metrics?.unassigned_reasons || {},
  };
}
