import React from 'react';
import {
  Building2,
  Users,
  Accessibility,
  Footprints,
  HeartPulse,
  Droplets,
  Zap,
  Utensils,
  Bed,
  Radio,
  Shield,
  Layers,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Shelter } from '../types';

export interface ShelterPanelProps {
  shelters: Shelter[];
  onRunBatchEvacuation: () => Promise<void>;
  batchLoading: boolean;
  onShelterClick?: (shelterId: string) => void;
}

export const ShelterPanel: React.FC<ShelterPanelProps> = ({
  shelters,
  onRunBatchEvacuation,
  batchLoading,
  onShelterClick,
}) => {
  // Compute aggregate statistics
  const totalCapacity = shelters.reduce((acc, s) => acc + (s.capacity || 0), 0);
  const totalOccupancy = shelters.reduce((acc, s) => acc + (s.occupancy || 0), 0);
  const remainingCapacity = Math.max(0, totalCapacity - totalOccupancy);
  const overallPercentage =
    totalCapacity > 0 ? Math.min(100, Math.round((totalOccupancy / totalCapacity) * 100)) : 0;

  const openCount = shelters.filter((s) => s.status?.toLowerCase() === 'open').length;
  const fullCount = shelters.filter((s) => s.status?.toLowerCase() === 'full').length;
  const closedCount = shelters.filter((s) => s.status?.toLowerCase() === 'closed').length;

  const renderServicePill = (serviceKey: string) => {
    const key = serviceKey.toLowerCase();
    let label = serviceKey.replace(/_/g, ' ');
    let Icon = Shield;
    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';

    if (key.includes('first_aid') || key.includes('medical')) {
      label = 'First Aid';
      Icon = HeartPulse;
      colorClass = 'bg-rose-950/40 text-rose-300 border-rose-800/40';
    } else if (key.includes('water')) {
      label = 'Water';
      Icon = Droplets;
      colorClass = 'bg-sky-950/40 text-sky-300 border-sky-800/40';
    } else if (key.includes('generator') || key.includes('power')) {
      label = 'Generator';
      Icon = Zap;
      colorClass = 'bg-amber-950/40 text-amber-300 border-amber-800/40';
    } else if (key.includes('food')) {
      label = 'Food Supplies';
      Icon = Utensils;
      colorClass = 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40';
    } else if (key.includes('cot') || key.includes('bed')) {
      label = 'Emergency Cots';
      Icon = Bed;
      colorClass = 'bg-indigo-950/40 text-indigo-300 border-indigo-800/40';
    } else if (key.includes('blanket')) {
      label = 'Blankets';
      Icon = Layers;
      colorClass = 'bg-purple-950/40 text-purple-300 border-purple-800/40';
    } else if (key.includes('radio') || key.includes('satellite')) {
      label = 'Satellite Radio';
      Icon = Radio;
      colorClass = 'bg-teal-950/40 text-teal-300 border-teal-800/40';
    } else if (key.includes('shelter')) {
      label = 'Emergency Shelter';
      Icon = Building2;
      colorClass = 'bg-blue-950/40 text-blue-300 border-blue-800/40';
    }

    return (
      <span
        key={serviceKey}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${colorClass}`}
        title={`Service: ${label}`}
      >
        <Icon className="w-3 h-3 flex-shrink-0" />
        <span>{label}</span>
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'open') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Open
        </span>
      );
    }
    if (s === 'full') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
          <AlertCircle className="w-3.5 h-3.5" />
          Full
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-700/60 text-slate-300 border border-slate-600/50">
        <XCircle className="w-3.5 h-3.5" />
        Closed
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 text-slate-100 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
      {/* Header & Total Capacity Indicator */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Emergency Shelter Directory
              </h2>
              <p className="text-xs text-slate-400">
                Live capacity tracking and crowd intake allocation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 font-mono">
              {openCount} Open
            </span>
            {fullCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40 font-mono">
                {fullCount} Full
              </span>
            )}
            {closedCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                {closedCount} Closed
              </span>
            )}
          </div>
        </div>

        {/* Total Capacity Indicator Card */}
        <div className="bg-slate-800/70 rounded-lg p-3 border border-slate-700/60">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              Total Safe Capacity
            </span>
            <span className="font-mono font-medium text-slate-200">
              <strong className="text-white">{totalOccupancy.toLocaleString()}</strong> /{' '}
              {totalCapacity.toLocaleString()} evacuees ({overallPercentage}%)
            </span>
          </div>

          {/* Aggregate Progress Bar */}
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/50">
            <div
              className={`h-full transition-all duration-500 ease-out rounded-full ${
                overallPercentage >= 95
                  ? 'bg-red-500'
                  : overallPercentage >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${overallPercentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
            <span>Remaining Buffer:</span>
            <span
              className={`font-semibold font-mono ${
                remainingCapacity === 0
                  ? 'text-red-400'
                  : remainingCapacity < 150
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {remainingCapacity.toLocaleString()} spots available
            </span>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="mt-3">
          <button
            type="button"
            onClick={onRunBatchEvacuation}
            disabled={batchLoading}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all duration-200 shadow-md flex items-center justify-center gap-2 ${
              batchLoading
                ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed border border-blue-500/30'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20 hover:shadow-blue-500/30 border border-blue-400/30 active:scale-[0.99]'
            }`}
          >
            {batchLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Simulating Full Crowd Evacuation...</span>
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                <span>Simulate Full Crowd Evacuation</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-slate-400 text-center mt-1">
            Triggers capacity-constrained crowd assignment and updates occupancy bars
          </p>
        </div>
      </div>

      {/* Shelter Cards List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {shelters.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
            <p>No emergency shelters loaded in current scenario.</p>
          </div>
        ) : (
          shelters.map((shelter) => {
            const cap = Math.max(1, shelter.capacity || 0);
            const occ = shelter.occupancy || 0;
            const pct = Math.min(100, Math.round((occ / cap) * 100));
            const isFull = shelter.status?.toLowerCase() === 'full' || pct >= 100;
            const isClosed = shelter.status?.toLowerCase() === 'closed';

            return (
              <div
                key={shelter.id}
                onClick={() => onShelterClick?.(shelter.id)}
                className={`bg-slate-800/80 rounded-xl p-3.5 border border-slate-700/80 hover:border-slate-600 transition-all shadow-sm ${
                  onShelterClick ? 'cursor-pointer hover:bg-slate-800' : ''
                }`}
              >
                {/* Title and Status Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-white text-sm truncate" title={shelter.name}>
                      {shelter.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono text-slate-400">ID: {shelter.id}</span>
                      {shelter.lat && shelter.lon && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({shelter.lat.toFixed(4)}, {shelter.lon.toFixed(4)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div>{getStatusBadge(shelter.status)}</div>
                </div>

                {/* Occupancy Progress Bar */}
                <div className="space-y-1 mb-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Occupancy</span>
                    <span className="font-mono text-slate-200">
                      <span
                        className={`font-bold ${
                          isFull
                            ? 'text-red-400'
                            : pct >= 80
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {occ.toLocaleString()}
                      </span>{' '}
                      /{' '}
                      <span className="text-slate-400">{cap.toLocaleString()}</span>{' '}
                      <span className="text-slate-400 text-[11px]">({pct}%)</span>
                    </span>
                  </div>

                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/60">
                    <div
                      className={`h-full transition-all duration-500 ease-out rounded-full ${
                        isClosed
                          ? 'bg-slate-600'
                          : isFull
                          ? 'bg-red-500'
                          : pct >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Badges Row: Accessibility & Available Services */}
                <div className="space-y-2 pt-1 border-t border-slate-700/50">
                  {/* Accessibility Badge */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">Mobility Access:</span>
                    {shelter.accessible ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-950/40 text-cyan-300 border border-cyan-800/50"
                        title="Step-free wheelchair ramp and ADA certified entry"
                      >
                        <Accessibility className="w-3.5 h-3.5 text-cyan-400" />
                        Wheelchair step-free
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/40 text-amber-300 border border-amber-800/50"
                        title="Elevation with steps, restricted wheelchair accessibility"
                      >
                        <Footprints className="w-3.5 h-3.5 text-amber-400" />
                        Staged steps
                      </span>
                    )}
                  </div>

                  {/* Available Services Pills */}
                  {shelter.services && shelter.services.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 mb-1">Available Services:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {shelter.services.map((svc) => renderServicePill(svc))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ShelterPanel;
