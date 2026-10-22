import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  ShieldAlert,
  Waves,
  CheckCircle2,
  Flame,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from 'lucide-react';


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
    shortLabel: 'Bridge closed',
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
    shortLabel: 'Bottlenecks',
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
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [hoveredMark, setHoveredMark] = useState<number | null>(null);

  const activeKeyframe = KEYFRAMES.find((k) => k.minute === currentMinute);
  const progressPercent = Math.min(100, Math.max(0, (currentMinute / 90) * 100));

  const getSeverityBadgeClasses = (severity: Keyframe['severity'], isActive: boolean) => {
    if (isActive) {
      switch (severity) {
        case 'critical':
          return 'bg-purple-900/80 text-purple-200 border-purple-500 shadow-lg shadow-purple-900/50 ring-1 ring-purple-400/50';
        case 'danger':
          return 'bg-rose-900/80 text-rose-200 border-rose-500 shadow-lg shadow-rose-900/50 ring-1 ring-rose-400/50';
        case 'caution':
          return 'bg-amber-900/80 text-amber-200 border-amber-500 shadow-lg shadow-amber-900/50 ring-1 ring-amber-400/50';
        case 'normal':
        default:
          return 'bg-cyan-900/80 text-cyan-200 border-cyan-500 shadow-lg shadow-cyan-900/50 ring-1 ring-cyan-400/50';
      }
    }
    return 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200';
  };

  const getMarkDotColor = (mark: number) => {
    const kf = KEYFRAMES.find((k) => k.minute === mark);
    if (!kf) return 'bg-slate-600';
    switch (kf.severity) {
      case 'critical':
        return 'bg-purple-500';
      case 'danger':
        return 'bg-rose-500';
      case 'caution':
        return 'bg-amber-500';
      case 'normal':
      default:
        return 'bg-emerald-400';
    }
  };

  // Ultra-minimized floating pill view
  if (isMinimized) {
    return (
      <div className="flex items-center gap-2 p-1.5 px-3 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-full shadow-2xl text-slate-200 select-none animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onTogglePlay}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
            isPlaying ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-blue-600 text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        <div className="flex items-baseline gap-1 px-2 font-mono text-xs font-bold text-cyan-300">
          <span>T+</span>
          <span className="text-sm text-white">{currentMinute}</span>
          <span className="text-[10px] text-cyan-400/80">m</span>
        </div>

        <span className="text-xs text-slate-400 truncate max-w-[100px]">
          {activeKeyframe?.shortLabel || 'Sim'}
        </span>

        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Expand Timeline Controls"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-2 pointer-events-auto select-none transition-all duration-300">
      {/* 1. Optional Expanded Highlights Drawer (Collapsible) */}
      {showDrawer && (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-3.5 shadow-2xl animate-in slide-in-from-bottom-3 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono">
                Scenario Timeline Keyframes
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                &bull; Monsoon Surge 90-Min Forecast
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowDrawer(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-xs flex items-center gap-1"
            >
              <span className="text-[11px]">Hide Highlights</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 7 Keyframe Cards Horizontal Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
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
                    isCurrent ? 'scale-[1.02]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-xs font-black">
                      T+{kf.minute}m
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
      )}

      {/* 2. Main Sleek Compact Scrubber Bar */}
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl px-3.5 py-2.5 shadow-2xl text-slate-100 flex flex-col sm:flex-row items-center gap-3">
        {/* Left: Playback Controls */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-1.5">
            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30 ring-2 ring-amber-400/50'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-blue-500/30'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Play</span>
                </>
              )}
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={onReset}
              title="Reset to T+0"
              className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Speed Selector */}
            <div className="flex items-center bg-slate-800/90 rounded-xl p-0.5 border border-slate-700/80">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSpeedChange(s)}
                  className={`px-1.5 py-0.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    speed === s
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Time Badge (Mobile visible) */}
          <div className="flex items-center gap-1.5 sm:hidden bg-slate-950/80 px-2.5 py-1 rounded-xl border border-cyan-500/30">
            <span className="text-[11px] font-black text-cyan-400 font-mono">T+{currentMinute}m</span>
            <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">
              {activeKeyframe?.shortLabel}
            </span>
          </div>
        </div>

        {/* Center: Timeline Scrubber Track */}
        <div className="flex-1 w-full px-2">
          <div className="relative flex items-center select-none py-1">
            {/* Background Track */}
            <div className="absolute left-0 right-0 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Native range slider */}
            <input
              type="range"
              min={0}
              max={90}
              step={15}
              value={currentMinute}
              onChange={(e) => onMinuteChange(Number(e.target.value))}
              className="w-full h-6 opacity-0 absolute z-20 cursor-pointer"
              aria-label="Simulation timeline slider"
            />

            {/* Discrete Step Dots with Hover Tooltip */}
            <div className="relative z-10 w-full flex justify-between items-center pointer-events-none">
              {DISCRETE_MARKS.map((mark) => {
                const isPassed = mark <= currentMinute;
                const isCurrent = mark === currentMinute;
                const dotColor = getMarkDotColor(mark);
                const kf = KEYFRAMES.find((k) => k.minute === mark);

                return (
                  <div
                    key={mark}
                    className="relative flex flex-col items-center pointer-events-auto"
                    onMouseEnter={() => setHoveredMark(mark)}
                    onMouseLeave={() => setHoveredMark(null)}
                    onClick={() => onMinuteChange(mark)}
                  >
                    {/* Tooltip on hover */}
                    {hoveredMark === mark && !showDrawer && (
                      <div className="absolute bottom-6 z-30 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 shadow-xl whitespace-nowrap text-left text-[11px] pointer-events-none transform -translate-x-1/2 left-1/2 animate-in fade-in duration-150">
                        <div className="font-bold text-cyan-300 font-mono">T+{mark}m: {kf?.shortLabel}</div>
                        <div className="text-[10px] text-slate-400 max-w-[200px] whitespace-normal">
                          {kf?.description}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      aria-label={`Jump to T+${mark}m`}
                      className={`rounded-full transition-all duration-150 cursor-pointer flex items-center justify-center ${
                        isCurrent
                          ? 'w-4 h-4 bg-cyan-300 ring-4 ring-cyan-500/40 shadow-lg shadow-cyan-500/50 scale-125'
                          : isPassed
                          ? `w-3 h-3 ${dotColor} hover:scale-125 ring-2 ring-slate-900`
                          : 'w-2.5 h-2.5 bg-slate-700 hover:bg-slate-500 hover:scale-125 ring-2 ring-slate-900'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Minute Labels directly under the track */}
          <div className="flex justify-between items-center text-[10px] font-mono font-medium text-slate-400 select-none pt-0.5">
            {DISCRETE_MARKS.map((mark) => (
              <button
                key={mark}
                type="button"
                onClick={() => onMinuteChange(mark)}
                className={`transition-colors cursor-pointer text-center w-6 -mx-3 ${
                  mark === currentMinute
                    ? 'text-cyan-300 font-bold scale-110'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mark}m
              </button>
            ))}
          </div>
        </div>

        {/* Right: Active Status Badge & Drawer Toggle */}
        <div className="hidden sm:flex items-center gap-2.5 shrink-0">
          {/* Active Minute Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 rounded-xl border border-cyan-500/30 shadow-inner">
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-xs font-bold text-cyan-400">T+</span>
              <span className="text-lg font-black text-white">{currentMinute}</span>
              <span className="text-[10px] font-semibold text-cyan-400/80">min</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="text-left max-w-[110px]">
              <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider leading-none">
                Phase
              </div>
              <div className="text-xs font-semibold text-slate-200 truncate leading-tight">
                {activeKeyframe?.shortLabel || 'Forecast'}
              </div>
            </div>
          </div>

          {/* Toggle Highlights Drawer */}
          <button
            type="button"
            onClick={() => setShowDrawer(!showDrawer)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
              showDrawer
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
            }`}
            title={showDrawer ? 'Hide keyframe cards' : 'Show scenario keyframe details'}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-semibold hidden md:inline">Keyframes</span>
            {showDrawer ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Minimize Button */}
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Minimize to floating pill"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeSlider;
