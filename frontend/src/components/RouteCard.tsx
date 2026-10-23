import React from 'react';
import {
  Clock,
  Navigation,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  MapPin,
  Eye,
} from 'lucide-react';
import type { RouteCandidate } from '../types';

export interface RouteCardProps {
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
  const durationDisplay =
    durationMins > 0 ? `${durationMins} mins` : `${Math.round(candidate.estimated_duration_s)}s`;
  const distanceKm = (candidate.distance_m / 1000).toFixed(1);

  // Resilience score badge: green > 75, amber 50-75, red < 50
  const score = candidate.resilience_score;
  const scoreColor =
    score > 75
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : score >= 50
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-red-400 bg-red-500/10 border-red-500/30';

  // Hazard exposure level tag (Low / Moderate / High)
  const rawExposure = candidate.hazard_exposure || 'low';
  const exposureLower = rawExposure.toLowerCase();
  const exposureBadgeColor =
    exposureLower === 'low'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : exposureLower === 'moderate'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-red-500/15 text-red-300 border-red-500/30';
  const exposureDisplay =
    rawExposure.charAt(0).toUpperCase() + rawExposure.slice(1).toLowerCase();

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${
        isSelected
          ? 'bg-[#123438] border-teal-600 shadow-sm'
          : 'bg-[#0b2226] border-[#244044] hover:border-[#527578] hover:bg-[#10292d]'
      }`}
    >
      {/* Header: Title & Badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isSelected ? (
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
          )}
          <span className="font-semibold text-xs text-white">
            {isPrimary ? 'Recommended Route' : 'Alternative Route'}
          </span>
        </div>

        {/* Resilience Score Badge */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono font-bold shrink-0 ${scoreColor}`}
          title="Heuristic safety rating (0-100) based on modeled flood depth and congestion"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{score}/100</span>
        </div>
      </div>

      {/* Metrics Row: Distance, Duration, Hazard Exposure */}
      <div className="flex items-center justify-between gap-2 text-xs text-slate-300 font-mono mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" title="Estimated Duration">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{durationDisplay}</span>
          </div>
          <div className="flex items-center gap-1" title="Total Distance">
            <Navigation className="w-3.5 h-3.5 text-slate-400" />
            <span>{distanceKm} km</span>
          </div>
        </div>

        {/* Hazard Exposure Level Tag */}
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${exposureBadgeColor}`}
          title={`Hazard Exposure Level: ${exposureDisplay}`}
        >
          {exposureDisplay} Hazard
        </span>
      </div>

      {/* Warnings List with AlertCircle icon */}
      {candidate.warnings && candidate.warnings.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
          {candidate.warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* View on Map Toggle Action */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
            isSelected
              ? 'bg-teal-700 text-white border-teal-600'
              : 'bg-[#102d31] text-slate-300 border-[#315256] hover:bg-[#173a3e] hover:text-white'
          }`}
        >
          {isSelected ? (
            <>
              <MapPin className="w-3.5 h-3.5 text-teal-200" />
              <span>Active on Map</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>View on Map</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
