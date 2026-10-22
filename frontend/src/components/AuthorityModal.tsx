import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Send,
  Radio,
  FileText,
  Ban,
  Check,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import type { IncidentReport } from '../types';

export interface AuthorityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleClosure: (edgeId: string, isOpen: boolean) => Promise<void>;
  onSubmitReport: (edgeId: string, kind: string, desc: string) => Promise<void>;
  reports: IncidentReport[];
  onReviewReport?: (reportId: string, decision: 'verify' | 'reject') => Promise<void>;
}

export const AuthorityModal: React.FC<AuthorityModalProps> = ({
  isOpen,
  onClose,
  onToggleClosure,
  onSubmitReport,
  reports,
  onReviewReport,
}) => {
  const [activeTab, setActiveTab] = useState<'closures' | 'reports'>('closures');
  const [customEdgeId, setCustomEdgeId] = useState('');
  const [closureLoadingEdge, setClosureLoadingEdge] = useState<string | null>(null);
  const [closureFeedback, setClosureFeedback] = useState<string | null>(null);

  // Form states for Citizen Incident Reports
  const [formEdgeId, setFormEdgeId] = useState('');
  const [formKind, setFormKind] = useState('road_flooded');
  const [formDesc, setFormDesc] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

  // Filter state for reports list
  const [reportsFilter, setReportsFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [reviewingReportId, setReviewingReportId] = useState<string | null>(null);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggle = async (edgeId: string, shouldOpen: boolean) => {
    const cleanId = edgeId.trim();
    if (!cleanId) return;

    setClosureLoadingEdge(cleanId);
    setClosureFeedback(null);
    try {
      await onToggleClosure(cleanId, shouldOpen);
      setClosureFeedback(`Successfully set ${cleanId} to ${shouldOpen ? 'OPEN' : 'CLOSED'}`);
      if (cleanId === customEdgeId.trim()) {
        setCustomEdgeId('');
      }
    } catch (err: any) {
      setClosureFeedback(`Error updating ${cleanId}: ${err?.message || 'Request failed'}`);
    } finally {
      setClosureLoadingEdge(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEdge = formEdgeId.trim();
    const cleanDesc = formDesc.trim();
    if (!cleanEdge) return;

    setFormSubmitting(true);
    setFormFeedback(null);
    try {
      await onSubmitReport(cleanEdge, formKind, cleanDesc);
      setFormFeedback(`Incident report submitted for ${cleanEdge}`);
      setFormDesc('');
      setFormEdgeId('');
    } catch (err: any) {
      setFormFeedback(`Failed to submit report: ${err?.message || 'Error'}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleReview = async (reportId: string, decision: 'verify' | 'reject') => {
    if (!onReviewReport) return;
    setReviewingReportId(reportId);
    try {
      await onReviewReport(reportId, decision);
    } finally {
      setReviewingReportId(null);
    }
  };

  const pendingCount = reports.filter((r) => r.status === 'pending').length;
  const verifiedCount = reports.filter((r) => r.status === 'verified').length;
  const rejectedCount = reports.filter((r) => r.status === 'rejected').length;

  const filteredReports = reports.filter((r) => {
    if (reportsFilter === 'all') return true;
    return r.status === reportsFilter;
  });

  const getKindLabel = (kind: string) => {
    switch (kind) {
      case 'road_flooded':
        return 'Road Flooded';
      case 'debris_blocked':
        return 'Debris Blocked';
      case 'bridge_closed':
        return 'Bridge Hazard';
      default:
        return kind.replace(/_/g, ' ');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Authority Command & Dispatch Operations
                </h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300 border border-blue-800/50">
                  EOC Override
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Manual road network control and citizen report corroboration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('closures')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'closures'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Road Closures Override</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Citizen Incident Reports</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'closures' ? (
            <div className="space-y-5">
              {closureFeedback && (
                <div className="p-3 rounded-lg bg-blue-950/50 border border-blue-800/60 text-xs text-blue-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span>{closureFeedback}</span>
                </div>
              )}

              {/* Quick Action Bridge Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Priority Infrastructure Overrides
                  </h3>
                  <span className="text-[11px] text-slate-500">Instant routing recalculation</span>
                </div>

                {/* Bridge South Card */}
                <div className="p-4 rounded-xl bg-slate-850/80 border border-slate-700/80 bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">Bridge South</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        E15_BRIDGE_SOUTH_EW
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      East-to-West River underpass arterial corridor (Vulnerable to flood crest)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={closureLoadingEdge === 'E15_BRIDGE_SOUTH_EW'}
                      onClick={() => handleToggle('E15_BRIDGE_SOUTH_EW', false)}
                      className="px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      {closureLoadingEdge === 'E15_BRIDGE_SOUTH_EW' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Ban className="w-3.5 h-3.5" />
                      )}
                      <span>Close Bridge South</span>
                    </button>
                    <button
                      type="button"
                      disabled={closureLoadingEdge === 'E15_BRIDGE_SOUTH_EW'}
                      onClick={() => handleToggle('E15_BRIDGE_SOUTH_EW', true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      {closureLoadingEdge === 'E15_BRIDGE_SOUTH_EW' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Reopen Bridge South</span>
                    </button>
                  </div>
                </div>

                {/* Bridge North Card */}
                <div className="p-4 rounded-xl bg-slate-850/80 border border-slate-700/80 bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">Bridge North</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        E13_BRIDGE_NORTH_EW
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      East-to-West High Bridge express connector (High elevation clearance)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={closureLoadingEdge === 'E13_BRIDGE_NORTH_EW'}
                      onClick={() => handleToggle('E13_BRIDGE_NORTH_EW', false)}
                      className="px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      {closureLoadingEdge === 'E13_BRIDGE_NORTH_EW' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Ban className="w-3.5 h-3.5" />
                      )}
                      <span>Close Bridge North</span>
                    </button>
                    <button
                      type="button"
                      disabled={closureLoadingEdge === 'E13_BRIDGE_NORTH_EW'}
                      onClick={() => handleToggle('E13_BRIDGE_NORTH_EW', true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      {closureLoadingEdge === 'E13_BRIDGE_NORTH_EW' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Reopen Bridge North</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Input field to close any edge by ID */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Manual Edge Closure by Identifier
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Specify any road segment ID from network graph to immediately close or reopen.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="e.g. E15_BRIDGE_SOUTH_EW, E14_CENTRAL_AVENUE_EW"
                      value={customEdgeId}
                      onChange={(e) => setCustomEdgeId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!customEdgeId.trim() || closureLoadingEdge === customEdgeId.trim()}
                      onClick={() => handleToggle(customEdgeId, false)}
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      {closureLoadingEdge === customEdgeId.trim() ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Ban className="w-3.5 h-3.5" />
                      )}
                      <span>Close Edge</span>
                    </button>
                    <button
                      type="button"
                      disabled={!customEdgeId.trim() || closureLoadingEdge === customEdgeId.trim()}
                      onClick={() => handleToggle(customEdgeId, true)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      {closureLoadingEdge === customEdgeId.trim() ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Reopen Edge</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Quick suggestions:</span>
                  {['E15_BRIDGE_SOUTH_EW', 'E16_BRIDGE_SOUTH_WE', 'E13_BRIDGE_NORTH_EW', 'E14_CENTRAL_AVENUE_EW'].map(
                    (suggested) => (
                      <button
                        key={suggested}
                        type="button"
                        onClick={() => setCustomEdgeId(suggested)}
                        className="px-2 py-0.5 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-300 font-mono text-[10px] transition"
                      >
                        {suggested}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Form to submit new citizen report */}
              <div className="p-4 rounded-xl bg-slate-850/80 border border-slate-700/80 bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Submit Citizen Incident Report
                  </h3>
                  <span className="text-[11px] text-slate-500">Field Hazard Intake</span>
                </div>

                {formFeedback && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{formFeedback}</span>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Road edge ID */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Road Edge ID *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. E15_BRIDGE_SOUTH_EW"
                        value={formEdgeId}
                        onChange={(e) => setFormEdgeId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Incident Type */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Incident Type *
                      </label>
                      <select
                        value={formKind}
                        onChange={(e) => setFormKind(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="road_flooded">road_flooded (Flooding / Water Hazard)</option>
                        <option value="debris_blocked">debris_blocked (Debris / Fallen Tree)</option>
                        <option value="bridge_closed">bridge_closed (Bridge Structural Concern)</option>
                        <option value="congestion">congestion (Gridlock Bottleneck)</option>
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Incident Description
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Describe observable hazard, estimated water depth, or impassable lanes..."
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={formSubmitting || !formEdgeId.trim()}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
                  >
                    {formSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Submitting Citizen Report...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Incident Report</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* List of pending/verified reports */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Community Incident Reports Queue
                    </h3>
                    <span className="text-xs font-mono text-slate-400">({reports.length} total)</span>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 text-xs">
                    {(
                      [
                        { id: 'all', label: 'All', count: reports.length },
                        { id: 'pending', label: 'Pending', count: pendingCount },
                        { id: 'verified', label: 'Verified', count: verifiedCount },
                        { id: 'rejected', label: 'Rejected', count: rejectedCount },
                      ] as const
                    ).map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setReportsFilter(filter.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                          reportsFilter === filter.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {filter.label} ({filter.count})
                      </button>
                    ))}
                  </div>
                </div>

                {filteredReports.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-800/30 rounded-xl border border-slate-800">
                    <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p>No reports matching current filter ({reportsFilter}).</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {filteredReports.map((report) => {
                      const scorePercent = Math.round((report.verification_score || 0) * 100);
                      const isPending = report.status === 'pending';
                      const isVerified = report.status === 'verified';
                      const isRejected = report.status === 'rejected';
                      const isReviewing = reviewingReportId === report.id;

                      return (
                        <div
                          key={report.id}
                          className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/80 hover:border-slate-600 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            {/* Top line with Edge ID, kind, and status */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-white flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                {report.edge_id}
                              </span>

                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
                                {getKindLabel(report.kind)}
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                  isVerified
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : isRejected
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {isVerified && <CheckCircle2 className="w-3 h-3" />}
                                {isRejected && <XCircle className="w-3 h-3" />}
                                {isPending && <AlertTriangle className="w-3 h-3" />}
                                {report.status}
                              </span>

                              {report.reported_minute !== undefined && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  T+{report.reported_minute}m
                                </span>
                              )}
                            </div>

                            {/* Description text */}
                            {report.description && (
                              <p className="text-xs text-slate-300 line-clamp-2">
                                {report.description}
                              </p>
                            )}

                            {/* Verification score & evidence count */}
                            <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                              <div className="flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                <span>Verification Score:</span>
                                <strong
                                  className={`font-mono ${
                                    scorePercent >= 70
                                      ? 'text-emerald-400'
                                      : scorePercent >= 40
                                      ? 'text-amber-400'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {scorePercent}%
                                </strong>
                              </div>
                              <span className="text-slate-600">•</span>
                              <span>
                                Evidence count: <strong className="text-slate-300">{report.evidence_count}</strong>
                              </span>
                            </div>
                          </div>

                          {/* Verify / Reject action buttons */}
                          {onReviewReport && (
                            <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-center">
                              <button
                                type="button"
                                disabled={isReviewing || isVerified}
                                onClick={() => handleReview(report.id, 'verify')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                  isVerified
                                    ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 cursor-default'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50'
                                }`}
                                title="Corroborate report and trigger safety re-route"
                              >
                                {isReviewing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>Verify</span>
                              </button>
                              <button
                                type="button"
                                disabled={isReviewing || isRejected}
                                onClick={() => handleReview(report.id, 'reject')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                  isRejected
                                    ? 'bg-red-950/40 text-red-400 border border-red-800/40 cursor-default'
                                    : 'bg-slate-700 hover:bg-red-600/80 text-slate-300 hover:text-white disabled:opacity-50'
                                }`}
                                title="Reject and archive report"
                              >
                                {isReviewing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Ban className="w-3 h-3" />
                                )}
                                <span>Reject</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthorityModal;
