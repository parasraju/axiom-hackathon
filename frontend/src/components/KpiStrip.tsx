import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Activity,
  ShieldAlert,
  CheckCircle,
  Percent,
  ChevronDown,
  ChevronUp,
  Gauge,
} from 'lucide-react';

export interface KpiMetrics {
  total_evacuees?: number;
  assigned_count?: number;
  unassigned_count?: number;
  bottleneck_edges_count?: number;
  bottleneck_edges?: string[];
  closed_edges_count?: number;
  closed_edges?: string[];
  overloaded_edges_count?: number;
  overloaded_edges?: string[];
  unassigned_reasons?: Record<string, string>;
  total_demand?: number;
  sheltered_count?: number;
  at_risk_count?: number;
  [key: string]: any;
}

export interface KpiStripProps {
  metrics: any;
  minute: number;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ metrics, minute }) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  // Extract values with flexible fallbacks
  const totalDemand =
    metrics?.total_evacuees ?? metrics?.total_demand ?? (metrics ? 0 : 1250);

  const successfullySheltered =
    metrics?.assigned_count ?? metrics?.sheltered_count ?? (metrics ? 0 : 1250);

  const atRiskUnassigned =
    metrics?.unassigned_count ?? metrics?.at_risk_count ?? 0;

  const bottleneckCount =
    metrics?.bottleneck_edges_count ??
    metrics?.overloaded_edges_count ??
    metrics?.bottleneck_edges?.length ??
    metrics?.overloaded_edges?.length ??
    0;

  const closedRoadsCount =
    metrics?.closed_edges_count ??
    metrics?.closed_edges?.length ??
    0;

  const shelteredRate =
    totalDemand > 0 ? Math.round((successfullySheltered / totalDemand) * 100) : 100;

  return (
    <div className="w-full flex flex-col gap-2 select-none">
      {/* 1. Sleek Compact High-Density Telemetry Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md text-xs">
        {/* Metric Pills */}
        <div className="flex flex-wrap items-center gap-3 md:gap-5">
          {/* Evacuation Demand */}
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400 text-[11px] uppercase font-semibold">Demand:</span>
            <span className="font-mono font-bold text-white text-xs">{totalDemand.toLocaleString()}</span>
          </div>

          {/* Sheltered Rate */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 text-[11px] uppercase font-semibold">Sheltered:</span>
            <span className="font-mono font-bold text-emerald-400 text-xs">
              {successfullySheltered.toLocaleString()} ({shelteredRate}%)
            </span>
            <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden hidden sm:block">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${shelteredRate}%` }}
              />
            </div>
          </div>

          {/* At Risk */}
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-3.5 h-3.5 ${atRiskUnassigned > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-slate-400 text-[11px] uppercase font-semibold">At Risk:</span>
            <span className={`font-mono font-bold text-xs ${atRiskUnassigned > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
              {atRiskUnassigned.toLocaleString()}
            </span>
          </div>

          {/* Bottlenecks */}
          <div className="flex items-center gap-2">
            <Activity className={`w-3.5 h-3.5 ${bottleneckCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
            <span className="text-slate-400 text-[11px] uppercase font-semibold">Bottlenecks:</span>
            <span className={`font-mono font-bold text-xs ${bottleneckCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
              {bottleneckCount}
            </span>
          </div>

          {/* Closed Roads */}
          <div className="flex items-center gap-2">
            <ShieldAlert className={`w-3.5 h-3.5 ${closedRoadsCount > 0 ? 'text-indigo-400' : 'text-slate-500'}`} />
            <span className="text-slate-400 text-[11px] uppercase font-semibold">Closed Links:</span>
            <span className={`font-mono font-bold text-xs ${closedRoadsCount > 0 ? 'text-indigo-300' : 'text-slate-300'}`}>
              {closedRoadsCount}
            </span>
          </div>
        </div>

        {/* Right: Detailed Cards Toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[11px] font-semibold cursor-pointer border border-slate-700/60"
        >
          <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          <span>{expanded ? 'Hide Cards' : 'Details'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
        </button>
      </div>

      {/* 2. Expanded 5-Card Grid (Only rendered when user expands) */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 animate-in slide-in-from-top-2 fade-in duration-150">
          {/* Card 1: Total Evacuation Demand */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3 shadow-lg backdrop-blur-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total Demand
              </span>
              <div className="p-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-black font-mono text-white tracking-tight">
                {totalDemand.toLocaleString()}
              </div>
              <span className="text-[10px] font-medium text-slate-400 font-mono">registered</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>Origins evaluated</span>
              <span className="text-blue-300 font-medium">T+{minute}m sync</span>
            </div>
          </div>

          {/* Card 2: Successfully Sheltered */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3 shadow-lg backdrop-blur-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Sheltered
              </span>
              <div className="p-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-black font-mono text-emerald-400 tracking-tight">
                {successfullySheltered.toLocaleString()}
              </div>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1 py-0.5 rounded font-mono">
                <Percent className="w-2.5 h-2.5" />
                {shelteredRate}%
              </span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-800">
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${shelteredRate}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: At Risk */}
          <div
            className={`bg-slate-900/95 border rounded-xl p-3 shadow-lg backdrop-blur-sm flex flex-col justify-between ${
              atRiskUnassigned > 0
                ? 'border-rose-500/40 bg-gradient-to-b from-rose-950/20 to-slate-900/95'
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                At Risk / Unassigned
              </span>
              <div
                className={`p-1 rounded border ${
                  atRiskUnassigned > 0
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div
                className={`text-xl font-black font-mono tracking-tight ${
                  atRiskUnassigned > 0 ? 'text-rose-400' : 'text-slate-300'
                }`}
              >
                {atRiskUnassigned.toLocaleString()}
              </div>
              {atRiskUnassigned > 0 ? (
                <span className="text-[9px] font-bold uppercase text-rose-300 bg-rose-950/80 px-1 py-0.5 rounded border border-rose-600/40">
                  Deficit
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-400">
                  <CheckCircle className="w-3 h-3" />
                  Zero
                </span>
              )}
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>Capacity deficit</span>
              <span className={atRiskUnassigned > 0 ? 'text-rose-300 font-medium' : 'text-slate-500'}>
                {atRiskUnassigned > 0 ? `${atRiskUnassigned} displaced` : 'All allocated'}
              </span>
            </div>
          </div>

          {/* Card 4: Bottleneck Edges */}
          <div
            className={`bg-slate-900/95 border rounded-xl p-3 shadow-lg backdrop-blur-sm flex flex-col justify-between ${
              bottleneckCount > 0
                ? 'border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-slate-900/95'
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Bottlenecks
              </span>
              <div
                className={`p-1 rounded border ${
                  bottleneckCount > 0
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div
                className={`text-xl font-black font-mono tracking-tight ${
                  bottleneckCount > 0 ? 'text-amber-400' : 'text-slate-300'
                }`}
              >
                {bottleneckCount}
              </div>
              <span className="text-[10px] font-medium text-slate-400 font-mono">segment{bottleneckCount === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>V/C Ratio &gt; 1.0</span>
              <span className={bottleneckCount > 0 ? 'text-amber-300 font-semibold' : 'text-slate-500'}>
                {bottleneckCount > 0 ? 'Congested' : 'Free flowing'}
              </span>
            </div>
          </div>

          {/* Card 5: Closed Road Segments */}
          <div
            className={`bg-slate-900/95 border rounded-xl p-3 shadow-lg backdrop-blur-sm flex flex-col justify-between ${
              closedRoadsCount > 0
                ? 'border-indigo-500/40 bg-gradient-to-b from-indigo-950/20 to-slate-900/95'
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Closed Links
              </span>
              <div
                className={`p-1 rounded border ${
                  closedRoadsCount > 0
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div
                className={`text-xl font-black font-mono tracking-tight ${
                  closedRoadsCount > 0 ? 'text-indigo-300' : 'text-slate-300'
                }`}
              >
                {closedRoadsCount}
              </div>
              <span className="text-[10px] font-medium text-slate-400 font-mono">cut off</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>Flood &amp; hazards</span>
              <span className={closedRoadsCount > 0 ? 'text-indigo-300 font-medium' : 'text-slate-500'}>
                {closedRoadsCount > 0 ? 'Rerouting active' : 'All open'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KpiStrip;
