import React from 'react';
import { Clock, Navigation, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { RouteCandidate } from '../types';

interface RouteCardProps {
  candidate: RouteCandidate;
  isPrimary: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  candidate,
  isPrimary,
  isSelected,
  onSelect,
}) => {
  const durationMins = Math.round(candidate.estimated_duration_s / 60);
  const distanceKm = (candidate.distance_m / 1000).toFixed(2);

  // Score color
  const score = candidate.resilience_score;
  const scoreColor =
    score >= 75
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : score >= 50
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-red-400 bg-red-500/10 border-red-500/30';

  return (
    <div
      onClick={onSelect}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/50'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {isSelected ? (
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
          )}
          <span className="font-semibold text-xs text-white">
            {isPrimary ? 'Recommended Route' : `Alternative (${candidate.route_id.replace('_', ' ')})`}
          </span>
        </div>

        {/* Resilience Heuristic Score */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono font-bold ${scoreColor}`}
          title="Heuristic safety rating (0-100) based on modeled flood depth and congestion"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{score}/100</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center gap-4 text-xs text-slate-300 font-mono mb-2">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{durationMins > 0 ? `${durationMins} min` : `${Math.round(candidate.estimated_duration_s)}s`}</span>
        </div>
        <div className="flex items-center gap-1">
          <Navigation className="w-3.5 h-3.5 text-slate-400" />
          <span>{distanceKm} km</span>
        </div>
        <div className="text-[11px] text-slate-400 capitalize">
          Exposure: <span className="text-slate-200 font-medium">{candidate.hazard_exposure}</span>
        </div>
      </div>

      {/* Warnings List */}
      {candidate.warnings && candidate.warnings.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
          {candidate.warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
