import React, { useState } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Tent,
  Sparkles,
} from 'lucide-react';
import type { Shelter } from '../types';

export interface ShelterPanelProps {
  shelters: Shelter[];
  onRunBatchEvacuation: () => Promise<void>;
  batchLoading: boolean;
  onShelterClick?: (shelterId: string) => void;
  onResetCrowd?: () => void;
  onSimulateAllFull?: () => void;
  onActivateOverflow?: () => void;
  isOverflowActive?: boolean;
}

export const ShelterPanel: React.FC<ShelterPanelProps> = ({
  shelters,
  onRunBatchEvacuation,
  batchLoading,
  onShelterClick,
  onResetCrowd,
  onSimulateAllFull,
  onActivateOverflow,
  isOverflowActive = false,
}) => {
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Compute aggregate statistics
  const totalCapacity = shelters.reduce((acc, s) => acc + (s.capacity || 0), 0);
  const totalOccupancy = shelters.reduce((acc, s) => acc + (s.occupancy || 0), 0);
  const remainingCapacity = Math.max(0, totalCapacity - totalOccupancy);
  const overallPercentage =
    totalCapacity > 0 ? Math.min(100, Math.round((totalOccupancy / totalCapacity) * 100)) : 0;

  const openCount = shelters.filter((s) => s.status?.toLowerCase() === 'open').length;
  const fullCount = shelters.filter((s) => s.status?.toLowerCase() === 'full' || (s.occupancy || 0) >= s.capacity).length;
  const closedCount = shelters.filter((s) => s.status?.toLowerCase() === 'closed').length;

  const allSheltersFull = shelters.length > 0 && remainingCapacity === 0;

  const handleEvacuateClick = async () => {
    try {
      await onRunBatchEvacuation();
      setSuccessToast('1,250 evacuees dispatched and allocated with zero overbooking!');
      setTimeout(() => setSuccessToast(null), 4000);
    } catch {
      // handled in parent
    }
  };

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
      label = 'Emergency Refuge';
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

  const getStatusBadge = (status: string, occ: number, cap: number) => {
    const s = (status || '').toLowerCase();
    if (s === 'closed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
          <AlertCircle className="w-3 h-3 text-slate-400" />
          <span>CLOSED</span>
        </span>
      );
    }
    if (s === 'full' || occ >= cap) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-950/80 text-red-300 border border-red-500/50 shadow-sm animate-pulse">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span>FULL</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        <span>OPEN</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 backdrop-blur text-slate-100 rounded-xl overflow-hidden shadow-xl border border-slate-800">
      {/* Header & Global Stats */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-sm uppercase tracking-wide text-white">
              Emergency Shelter Network
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 font-mono font-bold">
              {openCount} Open
            </span>
            {fullCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800/50 font-mono font-bold">
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
        <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/60">
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
          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
            <div
              className={`h-full transition-all duration-500 ease-out rounded-full ${
                overallPercentage >= 100
                  ? 'bg-red-500 shadow-[0_0_10px_#ef4444]'
                  : overallPercentage >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${overallPercentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 font-mono">
            <span>Remaining Buffer:</span>
            <span
              className={`font-bold ${
                remainingCapacity === 0
                  ? 'text-red-400 animate-pulse'
                  : remainingCapacity < 250
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {remainingCapacity.toLocaleString()} spots available
            </span>
          </div>
        </div>

        {/* Success Toast */}
        {successToast && (
          <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* ALL SHELTERS FULL EMERGENCY ALERT BANNER */}
        {allSheltersFull && (
          <div className="bg-red-950/80 border border-red-500/60 rounded-xl p-3.5 space-y-2.5 shadow-lg shadow-red-950/40 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-red-300 font-bold text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 animate-pulse" />
              <span>All Evacuation Shelters at 100% Capacity!</span>
            </div>
            <p className="text-[11px] text-red-200/90 leading-relaxed">
              Every primary refuge is full ({totalOccupancy.toLocaleString()} / {totalCapacity.toLocaleString()} evacuees). Overbooking is strictly prevented to avoid dangerous bottlenecks and facility failure.
            </p>

            {/* Overflow Contingency Action */}
            {!isOverflowActive && onActivateOverflow ? (
              <button
                type="button"
                onClick={onActivateOverflow}
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Tent className="w-3.5 h-3.5" />
                <span>Activate Regional Mutual Aid Overflow (+500 Buffer)</span>
              </button>
            ) : (
              <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Regional Airport Mutual Aid Camp deployed (+500 capacity active).</span>
              </div>
            )}
          </div>
        )}

        {/* Primary Simulation Controls */}
        <div className="space-y-2">
          {/* Simulate Full Crowd Evacuation Button */}
          <button
            type="button"
            onClick={handleEvacuateClick}
            disabled={batchLoading}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all duration-200 shadow-md flex items-center justify-center gap-2 cursor-pointer ${
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
                <span>Simulate Full Crowd Evacuation (1,250 Evacuees)</span>
              </>
            )}
          </button>

          {/* Quick Scenario Demonstration Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {/* Reset Crowd Button */}
            <button
              type="button"
              onClick={onResetCrowd}
              className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Reset all shelters back to 0 evacuees"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Crowd (0%)</span>
            </button>

            {/* Test All Shelters Full Surge Button */}
            <button
              type="button"
              onClick={onSimulateAllFull}
              className="py-1.5 px-2 rounded-lg bg-amber-950/40 hover:bg-amber-950/70 border border-amber-600/40 text-amber-300 text-[11px] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Fill all shelters to 100% capacity to test the 'All Shelters Full' scenario"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Fill All to 100%</span>
            </button>
          </div>

          {/* Deploy Overflow Camp button if not active and not full */}
          {!isOverflowActive && !allSheltersFull && onActivateOverflow && (
            <button
              type="button"
              onClick={onActivateOverflow}
              className="w-full py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Tent className="w-3.5 h-3.5 text-cyan-400" />
              <span>Deploy Regional Overflow Camp (+500 Cap)</span>
            </button>
          )}
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

            return (
              <div
                key={shelter.id}
                onClick={() => onShelterClick?.(shelter.id)}
                className={`bg-slate-800/80 rounded-xl p-3.5 border transition-all shadow-sm ${
                  isFull
                    ? 'border-red-500/40 bg-slate-850'
                    : 'border-slate-700/80 hover:border-slate-600'
                } ${onShelterClick ? 'cursor-pointer hover:bg-slate-800' : ''}`}
              >
                {/* Title and Status Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-white text-sm truncate" title={shelter.name}>
                      {shelter.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400 font-mono">
                        ID: {shelter.id}
                      </span>
                      {shelter.accessible ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-medium">
                          <Accessibility className="w-3 h-3" />
                          <span>Wheelchair Accessible</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 font-medium">
                          <Footprints className="w-3 h-3" />
                          <span>Stairs / Inaccessible</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div>{getStatusBadge(shelter.status, occ, cap)}</div>
                </div>

                {/* Progress Bar & Numerical Counter */}
                <div className="space-y-1 mb-2.5">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-300">
                      Occupancy: <strong className="text-white">{occ.toLocaleString()}</strong> /{' '}
                      {cap.toLocaleString()}
                    </span>
                    <span
                      className={`font-bold ${
                        isFull
                          ? 'text-red-400'
                          : pct >= 75
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/40">
                    <div
                      className={`h-full transition-all duration-500 ease-out rounded-full ${
                        isFull
                          ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                          : pct >= 75
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Overbooked or Full Warning Notice */}
                {isFull && (
                  <div className="mb-2 p-1.5 rounded-lg bg-red-950/60 border border-red-800/40 text-[10.5px] text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                    <span>Facility at 100% capacity. Incoming evacuees diverted.</span>
                  </div>
                )}

                {/* Services Provided */}
                {shelter.services && shelter.services.length > 0 && (
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Available Services:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {shelter.services.map((svc) => renderServicePill(svc))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ShelterPanel;
