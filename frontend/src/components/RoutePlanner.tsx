import React, { useState } from 'react';
import { Footprints, Accessibility, Car, Navigation, AlertCircle, Loader2 } from 'lucide-react';
import type { OriginZone, Shelter, RouteResponse, RouteCandidate, MobilityProfile } from '../types';
import { RouteCard } from './RouteCard';

interface RoutePlannerProps {
  origins: OriginZone[];
  shelters: Shelter[];
  currentMinute: number;
  onPlanRoute: (originId: string, destId: string, mode: MobilityProfile) => Promise<void>;
  routeResult: RouteResponse | null;
  selectedRouteId: string | null;
  onSelectRoute: (candidate: RouteCandidate) => void;
  loading: boolean;
}

export const RoutePlanner: React.FC<RoutePlannerProps> = ({
  origins,
  shelters: _shelters,
  currentMinute,
  onPlanRoute,
  routeResult,
  selectedRouteId,
  onSelectRoute,
  loading,
}) => {
  const [selectedOrigin, setSelectedOrigin] = useState<string>(origins[0]?.node_id || 'N05');
  const [selectedDest, setSelectedDest] = useState<string>('N09');
  const [mode, setMode] = useState<MobilityProfile>('walk');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPlanRoute(selectedOrigin, selectedDest, mode);
  };

  return (
    <div className="bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-4 text-white shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Safe Route Planner</h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">T+{currentMinute}m Conditions</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Origin Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Evacuation Origin
          </label>
          <select
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
          >
            {origins.map((o) => (
              <option key={o.id} value={o.node_id}>
                {o.name} (Pop: {o.population}) [{o.node_id}]
              </option>
            ))}
          </select>
        </div>

        {/* Destination Shelter Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Destination Shelter
          </label>
          <select
            value={selectedDest}
            onChange={(e) => setSelectedDest(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="N09">Riverdale West High School [N09] (Cap: 450)</option>
            <option value="N11">South Sports Arena [N11] (Cap: 500)</option>
            <option value="N12">Hilltop Emergency Plateau [N12] (Steps/Inaccessible)</option>
            <option value="N02">East Community Relief Center [N02] (Cap: 200)</option>
          </select>
        </div>

        {/* Mobility Profile Toggle */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Mobility Profile
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMode('walk')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'walk'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              <span>Pedestrian</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('wheelchair')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'wheelchair'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Accessibility className="w-3.5 h-3.5" />
              <span>Wheelchair</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('vehicle')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                mode === 'vehicle'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Vehicle</span>
            </button>
          </div>
          {mode === 'wheelchair' && (
            <p className="text-[10px] text-blue-400 mt-1">
              Active constraint: Excludes stone stairs and unverified steps.
            </p>
          )}
        </div>

        {/* Calculate Action */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Calculating Safe Route...</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4" />
              <span>Find Safe Evacuation Route</span>
            </>
          )}
        </button>
      </form>

      {/* Results Section */}
      {routeResult && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-300">
            {routeResult.status === 'route_found' ? 'Calculated Routes:' : 'Route Status:'}
          </div>

          {routeResult.status === 'no_route_found' ? (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/80 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div>
                <div className="font-bold">No Verified Safe Route Available</div>
                <div className="text-[11px] text-red-300/80 mt-0.5">
                  {routeResult.warnings?.[0] || 'All paths to destination are blocked by flood water or closures.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};
