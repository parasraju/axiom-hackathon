import React from 'react';
import { Play, Pause, RotateCcw, AlertTriangle, ShieldAlert, Waves, CheckCircle2, Flame } from 'lucide-react';

export interface TimeSliderProps {
  currentMinute: number;
  isPlaying: boolean;
  speed: number;
  onMinuteChange: (minute: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
}

interface Keyframe {
  minute: number;
  title: string;
  shortLabel: string;
  description: string;
  severity: 'normal' | 'caution' | 'danger' | 'critical';
  icon: React.ComponentType<{ className?: string }>;
}

const KEYFRAMES: Keyframe[] = [
  {
    minute: 0,
    title: 'T+0: Normal',
    shortLabel: 'Normal',
    description: 'Baseline open network, initial evacuation mobilization',
    severity: 'normal',
    icon: CheckCircle2,
  },
  {
    minute: 15,
    title: 'T+15: Flood alert',
    shortLabel: 'Flood alert',
    description: 'River surge detected near South Bridge zone',
    severity: 'caution',
    icon: Waves,
  },
  {
    minute: 30,
    title: 'T+30: South Bridge closed',
    shortLabel: 'South Bridge closed',
    description: 'Bridge submerged; traffic diverted to North Artery',
    severity: 'danger',
    icon: ShieldAlert,
  },
  {
    minute: 45,
    title: 'T+45: Demand surge',
    shortLabel: 'Demand surge',
    description: 'Central origin population surge (+150 evacuees)',
    severity: 'caution',
    icon: Flame,
  },
  {
    minute: 60,
    title: 'T+60: Overflow',
    shortLabel: 'Overflow',
    description: 'East shelter hits full capacity; cutoff roads active',
    severity: 'critical',
    icon: AlertTriangle,
  },
  {
    minute: 75,
    title: 'T+75: Peak bottleneck',
    shortLabel: 'Peak bottleneck',
    description: 'Saturation threshold; high congestion ratios',
    severity: 'danger',
    icon: ShieldAlert,
  },
  {
    minute: 90,
    title: 'T+90: Plateau',
    shortLabel: 'Evac plateau',
    description: 'Final steady state reached across network',
    severity: 'normal',
    icon: CheckCircle2,
  },
];

const DISCRETE_MARKS = [0, 15, 30, 45, 60, 75, 90];
const SPEED_OPTIONS = [1, 2, 4];

export const TimeSlider: React.FC<TimeSliderProps> = ({
  currentMinute,
  isPlaying,
  speed,
  onMinuteChange,
  onTogglePlay,
  onSpeedChange,
  onReset,
}) => {
  const activeKeyframe = KEYFRAMES.find((k) => k.minute === currentMinute);
  const progressPercent = Math.min(100, Math.max(0, (currentMinute / 90) * 100));

  const getSeverityBadgeClasses = (severity: Keyframe['severity'], isActive: boolean) => {
    if (isActive) {
      switch (severity) {
        case 'critical':
          return 'bg-purple-900/60 text-purple-300 border-purple-500 shadow-purple-900/50';
        case 'danger':
          return 'bg-rose-900/60 text-rose-300 border-rose-500 shadow-rose-900/50';
        case 'caution':
          return 'bg-amber-900/60 text-amber-300 border-amber-500 shadow-amber-900/50';
        case 'normal':
        default:
          return 'bg-cyan-900/60 text-cyan-300 border-cyan-500 shadow-cyan-900/50';
      }
    }
    return 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-800 hover:text-slate-200';
  };

  return (
    <div className="w-full bg-slate-900/95 border border-slate-800/80 rounded-2xl p-4 md:p-5 shadow-2xl backdrop-blur-md text-slate-100 flex flex-col gap-4">
      {/* Top Banner: Deterministic Simulated Scenario Notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/15 via-blue-500/10 to-indigo-500/15 border border-amber-500/30">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          <span className="text-xs font-bold tracking-wider uppercase text-amber-300 font-mono">
            SIMULATED SCENARIO - Deterministic Model
          </span>
        </div>
        <div className="text-[11px] text-slate-400 font-medium">
          Monsoon Surge 90-Minute Forecast &bull; 15-Min Step Evaluation
        </div>
      </div>

      {/* Control Bar: Playback Controls & Big Badge */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Play/Pause, Reset, and Speed */}
        <div className="flex items-center gap-3">
          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 shadow-lg active:scale-95 cursor-pointer ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40 ring-2 ring-amber-400/30'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40 ring-2 ring-blue-400/30'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current ml-0.5" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={onReset}
            title="Reset to T+0"
            aria-label="Reset timeline"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700/80 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Speed Selector */}
          <div className="flex items-center bg-slate-800/90 rounded-xl p-1 border border-slate-700/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold px-2 hidden sm:inline">
              Speed
            </span>
            <div className="flex gap-0.5">
              {SPEED_OPTIONS.map((s) => {
                const isSelected = speed === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSpeedChange(s)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                  >
                    {s}x
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Big Active Minute Badge */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
              Simulation Time
            </div>
            <div className="text-xs text-slate-300 font-medium truncate max-w-[180px]">
              {activeKeyframe ? activeKeyframe.shortLabel : `Minute ${currentMinute}`}
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 px-4 py-2 bg-slate-950/80 rounded-xl border border-cyan-500/40 shadow-inner shadow-cyan-950/60 ring-1 ring-cyan-500/20">
            <span className="text-sm font-black text-cyan-400 tracking-wider">T +</span>
            <span className="font-mono text-2xl md:text-3xl font-black text-white tracking-tight">
              {currentMinute}
            </span>
            <span className="text-xs font-bold text-cyan-400/80 uppercase">min</span>
          </div>
        </div>
      </div>

      {/* Discrete Timeline Slider Track */}
      <div className="pt-2 pb-1 px-1">
        <div className="relative flex items-center select-none">
          {/* Background Track */}
          <div className="absolute left-0 right-0 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Native Range Input (Hidden visual thumb replaced or styled cleanly) */}
          <input
            type="range"
            min={0}
            max={90}
            step={15}
            value={currentMinute}
            onChange={(e) => onMinuteChange(Number(e.target.value))}
            className="w-full h-6 opacity-0 absolute z-20 cursor-pointer"
            aria-label="Simulation minute slider"
          />

          {/* Discrete Mark Points along the track */}
          <div className="relative z-10 w-full flex justify-between items-center pointer-events-none">
            {DISCRETE_MARKS.map((mark) => {
              const isPassed = mark <= currentMinute;
              const isCurrent = mark === currentMinute;
              return (
                <div
                  key={mark}
                  className="flex flex-col items-center pointer-events-auto"
                  onClick={() => onMinuteChange(mark)}
                >
                  <button
                    type="button"
                    aria-label={`Jump to minute ${mark}`}
                    className={`rounded-full transition-all duration-150 cursor-pointer flex items-center justify-center ${
                      isCurrent
                        ? 'w-5 h-5 bg-cyan-400 ring-4 ring-cyan-500/40 shadow-lg shadow-cyan-500/50 scale-125'
                        : isPassed
                        ? 'w-3.5 h-3.5 bg-blue-500 hover:scale-125 ring-2 ring-slate-900'
                        : 'w-3 h-3 bg-slate-700 hover:bg-slate-500 hover:scale-125 ring-2 ring-slate-900'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Minute Labels directly under the track */}
        <div className="flex justify-between items-center text-xs font-mono font-medium text-slate-400 pt-2 px-0.5 select-none">
          {DISCRETE_MARKS.map((mark) => {
            const isCurrent = mark === currentMinute;
            return (
              <button
                key={mark}
                type="button"
                onClick={() => onMinuteChange(mark)}
                className={`transition-colors cursor-pointer text-center w-8 -mx-4 ${
                  isCurrent
                    ? 'text-cyan-300 font-bold scale-110'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mark}m
              </button>
            );
          })}
        </div>
      </div>

      {/* Scenario Keyframe Highlights Strip */}
      <div className="mt-1 pt-3 border-t border-slate-800/70">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
          <span>Scenario Keyframe Highlights</span>
          <span className="text-[10px] text-slate-500 font-normal">Click mark to jump</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {KEYFRAMES.map((kf) => {
            const isCurrent = kf.minute === currentMinute;
            const Icon = kf.icon;
            const badgeClasses = getSeverityBadgeClasses(kf.severity, isCurrent);

            return (
              <button
                key={kf.minute}
                type="button"
                onClick={() => onMinuteChange(kf.minute)}
                className={`text-left p-2 rounded-xl border transition-all duration-150 flex flex-col justify-between cursor-pointer ${badgeClasses} ${
                  isCurrent ? 'ring-2 ring-cyan-400/50 shadow-md scale-[1.02]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono text-xs font-black">
                    T+{kf.minute}
                  </span>
                  <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'animate-pulse' : 'opacity-70'}`} />
                </div>
                <div className="text-[11px] font-semibold leading-tight truncate w-full" title={kf.title}>
                  {kf.shortLabel}
                </div>
                <div className="text-[9px] opacity-75 mt-0.5 line-clamp-1 text-slate-400" title={kf.description}>
                  {kf.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TimeSlider;
