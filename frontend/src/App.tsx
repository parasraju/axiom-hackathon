import { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Navigation,
  Home,
  Radio,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from './api/client';
import type {
  ScenarioSnapshot,
  RouteResponse,
  RouteCandidate,
  MobilityProfile,
  IncidentReport,
} from './types';

import { MapCanvas } from './components/MapCanvas';
import { TimeSlider } from './components/TimeSlider';
import { KpiStrip } from './components/KpiStrip';
import { RoutePlanner } from './components/RoutePlanner';
import { ShelterPanel } from './components/ShelterPanel';
import { AuthorityModal } from './components/AuthorityModal';

export function App() {
  // Timeline and simulation state
  const [timeline, setTimeline] = useState<ScenarioSnapshot[]>([]);
  const [currentMinute, setCurrentMinute] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [, setLoading] = useState<boolean>(true);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);

  // Routing state
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteCandidate | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<RouteCandidate | null>(null);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);

  // Shelter & Evacuation state
  const [batchLoading, setBatchLoading] = useState<boolean>(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'routes' | 'shelters'>('routes');

  // Authority modal state
  const [isAuthorityOpen, setIsAuthorityOpen] = useState<boolean>(false);
  const [incidentReports, setIncidentReports] = useState<IncidentReport[]>([]);

  // Timer reference for playback
  const playbackRef = useRef<number | null>(null);

  // Load timeline on mount
  const fetchTimelineData = async () => {
    try {
      setLoading(true);
      const data = await api.getTimeline('monsoon_demo');
      setTimeline(data);
      setBackendOnline(true);
    } catch (err) {
      console.warn('Backend unavailable, using initial snapshot fallback:', err);
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimelineData();
  }, []);

  // Current active snapshot from cached timeline
  const currentSnapshot: ScenarioSnapshot | null =
    timeline.find((s) => s.minute === currentMinute) ||
    (timeline.length > 0 ? timeline[0] : null);

  // Playback timer effect
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(800, 2500 / playbackSpeed);
      playbackRef.current = window.setInterval(() => {
        setCurrentMinute((prev) => {
          const next = prev + 15;
          if (next > 90) {
            setIsPlaying(false);
            return 90;
          }
          return next;
        });
      }, intervalMs);
    } else if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }

    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [isPlaying, playbackSpeed]);

  // When current minute changes, re-plan active route to reflect new flood/congestion state
  useEffect(() => {
    if (routeResult && routeResult.status === 'route_found' && routeResult.primary_route) {
      const nodes = routeResult.primary_route.path_nodes;
      if (nodes.length >= 2) {
        handlePlanRoute(nodes[0], nodes[nodes.length - 1], 'walk', false);
      }
    }
  }, [currentMinute]);

  // Route calculation handler
  const handlePlanRoute = async (
    originId: string,
    destId: string,
    mode: MobilityProfile,
    showSpinner = true
  ) => {
    try {
      if (showSpinner) setRouteLoading(true);
      const res = await api.planRoute({
        origin_id: originId,
        destination_id: destId,
        departure_minute: currentMinute,
        mode,
        alternatives: 2,
      });
      setRouteResult(res);
      if (res.primary_route) {
        setSelectedRoute(res.primary_route);
        setSelectedAlternative(res.alternatives?.[0] || null);
      } else {
        setSelectedRoute(null);
        setSelectedAlternative(null);
      }
    } catch (err) {
      console.error('Route calculation failed:', err);
    } finally {
      if (showSpinner) setRouteLoading(false);
    }
  };

  // Batch crowd assignment handler
  const handleRunBatchEvacuation = async () => {
    try {
      setBatchLoading(true);
      await api.assignEvacuation(currentMinute, 'walk');
      // Refresh timeline from backend to reflect updated occupancy
      await fetchTimelineData();
    } catch (err) {
      console.error('Crowd assignment failed:', err);
    } finally {
      setBatchLoading(false);
    }
  };

  // Road closure override handler
  const handleToggleClosure = async (edgeId: string, isOpen: boolean) => {
    try {
      await api.toggleRoadClosure(edgeId, isOpen);
      await fetchTimelineData();
    } catch (err) {
      console.error('Closure toggle failed:', err);
    }
  };

  // Submit citizen hazard report
  const handleSubmitReport = async (edgeId: string, kind: string, desc: string) => {
    try {
      const rep = await api.submitIncidentReport({
        edge_id: edgeId,
        kind,
        reported_minute: currentMinute,
        description: desc,
      });
      setIncidentReports((prev) => [rep, ...prev]);
      await fetchTimelineData();
    } catch (err) {
      console.error('Report submission failed:', err);
    }
  };

  // Review report
  const handleReviewReport = async (reportId: string, decision: 'verify' | 'reject') => {
    try {
      await api.reviewReport(reportId, decision);
      await fetchTimelineData();
    } catch (err) {
      console.error('Report review failed:', err);
    }
  };

  const handleReset = async () => {
    setIsPlaying(false);
    setCurrentMinute(0);
    try {
      await api.resetScenario('monsoon_demo');
      await fetchTimelineData();
    } catch (err) {
      console.warn('Reset call failed:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* 1. App Top Navigation Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shadow-md shadow-blue-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm text-white tracking-wide">SafeRoute</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono font-bold border border-blue-700/50">
                PROTOTYPE v1.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Disaster-Aware Evacuation Simulator & Safety-Constrained Navigation
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Connection Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">
            {backendOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] font-medium text-emerald-400 hidden sm:inline">Backend Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] font-medium text-amber-400 hidden sm:inline">Offline Mode</span>
              </>
            )}
          </div>

          {/* Authority Command Console Toggle */}
          <button
            onClick={() => setIsAuthorityOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 hover:border-blue-400 shadow transition"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Authority Console</span>
          </button>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Map & Time Slider Centerpiece */}
        <div className="flex-1 flex flex-col relative h-full">
          {/* Top KPI Ribbon */}
          <div className="p-3 bg-slate-950/70 border-b border-slate-800/80 backdrop-blur shrink-0 z-10">
            <KpiStrip metrics={currentSnapshot?.metrics || null} minute={currentMinute} />
          </div>

          {/* Interactive Map Canvas */}
          <div className="flex-1 relative">
            <MapCanvas
              snapshot={currentSnapshot}
              primaryRoute={selectedRoute}
              selectedAlternative={selectedAlternative}
              onShelterClick={() => {
                setActiveSidebarTab('shelters');
              }}
            />
          </div>

          {/* Floating Scrubbable Time Slider */}
          <div className="absolute bottom-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[580px] z-20 pointer-events-auto">
            <TimeSlider
              currentMinute={currentMinute}
              isPlaying={isPlaying}
              speed={playbackSpeed}
              onMinuteChange={(m) => setCurrentMinute(m)}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              onSpeedChange={(s) => setPlaybackSpeed(s)}
              onReset={handleReset}
            />
          </div>
        </div>

        {/* Right Sidebar Control Tabs */}
        <aside className="w-80 lg:w-96 border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 z-10 shadow-2xl">
          {/* Tab Selection */}
          <div className="flex border-b border-slate-800 bg-slate-900/60 p-1">
            <button
              onClick={() => setActiveSidebarTab('routes')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition ${
                activeSidebarTab === 'routes'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Safe Routes</span>
            </button>

            <button
              onClick={() => setActiveSidebarTab('shelters')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition ${
                activeSidebarTab === 'shelters'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Shelters</span>
            </button>
          </div>

          {/* Active Tab Panel */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {activeSidebarTab === 'routes' ? (
              <RoutePlanner
                origins={currentSnapshot?.origins || []}
                shelters={currentSnapshot?.shelters || []}
                currentMinute={currentMinute}
                onPlanRoute={handlePlanRoute}
                routeResult={routeResult}
                selectedRouteId={selectedRoute?.route_id || null}
                onSelectRoute={(candidate) => setSelectedRoute(candidate)}
                loading={routeLoading}
              />
            ) : (
              <ShelterPanel
                shelters={currentSnapshot?.shelters || []}
                onRunBatchEvacuation={handleRunBatchEvacuation}
                batchLoading={batchLoading}
              />
            )}
          </div>
        </aside>
      </div>

      {/* 3. Authority Modal */}
      <AuthorityModal
        isOpen={isAuthorityOpen}
        onClose={() => setIsAuthorityOpen(false)}
        onToggleClosure={handleToggleClosure}
        onSubmitReport={handleSubmitReport}
        reports={incidentReports}
        onReviewReport={handleReviewReport}
      />
    </div>
  );
}

export default App;
