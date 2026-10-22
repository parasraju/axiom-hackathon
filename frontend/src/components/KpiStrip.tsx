import React from 'react';
import { Users, ShieldCheck, AlertTriangle, Activity, ShieldAlert, CheckCircle, Percent } from 'lucide-react';

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
    <div className="w-full">
      {/* 5-Card Responsive KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Evacuation Demand */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-xl p-3.5 shadow-lg backdrop-blur-sm transition-all duration-150 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Evacuation Demand
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div className="text-2xl font-black font-mono text-white tracking-tight">
              {totalDemand.toLocaleString()}
            </div>
            <span className="text-[11px] font-medium text-slate-400 font-mono">
              registered
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Origins evaluated</span>
            <span className="text-blue-300 font-medium">T+{minute}m sync</span>
          </div>
        </div>

        {/* Card 2: Successfully Sheltered */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/30 rounded-xl p-3.5 shadow-lg backdrop-blur-sm transition-all duration-150 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Successfully Sheltered
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
              {successfullySheltered.toLocaleString()}
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-600/30 font-mono">
              <Percent className="w-3 h-3" />
              {shelteredRate}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 pt-2 border-t border-slate-800/80">
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${shelteredRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: At Risk / Unassigned */}
        <div
          className={`bg-slate-900/90 border rounded-xl p-3.5 shadow-lg backdrop-blur-sm transition-all duration-150 flex flex-col justify-between ${
            atRiskUnassigned > 0
              ? 'border-rose-500/40 bg-gradient-to-b from-rose-950/20 to-slate-900/90'
              : 'border-slate-800 hover:border-slate-700/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              At Risk / Unassigned
            </span>
            <div
              className={`p-1.5 rounded-lg border ${
                atRiskUnassigned > 0
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div
              className={`text-2xl font-black font-mono tracking-tight ${
                atRiskUnassigned > 0 ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {atRiskUnassigned.toLocaleString()}
            </div>
            {atRiskUnassigned > 0 ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300 bg-rose-950/80 border border-rose-600/40 px-1.5 py-0.5 rounded">
                Deficit
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                <CheckCircle className="w-3 h-3" />
                Zero unassigned
              </span>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Capacity deficit</span>
            <span className={atRiskUnassigned > 0 ? 'text-rose-300 font-medium' : 'text-slate-500'}>
              {atRiskUnassigned > 0 ? `${atRiskUnassigned} displaced` : 'All allocated'}
            </span>
          </div>
        </div>

        {/* Card 4: Bottleneck Edges */}
        <div
          className={`bg-slate-900/90 border rounded-xl p-3.5 shadow-lg backdrop-blur-sm transition-all duration-150 flex flex-col justify-between ${
            bottleneckCount > 0
              ? 'border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-slate-900/90'
              : 'border-slate-800 hover:border-slate-700/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Bottleneck Edges
            </span>
            <div
              className={`p-1.5 rounded-lg border ${
                bottleneckCount > 0
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <Activity className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div
              className={`text-2xl font-black font-mono tracking-tight ${
                bottleneckCount > 0 ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              {bottleneckCount}
            </div>
            <span className="text-[11px] font-medium text-slate-400 font-mono">
              segment{bottleneckCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Volume/Capacity &gt; 1.0</span>
            <span className={bottleneckCount > 0 ? 'text-amber-300 font-semibold' : 'text-slate-500'}>
              {bottleneckCount > 0 ? 'Flow restricted' : 'Free flowing'}
            </span>
          </div>
        </div>

        {/* Card 5: Closed Road Segments */}
        <div
          className={`bg-slate-900/90 border rounded-xl p-3.5 shadow-lg backdrop-blur-sm transition-all duration-150 flex flex-col justify-between ${
            closedRoadsCount > 0
              ? 'border-indigo-500/40 bg-gradient-to-b from-indigo-950/20 to-slate-900/90'
              : 'border-slate-800 hover:border-slate-700/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Closed Road Segments
            </span>
            <div
              className={`p-1.5 rounded-lg border ${
                closedRoadsCount > 0
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                  : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div
              className={`text-2xl font-black font-mono tracking-tight ${
                closedRoadsCount > 0 ? 'text-indigo-300' : 'text-slate-300'
              }`}
            >
              {closedRoadsCount}
            </div>
            <span className="text-[11px] font-medium text-slate-400 font-mono">
              cut off
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Flood &amp; hazards</span>
            <span className={closedRoadsCount > 0 ? 'text-indigo-300 font-medium' : 'text-slate-500'}>
              {closedRoadsCount > 0 ? 'Rerouting active' : 'All links open'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KpiStrip;
