import React, { useState, useEffect } from 'react';
import {
  Footprints,
  Accessibility,
  Car,
  Navigation,
  AlertCircle,
  Loader2,
  Route,
} from 'lucide-react';
import type {
  OriginZone,
  Shelter,
  RouteResponse,
  RouteCandidate,
  MobilityProfile,
} from '../types';
import { RouteCard } from './RouteCard';

export interface RoutePlannerProps {
  origins: OriginZone[];
  shelters: Shelter[];
  currentMinute: number;
  onPlanRoute: (originId: string, destId: string, mode: MobilityProfile) => Promise<void>;
  routeResult: RouteResponse | null;
  selectedRouteId: string | null;
  onSelectRoute: (candidate: RouteCandidate) => void;
  loading: boolean;
  onClearRoute?: () => void;
}


const FALLBACK_ORIGINS: Partial<OriginZone>[] = [
  { id: 'origin_central', name: 'Downtown Central Sector', node_id: 'N05', population: 500 },
  { id: 'origin_north', name: 'North Residential Colony', node_id: 'N01', population: 400 },
  { id: 'origin_east', name: 'East Commercial District', node_id: 'N03', population: 350 },
];

const FALLBACK_SHELTERS: Partial<Shelter>[] = [
  { id: 'shelter_west_high', name: 'Riverdale West High School', accessible: true, capacity: 450 },
  { id: 'shelter_south_stadium', name: 'South Sports Complex & Arena', accessible: true, capacity: 500 },
  { id: 'shelter_hill_station', name: 'Hilltop Observation Center', accessible: false, capacity: 300 },
  { id: 'shelter_east_center', name: 'East Community Relief Center', accessible: true, capacity: 200 },
];

export const RoutePlanner: React.FC<RoutePlannerProps> = ({
  origins,
  shelters,
  currentMinute,
  onPlanRoute,
  routeResult,
  selectedRouteId,
  onSelectRoute,
  loading,
  onClearRoute,
}) => {

  const effectiveOrigins = origins.length > 0 ? origins : (FALLBACK_ORIGINS as OriginZone[]);
  const effectiveShelters = shelters.length > 0 ? shelters : (FALLBACK_SHELTERS as Shelter[]);

  const [selectedOrigin, setSelectedOrigin] = useState<string>(() => {
    return effectiveOrigins[0]?.node_id || effectiveOrigins[0]?.id || 'N05';
  });

  const [selectedDest, setSelectedDest] = useState<string>(() => {
    return effectiveShelters[0]?.id || 'shelter_west_high';
  });

  const [mode, setMode] = useState<MobilityProfile>('walk');

  // Keep selection in sync when props load or update
  useEffect(() => {
    if (origins.length > 0) {
      const match = origins.some((o) => (o.node_id || o.id) === selectedOrigin);
      if (!match) {
        setSelectedOrigin(origins[0].node_id || origins[0].id);
      }
    }
  }, [origins, selectedOrigin]);

  useEffect(() => {
    if (shelters.length > 0) {
      const match = shelters.some((s) => s.id === selectedDest);
      if (!match) {
        setSelectedDest(shelters[0].id);
      }
    }
  }, [shelters, selectedDest]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrigin || !selectedDest || loading) return;
    onPlanRoute(selectedOrigin, selectedDest, mode);
  };

  const selectedShelterObj = effectiveShelters.find((s) => s.id === selectedDest);

  return (
    <div className="space-y-4 rounded-lg border border-[#244044] bg-[#0b2226] p-4 text-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Plan a route
          </h2>
        </div>
        <span className="rounded border border-[#315256] bg-[#102d31] px-2 py-1 text-[10px] font-medium text-slate-300">
          T+{currentMinute} min
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Origin Selector (dropdown from origins with node IDs) */}
        <div>
          <label
            htmlFor="origin-select"
            className="mb-1 block text-[11px] font-medium text-slate-400"
          >
            Origin zone
          </label>
          <select
            id="origin-select"
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="w-full cursor-pointer rounded-md border border-[#315256] bg-[#102d31] px-3 py-2.5 text-xs font-medium text-slate-200 transition hover:border-[#527578] focus:border-teal-400 focus:outline-none"
          >
            {effectiveOrigins.map((o) => {
              const value = o.node_id || o.id;
              return (
                <option key={o.id} value={value}>
                  {o.name} · {o.population} people
                </option>
              );
            })}
          </select>
        </div>

        {/* Destination Selector (dropdown from shelters with accessibility tags) */}
        <div>
          <label
            htmlFor="destination-select"
            className="mb-1 block text-[11px] font-medium text-slate-400"
          >
            Destination shelter
          </label>
          <select
            id="destination-select"
            value={selectedDest}
            onChange={(e) => setSelectedDest(e.target.value)}
            className="w-full cursor-pointer rounded-md border border-[#315256] bg-[#102d31] px-3 py-2.5 text-xs font-medium text-slate-200 transition hover:border-[#527578] focus:border-teal-400 focus:outline-none"
          >
            {effectiveShelters.map((s) => {
              const accessTag = s.accessible ? 'Step-free' : 'Steps';
              return (
                <option key={s.id} value={s.id}>
                  {s.name} · {accessTag} · {s.capacity} capacity
                </option>
              );
            })}
          </select>

          {/* Accessibility Notice */}
          {selectedShelterObj && !selectedShelterObj.accessible && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>This shelter is not wheelchair accessible.</span>
            </p>
          )}
        </div>

        {/* Mobility Profile Toggle */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-slate-400">
            Mobility Profile
          </label>
          <div className="grid grid-cols-3 gap-2">
            {/* Walk */}
            <button
              type="button"
              onClick={() => setMode('walk')}
              aria-pressed={mode === 'walk'}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'walk'
                  ? 'bg-teal-700 text-white border-teal-600'
                  : 'bg-[#102d31] text-slate-400 border-[#315256] hover:text-slate-200 hover:bg-[#173a3e]'
              }`}
            >
              <Footprints className="w-3.5 h-3.5 shrink-0" />
              <span>Walk</span>
            </button>

            {/* Wheelchair */}
            <button
              type="button"
              onClick={() => setMode('wheelchair')}
              aria-pressed={mode === 'wheelchair'}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'wheelchair'
                  ? 'bg-teal-700 text-white border-teal-600'
                  : 'bg-[#102d31] text-slate-400 border-[#315256] hover:text-slate-200 hover:bg-[#173a3e]'
              }`}
            >
              <Accessibility className="w-3.5 h-3.5 shrink-0" />
              <span>Wheelchair</span>
            </button>

            {/* Vehicle */}
            <button
              type="button"
              onClick={() => setMode('vehicle')}
              aria-pressed={mode === 'vehicle'}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'vehicle'
                  ? 'bg-teal-700 text-white border-teal-600'
                  : 'bg-[#102d31] text-slate-400 border-[#315256] hover:text-slate-200 hover:bg-[#173a3e]'
              }`}
            >
              <Car className="w-3.5 h-3.5 shrink-0" />
              <span>Vehicle</span>
            </button>
          </div>

          {/* Mode-specific hints */}
          {mode === 'wheelchair' && (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-teal-200">
              <Accessibility className="w-3 h-3 shrink-0" />
              <span>Routes avoid stairs, steep inclines and deep floodwater.</span>
            </p>
          )}
          {mode === 'vehicle' && (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
              <Car className="w-3 h-3 shrink-0" />
              <span>Routes use passable roads and account for congestion.</span>
            </p>
          )}
        </div>

        {/* Calculate Safe Route Button with Spinner */}
        <button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer rounded-md border border-teal-600 bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Finding a route…</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4 shrink-0" />
              <span>Find safe route</span>
            </>
          )}
        </button>
      </form>

      {/* Route Results Section */}
      {routeResult && (
        <div className="space-y-2.5 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-teal-400" />
              <span>
                {routeResult.status === 'route_found'
                  ? 'Route options'
                  : 'Route status'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {routeResult.status === 'route_found' && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {1 + (routeResult.alternatives?.length || 0)} candidate{routeResult.alternatives?.length ? 's' : ''}
                </span>
              )}
              {onClearRoute && (
                <button
                  type="button"
                  onClick={onClearRoute}
                  className="cursor-pointer rounded border border-[#315256] bg-[#102d31] px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-[#173a3e] hover:text-white"
                  title="Clear active route from map"
                >
                  Clear
                </button>
              )}
            </div>
          </div>


          {/* Emergency Warning when no route is found */}
          {routeResult.status === 'no_route_found' ? (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-700/80 text-red-200 text-xs space-y-1.5 shadow-lg shadow-red-950/40">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-red-300">
                    No verified safe route available. All river crossings flooded or blocked.
                  </div>
                  <p className="text-[11px] text-red-300/80 leading-relaxed">
                    {routeResult.warnings && routeResult.warnings.length > 0
                      ? routeResult.warnings.join(' • ')
                      : 'Severe flooding and road closures prevent safe evacuation along this path.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Render RouteCard for primary route and alternatives */
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {routeResult.primary_route && (
                <RouteCard
                  candidate={routeResult.primary_route}
                  isPrimary={true}
                  isSelected={selectedRouteId === routeResult.primary_route.route_id}
                  onSelect={() => onSelectRoute(routeResult.primary_route!)}
                />
              )}

              {routeResult.alternatives?.map((alt) => (
                <RouteCard
                  key={alt.route_id}
                  candidate={alt}
                  isPrimary={false}
                  isSelected={selectedRouteId === alt.route_id}
                  onSelect={() => onSelectRoute(alt)}
                />
              ))}

              {!routeResult.primary_route && (!routeResult.alternatives || routeResult.alternatives.length === 0) && (
                <div className="p-3 rounded-lg bg-slate-800/60 text-center text-xs text-slate-400">
                  No route paths returned for current constraints.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
