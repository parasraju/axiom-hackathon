import { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Navigation,
  Home,
  Radio,
  Wifi,
} from 'lucide-react';
import { api, apiFetch } from './api/client';
import {
  FALLBACK_TIMELINE,
  BASELINE_SHELTERS,
  OVERFLOW_SHELTER,
  offlineAssignEvacuation,
} from './data/offlineFallback';
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
  // Timeline and simulation state - initialized with FALLBACK_TIMELINE for immediate render
  const [timeline, setTimeline] = useState<ScenarioSnapshot[]>(() => FALLBACK_TIMELINE);
  const [currentMinute, setCurrentMinute] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [, setLoading] = useState<boolean>(false);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);

  // Routing state
  const [activeRoutePlan, setActiveRoutePlan] = useState<{
    originId: string;
    destId: string;
    mode: MobilityProfile;
  } | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteCandidate | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<RouteCandidate | null>(null);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);

  // Shelter & Evacuation state
  const [batchLoading, setBatchLoading] = useState<boolean>(false);
  const [isOverflowActive, setIsOverflowActive] = useState<boolean>(false);
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
      if (Array.isArray(data) && data.length > 0) {
        setTimeline(data);
      }
      setBackendOnline(true);
    } catch (err) {
      console.warn('Backend unavailable, operating in offline simulation mode:', err);
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimelineData();
  }, []);

  // Periodic health check to auto-reconnect when backend comes online
  useEffect(() => {
    const healthInterval = setInterval(async () => {
      try {
        await api.getHealth();
        if (!backendOnline) {
          setBackendOnline(true);
          await fetchTimelineData();
        }
      } catch {
        if (backendOnline) setBackendOnline(false);
      }
    }, 6000);

    return () => clearInterval(healthInterval);
  }, [backendOnline]);

  // Current active snapshot from cached timeline
  const currentSnapshot: ScenarioSnapshot | null =
    timeline.find((s) => s.minute === currentMinute) ||
    (timeline.length > 0 ? timeline[0] : FALLBACK_TIMELINE[0]);

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

  // Route calculation handler
  const handlePlanRoute = async (
    originId: string,
    destId: string,
    mode: MobilityProfile,
    showSpinner = true
  ) => {
    try {
      setActiveRoutePlan({ originId, destId, mode });
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

  // When current minute changes, re-plan active route using the preserved selection & mode
  useEffect(() => {
    if (activeRoutePlan) {
      handlePlanRoute(
        activeRoutePlan.originId,
        activeRoutePlan.destId,
        activeRoutePlan.mode,
        false
      );
    }
  }, [currentMinute]);

  const handleClearRoute = () => {
    setActiveRoutePlan(null);
    setRouteResult(null);
    setSelectedRoute(null);
    setSelectedAlternative(null);
  };

  // Batch crowd assignment handler
  const handleRunBatchEvacuation = async () => {
    try {
      setBatchLoading(true);
      const res = await api.assignEvacuation(currentMinute, 'walk', {
        overflowActive: isOverflowActive,
      });
      if (res && res.shelter_allocations) {
        setTimeline((prev) =>
          prev.map((snap) => ({
            ...snap,
            shelters: (snap.shelters || []).map((s) => {
              const alloc = res.shelter_allocations.find((a: any) => a.shelter_id === s.id);
              if (alloc) {
                return {
                  ...s,
                  occupancy: Number(alloc.final_occupancy ?? alloc.assigned_count ?? s.occupancy),
                  status: (alloc.status === 'closed' ? 'closed' : alloc.status === 'full' ? 'full' : 'open') as 'open' | 'full' | 'closed',
                };
              }
              return s;
            }),
            metrics: {
              ...snap.metrics,
              assigned_count: res.total_assigned,
              unassigned_count: res.total_unassigned,
              total_evacuees: res.total_evacuees,
            },
          }))
        );
      }
    } catch (err) {
      console.error('Crowd assignment failed:', err);
    } finally {
      setBatchLoading(false);
    }
  };

  // Reset crowd back to 0 evacuees (empty shelters)
  const handleResetCrowd = async () => {
    setIsOverflowActive(false);
    setTimeline((prev) =>
      prev.map((snap) => ({
        ...snap,
        shelters: BASELINE_SHELTERS.map((s) => ({
          ...s,
          occupancy: 0,
          status: 'open' as const,
        })),
        metrics: {
          ...snap.metrics,
          assigned_count: 0,
          unassigned_count: snap.metrics?.total_evacuees || 1250,
        },
      }))
    );
    try {
      await apiFetch('/shelters/reset', { method: 'POST' });
    } catch {
      // Keep local state
    }
  };

  // Test "All Shelters Full" surge scenario (100% capacity)
  const handleSimulateAllFull = () => {
    setIsOverflowActive(false);
    const fullAlloc = offlineAssignEvacuation(currentMinute, { forceAllFull: true });
    setTimeline((prev) =>
      prev.map((snap) => ({
        ...snap,
        shelters: (snap.shelters || []).map((s) => ({
          ...s,
          occupancy: s.capacity,
          status: 'full' as const,
        })),
        metrics: {
          ...snap.metrics,
          assigned_count: fullAlloc.total_assigned,
          unassigned_count: fullAlloc.total_unassigned,
          total_evacuees: fullAlloc.total_evacuees,
        },
      }))
    );
  };

  // Activate Regional Airport Mutual Aid Overflow Camp (+500 capacity)
  const handleActivateOverflow = () => {
    setIsOverflowActive(true);
    setTimeline((prev) =>
      prev.map((snap) => {
        const hasOverflow = (snap.shelters || []).some((s) => s.id === OVERFLOW_SHELTER.id);
        const updatedShelters = hasOverflow
          ? snap.shelters
          : [...(snap.shelters || []), OVERFLOW_SHELTER];
        return {
          ...snap,
          shelters: updatedShelters,
        };
      })
    );
  };

  // Road closure override handler
  const handleToggleClosure = async (edgeId: string, isOpen: boolean) => {
    // Immediately update local state in timeline
    setTimeline((prev) =>
      prev.map((snap) => ({
        ...snap,
        edges_geojson: {
          ...snap.edges_geojson,
          features: snap.edges_geojson.features.map((feat: any) => {
            const fId = feat.properties.id || feat.properties.edge_id;
            if (fId === edgeId) {
              return {
                ...feat,
                properties: {
                  ...feat.properties,
                  is_open: isOpen,
                  status: isOpen ? 'normal' : 'closed',
                },
              };
            }
            return feat;
          }),
        },
      }))
    );

    try {
      await api.toggleRoadClosure(edgeId, isOpen);
      await fetchTimelineData();
    } catch (err) {
      console.warn('Backend toggle offline, using local state:', err);
    }
  };

  // Submit citizen hazard report
  const handleSubmitReport = async (edgeId: string, kind: string, desc: string) => {
    const localRep: IncidentReport = {
      id: `rep_${Date.now()}`,
      edge_id: edgeId,
      kind,
      reported_minute: currentMinute,
      description: desc,
      reporter_hash: 'citizen_web',
      status: 'pending',
      verification_score: 0.85,
      evidence_count: 1,
    };

    setIncidentReports((prev) => [localRep, ...prev]);

    try {
      const rep = await api.submitIncidentReport({
        edge_id: edgeId,
        kind,
        reported_minute: currentMinute,
        description: desc,
      });
      setIncidentReports((prev) => [rep, ...prev.filter((r) => r.id !== localRep.id)]);
      await fetchTimelineData();
    } catch (err) {
      console.warn('Report submitted in local offline mode:', err);
    }
  };

  // Review report
  const handleReviewReport = async (reportId: string, decision: 'verify' | 'reject') => {
    setIncidentReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? {
              ...r,
              status: decision === 'verify' ? 'verified' : 'rejected',
            }
          : r
      )
    );

    try {
      await api.reviewReport(reportId, decision);
      await fetchTimelineData();
    } catch (err) {
      console.warn('Report reviewed in local offline mode:', err);
    }
  };


  const handleReset = async () => {
    setIsPlaying(false);
    setCurrentMinute(0);
    setIsOverflowActive(false);
    try {
      await api.resetScenario('monsoon_demo');
      await fetchTimelineData();
    } catch (err) {
      console.warn('Reset call fallback:', err);
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
              Disaster-Aware Evacuation Simulator &amp; Safety-Constrained Navigation
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Standalone Simulated Engine Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs bg-slate-800/90 border-cyan-500/30 text-cyan-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-[11px] font-semibold hidden sm:inline">Simulated Engine (Zero API)</span>
            <span className="text-[11px] font-semibold sm:hidden">Simulated</span>
          </div>

          {/* Optional live sync indicator */}
          {backendOnline && (
            <div className="hidden lg:flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full font-mono">
              <Wifi className="w-3 h-3" />
              <span>Backend Synced</span>
            </div>
          )}


          {/* Authority Command Console Toggle */}
          <button
            type="button"
            onClick={() => setIsAuthorityOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 hover:border-blue-400 shadow transition cursor-pointer"
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
          {/* Top Compact KPI Ribbon */}
          <div className="p-2.5 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur shrink-0 z-10">
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

          {/* Floating Scrubbable Time Slider - Compact, Centered, Non-blocking */}
          <div className="absolute bottom-3 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[calc(100%-2rem)] sm:max-w-3xl z-20 pointer-events-auto">
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
              type="button"
              onClick={() => setActiveSidebarTab('routes')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                activeSidebarTab === 'routes'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Safe Routes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSidebarTab('shelters')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
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
                onClearRoute={handleClearRoute}
                onActivateOverflow={handleActivateOverflow}
                isOverflowActive={isOverflowActive}
              />
            ) : (
              <ShelterPanel
                shelters={currentSnapshot?.shelters || []}
                onRunBatchEvacuation={handleRunBatchEvacuation}
                batchLoading={batchLoading}
                onResetCrowd={handleResetCrowd}
                onSimulateAllFull={handleSimulateAllFull}
                onActivateOverflow={handleActivateOverflow}
                isOverflowActive={isOverflowActive}
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
