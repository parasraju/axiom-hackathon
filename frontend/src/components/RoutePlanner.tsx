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
    <div className="bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-4 text-white shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Safe Route Planner
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          T+{currentMinute}m Conditions
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Origin Selector (dropdown from origins with node IDs) */}
        <div>
          <label
            htmlFor="origin-select"
            className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1"
          >
            Evacuation Origin (Muster Zone)
          </label>
          <select
            id="origin-select"
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
          >
            {effectiveOrigins.map((o) => {
              const value = o.node_id || o.id;
              return (
                <option key={o.id} value={value}>
                  {o.name} [Node: {o.node_id || o.id}] (Pop: {o.population})
                </option>
              );
            })}
          </select>
        </div>

        {/* Destination Selector (dropdown from shelters with accessibility tags) */}
        <div>
          <label
            htmlFor="destination-select"
            className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1"
          >
            Destination Shelter
          </label>
          <select
            id="destination-select"
            value={selectedDest}
            onChange={(e) => setSelectedDest(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
          >
            {effectiveShelters.map((s) => {
              const accessTag = s.accessible ? 'Accessible' : 'Inaccessible (Stairs)';
              return (
                <option key={s.id} value={s.id}>
                  {s.name} [{accessTag}] • Cap: {s.capacity}
                </option>
              );
            })}
          </select>

          {/* Accessibility Notice */}
          {selectedShelterObj && !selectedShelterObj.accessible && (
            <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Warning: Selected shelter has stairs/elevations and is not wheelchair accessible.</span>
            </p>
          )}
        </div>

        {/* Mobility Profile Toggle */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Mobility Profile
          </label>
          <div className="grid grid-cols-3 gap-2">
            {/* Walk */}
            <button
              type="button"
              onClick={() => setMode('walk')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'walk'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-750'
              }`}
            >
              <Footprints className="w-3.5 h-3.5 shrink-0" />
              <span>Walk</span>
            </button>

            {/* Wheelchair */}
            <button
              type="button"
              onClick={() => setMode('wheelchair')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'wheelchair'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-750'
              }`}
            >
              <Accessibility className="w-3.5 h-3.5 shrink-0" />
              <span>Wheelchair</span>
            </button>

            {/* Vehicle */}
            <button
              type="button"
              onClick={() => setMode('vehicle')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'vehicle'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-750'
              }`}
            >
              <Car className="w-3.5 h-3.5 shrink-0" />
              <span>Vehicle</span>
            </button>
          </div>

          {/* Mode-specific hints */}
          {mode === 'wheelchair' && (
            <p className="text-[10px] text-blue-300 mt-1.5 flex items-center gap-1">
              <Accessibility className="w-3 h-3 shrink-0" />
              <span>Wheelchair routing excludes flights of stairs, steep inclines, and deep flood puddles (&gt;10cm).</span>
            </p>
          )}
          {mode === 'vehicle' && (
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Car className="w-3 h-3 shrink-0" />
              <span>Vehicle routing restricted to passable roadways; accounts for traffic congestion factors.</span>
            </p>
          )}
        </div>

        {/* Calculate Safe Route Button with Spinner */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Calculating Safe Route...</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4 shrink-0" />
              <span>Calculate Safe Route</span>
            </>
          )}
        </button>
      </form>

      {/* Route Results Section */}
      {routeResult && (
        <div className="space-y-2.5 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-blue-400" />
              <span>
                {routeResult.status === 'route_found'
                  ? 'Calculated Route Options:'
                  : 'Route Calculation Status:'}
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
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition border border-slate-700 cursor-pointer"
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
