/**
 * SafeRoute Emergency Evacuation Navigation Platform
 * TypeScript Type Definitions matching Backend Data Models & API Schemas
 */

export type MobilityProfile = 'walk' | 'wheelchair' | 'vehicle';

export type EdgeStatus = 'normal' | 'caution' | 'closed';

export type ShelterStatus = 'open' | 'full' | 'closed';

export type IncidentStatus = 'pending' | 'verified' | 'rejected';

export type HazardExposure = 'low' | 'moderate' | 'high' | string;

export interface RoadNode {
  id: string;
  lon: number;
  lat: number;
  name: string;
  kind: string;
}

export interface RoadEdge {
  id: string;
  from_node: string;
  to_node: string;
  length_m: number;
  status: 'normal' | 'caution' | 'closed';
  color: string;
  flood_depth_m: number;
  congestion_ratio: number;
  travel_time_s: number;
  has_stairs: boolean;
  is_open: boolean;
  baseline_speed_kmh?: number;
  capacity?: number;
  modes?: MobilityProfile[] | string[];
  flood_threshold_m?: number;
  geometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface Shelter {
  id: string;
  name: string;
  lon: number;
  lat: number;
  capacity: number;
  occupancy: number;
  accessible: boolean;
  services: string[];
  status: 'open' | 'full' | 'closed';
}

export interface OriginZone {
  id: string;
  name: string;
  lon: number;
  lat: number;
  node_id: string;
  population: number;
}

export interface LineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteCandidate {
  route_id: string;
  path_nodes: string[];
  path_edges: string[];
  distance_m: number;
  estimated_duration_s: number;
  resilience_score: number;
  score_type: string;
  hazard_exposure: string;
  warnings: string[];
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface DataFreshness {
  scenario_snapshot_minute?: number;
  is_simulated?: boolean;
  timestamp?: string;
  [key: string]: any;
}

export interface RouteResponse {
  scenario_id: string;
  evaluated_minute: number;
  status: 'route_found' | 'no_route_found';
  primary_route: RouteCandidate | null;
  alternatives: RouteCandidate[];
  warnings: string[];
  data_freshness: any;
}

export interface RouteRequest {
  scenario_id?: string;
  origin_id?: string;
  origin_coords?: [number, number];
  destination_id?: string;
  destination_coords?: [number, number];
  departure_minute: number;
  mode: MobilityProfile;
  alternatives?: number;
}

export interface ShelterAllocation {
  shelter_id: string;
  shelter_name: string;
  assigned_count: number;
  final_occupancy: number;
  capacity: number;
  remaining_capacity: number;
  status: string;
}

export interface CrowdAssignResponse {
  scenario_id: string;
  minute: number;
  total_evacuees: number;
  total_assigned: number;
  total_unassigned: number;
  shelter_allocations: ShelterAllocation[];
  overloaded_edges: string[];
  edge_flows: Record<string, number>;
  unassigned_reasons: Record<string, string>;
}

export interface CrowdAssignRequest {
  scenario_id?: string;
  minute: number;
  origin_ids?: string[];
  origins?: string[];
  mode?: MobilityProfile;
}

export interface IncidentReport {
  id: string;
  edge_id: string;
  kind: string;
  description: string;
  reported_minute: number;
  status: 'pending' | 'verified' | 'rejected';
  verification_score: number;
  evidence_count: number;
  reporter_hash?: string;
}

export interface ReportSubmitRequest {
  edge_id: string;
  kind?: string;
  reported_minute?: number;
  description?: string;
  reporter_hash?: string;
}

export interface ReviewReportRequest {
  decision: 'verify' | 'reject' | string;
  notes?: string;
}

export interface ClosureToggleRequest {
  edge_id: string;
  is_open: boolean;
  reason?: string;
}

export interface ScenarioMetrics {
  total_network_edges?: number;
  closed_edges_count?: number;
  caution_edges_count?: number;
  normal_edges_count?: number;
  flooded_edges_count?: number;
  max_flood_depth_m?: number;
  mean_congestion_ratio?: number;
  bottlenecks_count?: number;
  total_population?: number;
  total_shelter_capacity?: number;
  total_shelter_occupancy?: number;
  open_shelters_count?: number;
  full_shelters_count?: number;
  closed_shelters_count?: number;
  active_incidents_count?: number;
  [key: string]: any;
}

export interface AuditEvent {
  id: string;
  timestamp_minute?: number;
  minute?: number;
  action: string;
  details: Record<string, any>;
}

export interface ScenarioSnapshot {
  scenario_id: string;
  minute: number;
  edges_geojson: any;
  flood_geojson: any;
  shelters: Shelter[];
  origins: OriginZone[];
  metrics: any;
  edge_states?: Record<string, any>;
  active_incidents?: IncidentReport[];
}

export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  step_minutes: number;
  keyframe_minutes: number[];
  current_minute?: number;
  origins_count?: number;
  shelters_count?: number;
  road_edges_count?: number;
  is_simulated: boolean;
}

export interface ApiErrorResponse {
  detail: string | { msg: string; type: string }[];
}
