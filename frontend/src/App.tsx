import { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Navigation,
  Home,
  Radio,
  Wifi,
} from 'lucide-react';
import { api } from './api/client';
import { FALLBACK_TIMELINE } from './data/offlineFallback';
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
      const res = await api.assignEvacuation(currentMinute, 'walk');
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
      try {
        await fetchTimelineData();
      } catch {
        // Keep local state
      }
    } catch (err) {
      console.error('Crowd assignment failed:', err);
    } finally {
      setBatchLoading(false);
    }
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
    try {
      await api.resetScenario('monsoon_demo');
      await fetchTimelineData();
    } catch (err) {
      console.warn('Reset call fallback:', err);
    }
  };

  return (
    <div className="flex h-screen w-screen select-none flex-col overflow-hidden bg-[#071a1e] text-slate-100">
      <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#18383b] bg-[#0b2428] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-400/20 bg-teal-500/10 text-teal-300">
            <ShieldAlert className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-wide text-white">SafeRoute</h1>
            <p className="hidden truncate text-[11px] text-slate-400 sm:block">
              Monsoon response <span className="px-1 text-slate-600">/</span> Evacuation planning
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-md border border-[#285256] bg-[#102d31] px-2.5 py-1.5 text-[11px] font-medium text-teal-200 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            <span>Scenario simulation</span>
          </div>

          {backendOnline && (
            <div className="hidden items-center gap-1.5 rounded-md border border-emerald-800/50 bg-emerald-950/30 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 lg:flex">
              <Wifi className="h-3 w-3" />
              <span>API online</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsAuthorityOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-teal-500/30 bg-[#123438] px-3 py-2 text-xs font-semibold text-teal-200 transition hover:border-teal-400/60 hover:bg-[#19464a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b2428]"
          >
            <Radio className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Authority console</span>
            <span className="sm:hidden">Console</span>
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <section className="relative flex h-[54%] min-h-0 w-full flex-none flex-col md:h-full md:flex-1">
          <div className="z-10 shrink-0 border-b border-[#18383b]/80 bg-[#071a1e]/90 p-2.5 backdrop-blur">
            <KpiStrip metrics={currentSnapshot?.metrics || null} minute={currentMinute} />
          </div>

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

          <div className="pointer-events-auto absolute bottom-3 left-4 right-4 z-20 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:-translate-x-1/2">
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
        </section>

        <aside className="z-10 flex h-[46%] w-full shrink-0 flex-col border-t border-[#18383b] bg-[#091f23] shadow-2xl md:h-auto md:w-80 md:border-l md:border-t-0 lg:w-96">
          <div className="flex border-b border-[#18383b] bg-[#0b2428]/80 p-1.5">
            <button
              type="button"
              onClick={() => setActiveSidebarTab('routes')}
              aria-pressed={activeSidebarTab === 'routes'}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                activeSidebarTab === 'routes'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              <span>Safe Routes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSidebarTab('shelters')}
              aria-pressed={activeSidebarTab === 'shelters'}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                activeSidebarTab === 'shelters'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              <span>Shelters</span>
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
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
      </main>

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
