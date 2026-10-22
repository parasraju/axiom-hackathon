import React, { useState, useEffect } from 'react';
import {
  Footprints,
  Accessibility,
  Car,
  Navigation,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Tent,
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
  onActivateOverflow?: () => void;
  isOverflowActive?: boolean;
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
  onActivateOverflow,
  isOverflowActive = false,
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
  const selectedShelterIsFull = Boolean(
    selectedShelterObj &&
      ((selectedShelterObj.occupancy || 0) >= selectedShelterObj.capacity ||
        selectedShelterObj.status?.toLowerCase() === 'full')
  );

  const allSheltersFull =
    effectiveShelters.length > 0 &&
    effectiveShelters.every(
      (s) => (s.occupancy || 0) >= s.capacity || s.status?.toLowerCase() === 'full'
    );

  const firstOpenShelter = effectiveShelters.find(
    (s) =>
      (s.occupancy || 0) < s.capacity &&
      s.status?.toLowerCase() !== 'full' &&
      s.status?.toLowerCase() !== 'closed'
  );

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

      {/* ALL SHELTERS FULL ALERT CALLOUT */}
      {allSheltersFull && (
        <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/60 text-xs text-red-200 space-y-2.5 shadow-lg shadow-red-950/40 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-bold text-red-300 uppercase tracking-wide text-xs">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
            <span>All Evacuation Shelters at 100% Capacity!</span>
          </div>
          <p className="text-[11px] text-red-200/90 leading-relaxed">
            No verified open destination available in city shelters. Overbooking is restricted to prevent fatal bottlenecking and gate stampedes.
          </p>
          {!isOverflowActive && onActivateOverflow ? (
            <button
              type="button"
              onClick={onActivateOverflow}
              className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Tent className="w-3.5 h-3.5" />
              <span>Deploy Regional Mutual Aid Overflow Camp (+500 Spots)</span>
            </button>
          ) : (
            <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-semibold flex items-center gap-2">
              <span>✅ Regional Mutual Aid Camp deployed. Select below to route.</span>
            </div>
          )}
        </div>
      )}

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

        {/* Destination Selector (dropdown from shelters with accessibility and fullness tags) */}
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
            className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none font-medium cursor-pointer ${
              selectedShelterIsFull
                ? 'border-red-500/60 focus:border-red-500'
                : 'border-slate-700 focus:border-blue-500'
            }`}
          >
            {effectiveShelters.map((s) => {
              const accessTag = s.accessible ? 'Accessible' : 'Stairs Only';
              const occ = s.occupancy || 0;
              const cap = s.capacity;
              const isFull = occ >= cap || s.status?.toLowerCase() === 'full';
              const statusTag = isFull
                ? `[⛔ FULL: ${occ}/${cap}]`
                : `[✅ OPEN: ${Math.max(0, cap - occ)} left]`;

              return (
                <option key={s.id} value={s.id}>
                  {s.name} {statusTag} • {accessTag}
                </option>
              );
            })}
          </select>

          {/* Selected Shelter is Full Warning Notice */}
          {selectedShelterIsFull && (
            <div className="mt-2 p-2.5 rounded-lg bg-amber-950/70 border border-amber-500/60 text-xs text-amber-200 space-y-1.5 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>Notice: Selected Shelter is 100% Full ({selectedShelterObj?.occupancy}/{selectedShelterObj?.capacity})</span>
              </div>
              <p className="text-[10.5px] text-amber-200/80 leading-relaxed">
                SafeRoute calculates safe routes to full facilities for first responders, but arriving civilians will be diverted at the gates.
              </p>
              {firstOpenShelter && (
                <button
                  type="button"
                  onClick={() => setSelectedDest(firstOpenShelter.id)}
                  className="text-[11px] font-bold text-cyan-300 hover:text-cyan-200 underline flex items-center gap-1 cursor-pointer"
                >
                  <span>&rarr; Switch to nearest open refuge: {firstOpenShelter.name}</span>
                </button>
              )}
            </div>
          )}

          {/* Accessibility Notice */}
          {selectedShelterObj && !selectedShelterObj.accessible && (
            <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Warning: Selected shelter has stairs and is not wheelchair accessible.</span>
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
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
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
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
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
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
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
              <span>Wheelchair routing excludes flights of stairs, steep inclines, and flood puddles (&gt;10cm).</span>
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
          className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-[0.99]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Evaluating Flood &amp; Network Constraints...</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4" />
              <span>Calculate Safe Route</span>
            </>
          )}
        </button>
      </form>

      {/* Route Results Display */}
      {routeResult && (
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Evaluated Trajectories
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  routeResult.status === 'route_found'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                    : 'bg-red-950 text-red-300 border border-red-800/60'
                }`}
              >
                {routeResult.status === 'route_found' ? 'Passable Route Found' : 'No Route Available'}
              </span>
              {onClearRoute && (
                <button
                  type="button"
                  onClick={onClearRoute}
                  className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Warnings List */}
          {routeResult.warnings && routeResult.warnings.length > 0 && (
            <div className="space-y-1">
              {routeResult.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-amber-950/60 border border-amber-600/50 text-amber-300 text-[11px] flex items-start gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Primary Route Card */}
          {routeResult.primary_route && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                Primary Recommended Path
              </span>
              <RouteCard
                candidate={routeResult.primary_route}
                isSelected={selectedRouteId === routeResult.primary_route.route_id}
                onSelect={() => onSelectRoute(routeResult.primary_route!)}
                isPrimary={true}
              />
            </div>
          )}

          {/* Alternatives List */}
          {routeResult.alternatives && routeResult.alternatives.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Alternative Safe Trajectories
              </span>
              {routeResult.alternatives.map((alt) => (
                <RouteCard
                  key={alt.route_id}
                  candidate={alt}
                  isSelected={selectedRouteId === alt.route_id}
                  onSelect={() => onSelectRoute(alt)}
                  isPrimary={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;
