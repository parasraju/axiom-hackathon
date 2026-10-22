import React, { useState, useRef, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  HelpCircle,
  Eye,
  EyeOff,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Footprints,
  Info,
} from 'lucide-react';
import type { ScenarioSnapshot, RouteCandidate } from '../types';

export interface SimulatedCityCanvasProps {
  snapshot: ScenarioSnapshot | null;
  primaryRoute: RouteCandidate | null;
  selectedAlternative: RouteCandidate | null;
  onEdgeClick?: (edgeId: string) => void;
  onShelterClick?: (shelterId: string) => void;
}

// Coordinate projection bounds for Riverdale
const BOUNDS = {
  minLon: 74.8690,
  maxLon: 74.8875,
  minLat: 31.6260,
  maxLat: 31.6435,
};

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 800;
const PAD = 75;

function project(lon: number, lat: number): [number, number] {
  const x = PAD + ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * (SVG_WIDTH - 2 * PAD);
  const y = SVG_HEIGHT - (PAD + ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * (SVG_HEIGHT - 2 * PAD));
  return [x, y];
}

export const SimulatedCityCanvas: React.FC<SimulatedCityCanvasProps> = ({
  snapshot,
  primaryRoute,
  selectedAlternative,
  onEdgeClick,
  onShelterClick,
}) => {
  // Pan and zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedEdge, setSelectedEdge] = useState<any | null>(null);
  const [legendOpen, setLegendOpen] = useState<boolean>(true);
  const [highlightLineType, setHighlightLineType] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reset camera view
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    setZoom((prev) => Math.max(0.7, Math.min(3.5, prev * zoomFactor)));
  };

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Primary button only
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Road edges from snapshot
  const rawEdges = snapshot?.edges_geojson?.features || [];
  const floodFeatures = snapshot?.flood_geojson?.features || [];
  const shelters = snapshot?.shelters || [];
  const origins = snapshot?.origins || [];
  const currentMinute = snapshot?.minute ?? 0;

  // Filter out bridge edges from generic road drawing so custom bridge decks render without double-stroke clash
  const edgesFeatures = useMemo(() => {
    return rawEdges.filter((feat: any) => {
      const id = feat?.properties?.id || feat?.properties?.edge_id || '';
      return !id.includes('BRIDGE_NORTH') && !id.includes('BRIDGE_SOUTH');
    });
  }, [rawEdges]);

  // River geometry path coordinates (flowing down center between East Bank and West Bank)
  const riverPath = useMemo(() => {
    const points = [
      project(74.8742, 31.6442),
      project(74.8745, 31.6405),
      project(74.8749, 31.6360),
      project(74.8743, 31.6310),
      project(74.8736, 31.6252),
      project(74.8772, 31.6252),
      project(74.8776, 31.6310),
      project(74.8782, 31.6360),
      project(74.8779, 31.6405),
      project(74.8775, 31.6442),
    ];
    return `M ${points[0][0]} ${points[0][1]} 
      C ${points[1][0]} ${points[1][1]}, ${points[2][0]} ${points[2][1]}, ${points[3][0]} ${points[3][1]}
      L ${points[4][0]} ${points[4][1]}
      L ${points[5][0]} ${points[5][1]}
      C ${points[6][0]} ${points[6][1]}, ${points[7][0]} ${points[7][1]}, ${points[8][0]} ${points[8][1]}
      L ${points[9][0]} ${points[9][1]} Z`;
  }, []);

  // Bridge coordinates (Connecting East Bank N04/N06 with West Bank N08/N10)
  const northBridgeStart = project(74.8745, 31.6380); // N04
  const northBridgeEnd = project(74.8775, 31.6385);   // N08
  const southBridgeStart = project(74.8740, 31.6320); // N06
  const southBridgeEnd = project(74.8770, 31.6325);   // N10

  const isSouthBridgeFlooded = currentMinute >= 30;

  // Primary route path line
  const primaryRoutePath = useMemo(() => {
    if (!primaryRoute || !primaryRoute.geometry?.coordinates) return '';
    const coords = primaryRoute.geometry.coordinates;
    if (coords.length < 2) return '';
    return coords
      .map(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [primaryRoute]);

  // Alternative route path line
  const altRoutePath = useMemo(() => {
    if (!selectedAlternative || !selectedAlternative.geometry?.coordinates) return '';
    const coords = selectedAlternative.geometry.coordinates;
    if (coords.length < 2) return '';
    return coords
      .map(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [selectedAlternative]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="relative w-full h-full bg-[#030712] overflow-hidden select-none cursor-grab active:cursor-grabbing"
    >
      {/* 1. Tactical HUD Header & Map Control Bar */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        {/* City Indicator Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/95 border border-cyan-500/30 text-white shadow-2xl backdrop-blur-md text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="font-mono font-bold tracking-wider text-cyan-300">RIVERDALE VECTOR MAP</span>
          <span className="text-[10px] text-emerald-400 font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30">
            OFFLINE READY
          </span>
        </div>

        {/* Legend Toggle Button */}
        <button
          type="button"
          onClick={() => setLegendOpen(!legendOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xl backdrop-blur-md transition active:scale-95 cursor-pointer border ${
            legendOpen
              ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/50 shadow-cyan-950/50'
              : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border-slate-700/80'
          }`}
          title="Toggle Line Meanings & Map Legend"
        >
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>Line Meanings &amp; Legend</span>
          {legendOpen ? (
            <EyeOff className="w-3 h-3 text-cyan-400/80 ml-0.5" />
          ) : (
            <Eye className="w-3 h-3 text-cyan-400/80 ml-0.5" />
          )}
        </button>

        {/* Fit / Focus View */}
        <button
          type="button"
          onClick={handleResetView}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-xl backdrop-blur-md text-xs font-semibold transition active:scale-95 cursor-pointer"
          title="Reset city camera view"
        >
          <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Reset View</span>
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center bg-slate-900/90 border border-slate-700/80 rounded-xl p-0.5 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3.5, z * 1.2))}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 text-[11px] font-mono text-slate-400 font-bold">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.7, z * 0.82))}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Interactive Line Meanings & Map Legend Drawer (Floating Top-Right) */}
      {legendOpen && (
        <div className="absolute top-14 right-3 z-30 w-80 sm:w-96 max-h-[calc(100vh-140px)] overflow-y-auto bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl p-4 shadow-2xl text-xs text-slate-200 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                <HelpCircle className="w-4 h-4" />
              </span>
              <div>
                <h4 className="font-bold text-white text-xs tracking-wide">MAP LINE MEANINGS &amp; GUIDE</h4>
                <p className="text-[10px] text-cyan-400/80 font-mono">Visual Guide for Road Statuses &amp; Routes</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLegendOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close Guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Section 1: Road Status Lines */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Road Network Status Lines
              </div>
              <div className="space-y-2">
                {/* Green Line */}
                <div
                  onMouseEnter={() => setHighlightLineType('safe')}
                  onMouseLeave={() => setHighlightLineType(null)}
                  className={`p-2 rounded-xl transition border ${
                    highlightLineType === 'safe'
                      ? 'bg-emerald-950/60 border-emerald-500/60'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-8 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] shrink-0"></span>
                    <span className="font-bold text-emerald-300 text-xs flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Solid Green — Safe / Passable Road
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed pl-10">
                    <span className="text-white font-medium">Dry &amp; Clear</span> (water depth &lt; 0.05m). Normal operating speed (30–40 km/h). Safe for all transit: walking, wheelchairs, and evacuation vehicles.
                  </p>
                </div>

                {/* Amber Line */}
                <div
                  onMouseEnter={() => setHighlightLineType('caution')}
                  onMouseLeave={() => setHighlightLineType(null)}
                  className={`p-2 rounded-xl transition border ${
                    highlightLineType === 'caution'
                      ? 'bg-amber-950/60 border-amber-500/60'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-8 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b] shrink-0"></span>
                    <span className="font-bold text-amber-300 text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Solid Amber — Caution / Moderate Risk
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed pl-10">
                    <span className="text-white font-medium">Rising Water or Congestion</span> (depth 0.05m – 0.20m). Travel speed reduced by 40–70%. Passable with elevated caution.
                  </p>
                </div>

                {/* Red Line */}
                <div
                  onMouseEnter={() => setHighlightLineType('closed')}
                  onMouseLeave={() => setHighlightLineType(null)}
                  className={`p-2 rounded-xl transition border ${
                    highlightLineType === 'closed'
                      ? 'bg-red-950/60 border-red-500/60'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-8 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] border border-red-300 shrink-0"></span>
                    <span className="font-bold text-red-400 text-xs flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      Red Line — Closed / Flooded / Impassable
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed pl-10">
                    <span className="text-white font-medium">Submerged or Barricaded</span> (depth &ge; 0.20m). High risk of drowning or vehicle stalling. Strictly closed to civilian traffic.
                  </p>
                </div>

                {/* Stairs Line */}
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-8 h-1.5 border-b-2 border-dashed border-amber-300 shrink-0"></span>
                    <span className="font-bold text-amber-200 text-xs flex items-center gap-1">
                      <Footprints className="w-3.5 h-3.5 text-amber-300" />
                      Dashed Gold + &quot;STAIRS&quot; — Pedestrian Steps
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed pl-10">
                    Steep stone stairway ascending Hilltop Plateau. <span className="text-amber-300 font-semibold">Pedestrians only</span>. Inaccessible for wheelchairs and motor vehicles.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Evacuation Routes */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Calculated Evacuation Paths
              </div>
              <div className="space-y-2">
                {/* Glowing Cyan Primary Route */}
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-8 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#38bdf8] shrink-0"></span>
                    <span className="font-bold text-cyan-300 text-xs flex items-center gap-1">
                      <Navigation className="w-3.5 h-3.5" />
                      Glowing Cyan Path — Primary Safe Route
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed pl-10">
                    SafeRoute&apos;s real-time optimal evacuation route. Dynamically maneuvers around flooded road closures and respects selected mobility profile (Wheelchair / Walk / Vehicle).
                  </p>
                </div>

                {/* Purple Dashed Alternative Route */}
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-8 h-1 border-b-2 border-dashed border-purple-400 shrink-0"></span>
                    <span className="font-bold text-purple-300 text-xs">
                      Dashed Violet — Alternative Route
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed pl-10">
                    Secondary backup trajectory to avoid bottlenecks or allow multi-column civilian dispersal.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: River Crossings & Water Zones */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Bridges, Channels &amp; Flood Inundation
              </div>
              <div className="space-y-2 text-[11px]">
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-2 font-semibold text-slate-200 mb-0.5">
                    <span className="w-3 h-3 rounded bg-sky-500/80 border border-sky-300 shrink-0"></span>
                    <span>North Bridge (Elevated Highway Span)</span>
                  </div>
                  <p className="text-slate-400 pl-5">
                    High-clearance bridge spanning the river. <span className="text-emerald-400 font-semibold">Remains dry and safe</span> throughout all 90 minutes of the flood surge.
                  </p>
                </div>

                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-2 font-semibold text-slate-200 mb-0.5">
                    <span className="w-3 h-3 rounded bg-red-500/80 border border-red-300 shrink-0"></span>
                    <span>South Bridge (Submersible Underpass)</span>
                  </div>
                  <p className="text-slate-400 pl-5">
                    Low elevation river crossing. Submerges and becomes <span className="text-red-400 font-semibold">fully impassable (closed) at T+30m</span> as river waters crest.
                  </p>
                </div>

                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-2 font-semibold text-slate-200 mb-0.5">
                    <span className="w-3 h-3 rounded bg-sky-500/40 border border-sky-400 shrink-0"></span>
                    <span>Dynamic Flood Surge Polygons</span>
                  </div>
                  <p className="text-slate-400 pl-5">
                    Pulsing blue water boundaries indicating overflowing riverbanks inundating low-lying southern and downtown districts.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 4: Nodes & Markers */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Assembly Origins &amp; Emergency Shelters
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300 mb-1">
                    <span className="w-3 h-3 rounded-full bg-amber-500 border border-amber-200"></span>
                    <span>Muster Point</span>
                  </div>
                  <p className="text-slate-400 text-[10px]">
                    Civilian gathering point with population count needing evacuation.
                  </p>
                </div>

                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-1.5 font-bold text-blue-300 mb-1">
                    <span className="w-3 h-3 rounded bg-blue-600 border border-blue-300"></span>
                    <span>Shelter (Open)</span>
                  </div>
                  <p className="text-slate-400 text-[10px]">
                    Emergency refuge with beds, power, water, and available capacity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main SVG Map Canvas */}
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-full transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        <defs>
          {/* River Water Gradient */}
          <linearGradient id="riverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0369a1" stopOpacity="0.85" />
            <stop offset="45%" stopColor="#0284c7" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0.95" />
          </linearGradient>

          {/* Organic Flood Water Radial Gradient */}
          <radialGradient id="floodGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#0369a1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.05" />
          </radialGradient>

          {/* Tactical Grid Pattern */}
          <pattern id="tacticalGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.75" strokeOpacity="0.35" />
          </pattern>

          {/* Active Safe Route Glow Filters */}
          <filter id="routeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Badge Drop Shadow */}
          <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.7" />
          </filter>
        </defs>

        {/* Tactical Grid Background */}
        <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#tacticalGrid)" />

        {/* East Bank & West Bank Land Backgrounds */}
        <rect
          x="45"
          y="40"
          width="415"
          height="720"
          rx="24"
          fill="#060c18"
          stroke="#1e293b"
          strokeWidth="1.5"
          strokeDasharray="4,4"
        />
        <rect
          x="540"
          y="40"
          width="415"
          height="720"
          rx="24"
          fill="#060c18"
          stroke="#1e293b"
          strokeWidth="1.5"
          strokeDasharray="4,4"
        />

        {/* District Labels */}
        <text x="120" y="70" fill="#64748b" fontSize="12" fontWeight="bold" fontFamily="monospace" letterSpacing="2">
          EAST BANK &bull; DOWNTOWN &amp; RESIDENTIAL
        </text>
        <text x="610" y="70" fill="#64748b" fontSize="12" fontWeight="bold" fontFamily="monospace" letterSpacing="2">
          WEST BANK &bull; HIGHER ELEVATION RIDGE
        </text>

        {/* Hilltop Elevation Contour Rings (Around N12) */}
        {(() => {
          const [cx, cy] = project(74.8850, 31.6360);
          return (
            <g opacity="0.35">
              <circle cx={cx} cy={cy} r="85" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={cx} cy={cy} r="55" fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="2,2" />
              <circle cx={cx} cy={cy} r="30" fill="#1e293b" stroke="#64748b" strokeWidth="1.2" />
              <text x={cx - 40} y={cy - 60} fill="#64748b" fontSize="9" fontFamily="monospace" fontWeight="bold">
                ELEVATION +140m
              </text>
            </g>
          );
        })()}

        {/* Central River Channel */}
        <path d={riverPath} fill="url(#riverGradient)" stroke="#0284c7" strokeWidth="2.5" />

        {/* River Water Flow Texture */}
        <path
          d={`M ${project(74.8758, 31.643)[0]} ${project(74.8758, 31.643)[1]} Q ${project(74.8762, 31.635)[0]} ${project(74.8762, 31.635)[1]} ${project(74.8752, 31.626)[0]} ${project(74.8752, 31.626)[1]}`}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2"
          strokeDasharray="14,18"
          opacity="0.5"
        />

        {/* Horizontal River Identification Label */}
        <g transform={`translate(${project(74.8760, 31.6275)[0]}, ${project(74.8760, 31.6275)[1]})`}>
          <rect x="-65" y="-12" width="130" height="22" rx="5" fill="#032b43" stroke="#0284c7" strokeWidth="1" opacity="0.9" />
          <text x="0" y="3" fill="#7dd3fc" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle" letterSpacing="1">
            RIVERDALE CHANNEL
          </text>
        </g>

        {/* Dynamic Flood Inundation Zones - Rounded with organic water appearance */}
        {floodFeatures.map((feat: any, idx: number) => {
          const geom = feat.geometry as any;
          if (!geom || !geom.coordinates) return null;
          const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates;
          if (!coords || coords.length === 0) return null;

          const pathD = coords
            .map(([lon, lat]: [number, number], i: number) => {
              const [px, py] = project(lon, lat);
              return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
            })
            .join(' ') + ' Z';

          return (
            <g key={`flood-${idx}`}>
              <path
                d={pathD}
                fill="url(#floodGlow)"
                stroke="#0284c7"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeOpacity="0.7"
                className="animate-pulse"
              />
              {/* Tactical Flood Warning Tag */}
              {idx === 0 && (
                <g transform={`translate(${project(74.8760, 31.6300)[0]}, ${project(74.8760, 31.6300)[1]})`}>
                  <rect x="-70" y="-10" width="140" height="20" rx="4" fill="#082f49" stroke="#38bdf8" strokeWidth="1" opacity="0.95" />
                  <text x="0" y="4" fill="#38bdf8" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    FLOOD SURGE (+0.35m)
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Road Network Lines Layer (Except Bridges) */}
        {edgesFeatures.map((feat: any) => {
          const props = feat.properties as any;
          const geom = feat.geometry as any;
          if (!geom || !geom.coordinates || geom.coordinates.length < 2) return null;

          const edgeId = props.id || props.edge_id;
          const status = props.status || 'normal';
          const isClosed = !props.is_open || status === 'closed';
          const isCaution = status === 'caution';
          const hasStairs = Boolean(props.has_stairs);

          const points = geom.coordinates.map(([lon, lat]: [number, number]) => project(lon, lat));
          const pathD = points
            .map(([x, y]: [number, number], i: number) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`)
            .join(' ');

          const strokeColor = isClosed ? '#ef4444' : isCaution ? '#f59e0b' : '#10b981';

          return (
            <g
              key={edgeId}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEdge(props);
                onEdgeClick?.(edgeId);
              }}
              className="cursor-pointer group"
            >
              {/* Invisible wide stroke for easy clicking */}
              <path d={pathD} fill="none" stroke="transparent" strokeWidth="22" />

              {/* Road Casing */}
              <path d={pathD} fill="none" stroke="#020617" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

              {/* Road Core Line */}
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isClosed ? 4.5 : 5.5}
                strokeDasharray={hasStairs ? '4,4' : isClosed ? '5,3' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="group-hover:stroke-white transition-colors duration-150"
              />

              {/* Stairs Marker */}
              {hasStairs && (
                <g transform={`translate(${(points[0][0] + points[1][0]) / 2 + 12}, ${(points[0][1] + points[1][1]) / 2 - 10})`}>
                  <rect x="-24" y="-8" width="48" height="16" rx="4" fill="#090e1a" stroke="#fcd34d" strokeWidth="1" />
                  <text x="0" y="4" fill="#fcd34d" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    STAIRS
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Bridges Visual Decks */}
        {/* 1. North Bridge Structure (Elevated concrete highway, safe throughout) */}
        <g>
          {/* Bridge Shadow */}
          <line
            x1={northBridgeStart[0]}
            y1={northBridgeStart[1] + 3}
            x2={northBridgeEnd[0]}
            y2={northBridgeEnd[1] + 3}
            stroke="#000000"
            strokeWidth="16"
            strokeLinecap="round"
            opacity="0.6"
          />
          {/* Concrete Deck */}
          <line
            x1={northBridgeStart[0]}
            y1={northBridgeStart[1]}
            x2={northBridgeEnd[0]}
            y2={northBridgeEnd[1]}
            stroke="#0f172a"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Road Surface */}
          <line
            x1={northBridgeStart[0]}
            y1={northBridgeStart[1]}
            x2={northBridgeEnd[0]}
            y2={northBridgeEnd[1]}
            stroke="#10b981"
            strokeWidth="6"
            strokeDasharray="8,6"
          />
          {/* North Bridge Label Badge */}
          <g transform={`translate(${(northBridgeStart[0] + northBridgeEnd[0]) / 2}, ${northBridgeStart[1] - 18})`} filter="url(#badgeShadow)">
            <rect x="-65" y="-12" width="130" height="24" rx="6" fill="#090e1a" stroke="#10b981" strokeWidth="1.5" />
            <text x="0" y="3" fill="#a7f3d0" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
              NORTH BRIDGE [ELEVATED]
            </text>
          </g>
        </g>

        {/* 2. South Bridge Structure (Low causeway, submerges at T+30) */}
        <g>
          {/* Bridge Casing */}
          <line
            x1={southBridgeStart[0]}
            y1={southBridgeStart[1]}
            x2={southBridgeEnd[0]}
            y2={southBridgeEnd[1]}
            stroke="#0f172a"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Deck Surface */}
          <line
            x1={southBridgeStart[0]}
            y1={southBridgeStart[1]}
            x2={southBridgeEnd[0]}
            y2={southBridgeEnd[1]}
            stroke={isSouthBridgeFlooded ? '#ef4444' : '#f59e0b'}
            strokeWidth="6"
            strokeDasharray={isSouthBridgeFlooded ? '3,3' : '6,4'}
          />

          {/* Flooded Water Wave Overlay on Submerged Bridge */}
          {isSouthBridgeFlooded && (
            <circle
              cx={(southBridgeStart[0] + southBridgeEnd[0]) / 2}
              cy={(southBridgeStart[1] + southBridgeEnd[1]) / 2}
              r="22"
              fill="rgba(239, 68, 68, 0.4)"
              stroke="#ef4444"
              strokeWidth="2"
              className="animate-ping"
            />
          )}

          {/* South Bridge Status Label Badge */}
          <g transform={`translate(${(southBridgeStart[0] + southBridgeEnd[0]) / 2}, ${southBridgeStart[1] - 18})`} filter="url(#badgeShadow)">
            <rect
              x="-75"
              y="-12"
              width="150"
              height="24"
              rx="6"
              fill="#090e1a"
              stroke={isSouthBridgeFlooded ? '#ef4444' : '#f59e0b'}
              strokeWidth="1.5"
            />
            <text
              x="0"
              y="3"
              fill={isSouthBridgeFlooded ? '#fca5a5' : '#fde68a'}
              fontSize="9"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {isSouthBridgeFlooded ? 'SOUTH BRIDGE [SUBMERGED]' : 'SOUTH BRIDGE [LOW CAUSEWAY]'}
            </text>
          </g>
        </g>

        {/* Alternative Route Overlay (Dashed purple) */}
        {altRoutePath && (
          <path
            d={altRoutePath}
            fill="none"
            stroke="#c084fc"
            strokeWidth="7"
            strokeDasharray="8,6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Primary Safe Route Overlay (Glowing animated cyan line) */}
        {primaryRoutePath && (
          <g filter="url(#routeGlow)">
            {/* Glowing wide underlayer */}
            <path
              d={primaryRoutePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="14"
              strokeOpacity="0.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Crisp primary line with directional animation */}
            <path
              d={primaryRoutePath}
              fill="none"
              stroke="#0284c7"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dashed Animated Flow Indicator */}
            <path
              d={primaryRoutePath}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeDasharray="6,14"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
          </g>
        )}

        {/* Origin Muster Zones Markers (Rendered on top of roads with padded cards) */}
        {origins.map((orig) => {
          const [ox, oy] = project(orig.lon, orig.lat);
          
          // Non-colliding label placement offsets
          let lx = 0;
          let ly = -32;
          if (orig.id === 'origin_north') {
            lx = -85;
            ly = -25;
          } else if (orig.id === 'origin_east') {
            lx = -90;
            ly = 0;
          } else if (orig.id === 'origin_central') {
            lx = -90;
            ly = 15;
          }

          return (
            <g key={orig.id} transform={`translate(${ox}, ${oy})`} className="select-none">
              <circle r="18" fill="rgba(245, 158, 11, 0.2)" className="animate-ping" />
              <circle r="11" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />
              <circle r="4" fill="#090e1a" />

              {/* Origin Badge Card */}
              <g transform={`translate(${lx}, ${ly})`} filter="url(#badgeShadow)">
                <rect
                  x="-65"
                  y="-16"
                  width="130"
                  height="32"
                  rx="7"
                  fill="#090e1a"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <text x="0" y="-2" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                  {orig.name}
                </text>
                <text x="0" y="10" fill="#fde68a" fontSize="8.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  Pop: {orig.population} evacuees
                </text>
              </g>
            </g>
          );
        })}

        {/* Emergency Shelter Markers (Rendered on top of roads and route lines with padded cards) */}
        {shelters.map((shelter) => {
          const [sx, sy] = project(shelter.lon, shelter.lat);
          const isFull = shelter.status?.toLowerCase() === 'full' || (shelter.occupancy || 0) >= (shelter.capacity || 1);
          const badgeColor = isFull ? '#ef4444' : '#2563eb';

          // Non-colliding label offsets so roads and text NEVER collide
          let lx = 0;
          let ly = -42;
          if (shelter.id === 'shelter_east_center') {
            lx = 50;
            ly = -18;
          } else if (shelter.id === 'shelter_south_stadium') {
            lx = 20;
            ly = 32;
          } else if (shelter.id === 'shelter_west_high') {
            lx = 0;
            ly = -44;
          } else if (shelter.id === 'shelter_hill_station') {
            lx = 45;
            ly = 0;
          }

          return (
            <g
              key={shelter.id}
              transform={`translate(${sx}, ${sy})`}
              onClick={(e) => {
                e.stopPropagation();
                onShelterClick?.(shelter.id);
              }}
              className="cursor-pointer group"
            >
              {/* Outer Pulse Ring */}
              <circle r="16" fill={isFull ? 'rgba(239, 68, 68, 0.25)' : 'rgba(37, 99, 235, 0.25)'} />
              
              {/* Shelter Icon Box */}
              <rect
                x="-11"
                y="-11"
                width="22"
                height="22"
                rx="5"
                fill={badgeColor}
                stroke="#ffffff"
                strokeWidth="2"
                className="group-hover:scale-110 transition-transform"
              />
              
              {/* Shelter Cross Icon */}
              <path d="M -5 0 L 5 0 M 0 -5 L 0 5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />

              {/* Shelter Title & Occupancy Pill Card (With opaque dark mask and drop shadow) */}
              <g transform={`translate(${lx}, ${ly})`} filter="url(#badgeShadow)">
                <rect
                  x="-80"
                  y="-18"
                  width="160"
                  height="36"
                  rx="8"
                  fill="#090e1a"
                  stroke={badgeColor}
                  strokeWidth="1.8"
                  className="group-hover:stroke-cyan-400 transition-colors"
                />
                <text x="0" y="-3" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                  {shelter.name}
                </text>
                <text
                  x="0"
                  y="11"
                  fill={isFull ? '#fca5a5' : '#93c5fd'}
                  fontSize="9"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {shelter.occupancy || 0}/{shelter.capacity} {isFull ? '[FULL - REDIRECT]' : '[OPEN - HAS ROOM]'}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* 4. Selected Edge Inspection Popup Card */}
      {selectedEdge && (
        <div className="absolute top-14 left-3 z-30 bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-4 text-xs text-slate-100 shadow-2xl backdrop-blur-xl max-w-[300px] animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-slate-800 text-cyan-400">
                <Info className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-cyan-300 font-mono text-xs">{selectedEdge.id || selectedEdge.edge_id}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEdge(null)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span
                className={`font-bold uppercase ${
                  selectedEdge.status === 'closed'
                    ? 'text-red-400'
                    : selectedEdge.status === 'caution'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {selectedEdge.status || 'normal'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Flood Depth:</span>
              <span className="font-bold text-white">
                {selectedEdge.flood_depth_m !== undefined ? `${Number(selectedEdge.flood_depth_m).toFixed(2)} m` : '0.00 m'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Travel Time:</span>
              <span className="font-bold text-white">
                {selectedEdge.travel_time_s !== undefined ? `${Math.round(Number(selectedEdge.travel_time_s))} s` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Congestion Ratio:</span>
              <span className="font-bold text-white">
                {selectedEdge.congestion_ratio !== undefined ? `${Math.round(Number(selectedEdge.congestion_ratio) * 100)}%` : '0%'}
              </span>
            </div>
            {selectedEdge.has_stairs && (
              <div className="mt-2 p-2 rounded-lg bg-amber-950/70 border border-amber-600/50 text-amber-300 font-sans text-[10px]">
                Stairs present: Inaccessible for wheelchair and vehicular routing.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulatedCityCanvas;
