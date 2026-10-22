/**
 * SafeRoute API Client
 * Clean fetch API wrapper communicating with the SafeRoute FastAPI backend.
 */

import type {
  ScenarioSnapshot,
  RouteResponse,
  RouteRequest,
  CrowdAssignResponse,
  IncidentReport,
  MobilityProfile,
  Shelter,
} from '../types';

export const API_BASE_URL: string =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:8000/api';

export const DEFAULT_SCENARIO_ID = 'monsoon_demo';

export class ApiError extends Error {
  public status: number;
  public details: any;

  constructor(message: string, status: number = 0, details: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Handle HTTP response and parse JSON or text error messages gracefully.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail: any = null;
    let message = `API request failed with status ${res.status}`;
    try {
      const data = await res.json();
      errorDetail = data;
      if (data && typeof data === 'object') {
        if (typeof data.detail === 'string') {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          message = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
        } else if (data.message) {
          message = data.message;
        }
      }
    } catch {
      try {
        const text = await res.text();
        if (text) message = text;
      } catch {
        // Fall back to default status message
      }
    }
    throw new ApiError(message, res.status, errorDetail);
  }

  try {
    return (await res.json()) as T;
  } catch (err: any) {
    throw new ApiError(
      `Failed to parse JSON response: ${err?.message || 'unknown error'}`,
      res.status
    );
  }
}

/**
 * Perform a fetch request with automatic network error catching.
 */
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    return await handleResponse<T>(res);
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network-level errors (connection refused, offline, DNS lookup failure)
    const errorMsg =
      err?.name === 'TypeError' && err?.message?.includes('fetch')
        ? `Network error: Unable to connect to SafeRoute API at ${url}. Is the backend running?`
        : `Request error (${url}): ${err?.message || 'Network failure'}`;
    console.error(`[SafeRoute API Client] ${errorMsg}`, err);
    throw new ApiError(errorMsg, 0, err);
  }
}

/**
 * Fetch precomputed timeline snapshots for instant time-slider scrubbing.
 */
export async function getTimeline(
  scenarioId: string = DEFAULT_SCENARIO_ID
): Promise<ScenarioSnapshot[]> {
  return apiFetch<ScenarioSnapshot[]>(`/scenarios/${scenarioId}/timeline`);
}

/**
 * Fetch the scenario state snapshot for a specific simulation minute.
 */
export async function getSnapshot(
  minute: number = 0,
  scenarioId: string = DEFAULT_SCENARIO_ID
): Promise<ScenarioSnapshot> {
  return apiFetch<ScenarioSnapshot>(`/scenarios/${scenarioId}/snapshot?minute=${minute}`);
}

/**
 * Advance the active simulation scenario to a specific minute.
 */
export async function advanceScenario(
  minute: number,
  scenarioId: string = DEFAULT_SCENARIO_ID
): Promise<ScenarioSnapshot> {
  return apiFetch<ScenarioSnapshot>(`/scenarios/${scenarioId}/advance`, {
    method: 'POST',
    body: JSON.stringify({ minute }),
  });
}

/**
 * Reset the simulation scenario back to minute 0 and clear dynamic state.
 */
export async function resetScenario(
  scenarioId: string = DEFAULT_SCENARIO_ID
): Promise<ScenarioSnapshot> {
  return apiFetch<ScenarioSnapshot>(`/scenarios/${scenarioId}/reset`, {
    method: 'POST',
  });
}

/**
 * Toggle a road edge closure (open or closed) with commander reason override.
 */
export async function toggleRoadClosure(
  edge_id: string,
  is_open: boolean,
  reason: string = 'operator override',
  scenarioId: string = DEFAULT_SCENARIO_ID
): Promise<ScenarioSnapshot> {
  return apiFetch<ScenarioSnapshot>(`/scenarios/${scenarioId}/closures`, {
    method: 'POST',
    body: JSON.stringify({ edge_id, is_open, reason }),
  });
}

/**
 * Calculate dynamic hazard-aware evacuation routes with mobility constraints and alternatives.
 */
export async function planRoute(payload: {
  origin_id?: string;
  destination_id?: string;
  departure_minute: number;
  mode: MobilityProfile;
  alternatives?: number;
  scenario_id?: string;
}): Promise<RouteResponse> {
  const requestPayload: RouteRequest = {
    scenario_id: payload.scenario_id || DEFAULT_SCENARIO_ID,
    origin_id: payload.origin_id,
    destination_id: payload.destination_id,
    departure_minute: payload.departure_minute,
    mode: payload.mode,
    alternatives: payload.alternatives ?? 2,
  };

  return apiFetch<RouteResponse>('/routes/plan', {
    method: 'POST',
    body: JSON.stringify(requestPayload),
  });
}

/**
 * Optimally assign evacuee populations from muster origins across accessible shelters.
 */
export async function assignEvacuation(
  minute: number,
  mode: MobilityProfile = 'walk',
  scenarioId: string = DEFAULT_SCENARIO_ID
): Promise<CrowdAssignResponse> {
  return apiFetch<CrowdAssignResponse>('/evacuation/assign', {
    method: 'POST',
    body: JSON.stringify({
      scenario_id: scenarioId,
      minute,
      mode,
    }),
  });
}

/**
 * Submit a citizen or sensor hazard report to the incident verification queue.
 */
export async function submitIncidentReport(payload: {
  edge_id: string;
  kind: string;
  reported_minute: number;
  description: string;
  reporter_hash?: string;
}): Promise<IncidentReport> {
  return apiFetch<IncidentReport>('/reports', {
    method: 'POST',
    body: JSON.stringify({
      edge_id: payload.edge_id,
      kind: payload.kind,
      reported_minute: payload.reported_minute,
      description: payload.description,
      reporter_hash: payload.reporter_hash || 'citizen_web_app',
    }),
  });
}

/**
 * Review an incident report (commander verify or reject action).
 */
export async function reviewReport(
  reportId: string,
  decision: 'verify' | 'reject' | string,
  notes: string = ''
): Promise<IncidentReport> {
  return apiFetch<IncidentReport>(`/reports/${reportId}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, notes }),
  });
}

/**
 * Fetch all available emergency shelters.
 */
export async function listShelters(): Promise<Shelter[]> {
  return apiFetch<Shelter[]>('/shelters');
}

/**
 * Update emergency shelter capacity or status.
 */
export async function updateShelter(
  shelterId: string,
  payload: { capacity?: number; status?: string }
): Promise<Shelter> {
  return apiFetch<Shelter>(`/shelters/${shelterId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Check backend health status.
 */
export async function getHealth(): Promise<{ status: string; service: string; version: string }> {
  return apiFetch<{ status: string; service: string; version: string }>('/health');
}

/**
 * Unified API client object supporting both object and direct function imports.
 */
export const api = {
  getTimeline,
  getSnapshot,
  advanceScenario,
  resetScenario,
  toggleRoadClosure,
  planRoute,
  assignEvacuation,
  submitIncidentReport,
  reviewReport,
  listShelters,
  updateShelter,
  getHealth,
};

export default api;
