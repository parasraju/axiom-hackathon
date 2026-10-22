import React, { useState } from 'react';
import { X, Shield, Check, Ban, PlusCircle } from 'lucide-react';
import type { IncidentReport } from '../types';

interface AuthorityModalProps {
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
  const [customEdge, setCustomEdge] = useState('');
  const [reportEdge, setReportEdge] = useState('E15_BRIDGE_SOUTH_EW');
  const [reportKind, setReportKind] = useState('road_flooded');
  const [reportDesc, setReportDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportEdge) return;
    setSubmitting(true);
    try {
      await onSubmitReport(reportEdge, reportKind, reportDesc);
      setReportDesc('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl text-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                Emergency Authority Command Console
              </h2>
              <p className="text-[11px] text-slate-400">Road closures override, incident corroboration, and audit log</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-5 bg-slate-950/30">
          <button
            onClick={() => setActiveTab('closures')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'closures'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Road Closures Override
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Citizen Hazard Reports</span>
            {reports.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-600 text-white font-mono">
                {reports.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeTab === 'closures' ? (
            <div className="space-y-4">
              <div className="text-xs text-slate-300">
                Instantly close or reopen critical road infrastructure to test rerouting and capacity distribution:
              </div>

              {/* Quick Road Control Cards */}
              <div className="space-y-2">
                {[
                  { id: 'E15_BRIDGE_SOUTH_EW', name: 'Bridge South (East to West Underpass)' },
                  { id: 'E16_BRIDGE_SOUTH_WE', name: 'Bridge South (West to East Underpass)' },
                  { id: 'E13_BRIDGE_NORTH_EW', name: 'Bridge North (East to West Highway)' },
                  { id: 'E11_N05_N07', name: 'River South Promenade (Low Basin)' },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{item.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{item.id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleClosure(item.id, false)}
                        className="px-2.5 py-1 rounded bg-red-600/80 hover:bg-red-500 text-white text-[11px] font-bold transition flex items-center gap-1"
                      >
                        <Ban className="w-3 h-3" />
                        <span>Force Close</span>
                      </button>
                      <button
                        onClick={() => onToggleClosure(item.id, true)}
                        className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-[11px] font-bold transition flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>Reopen</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom Edge Closure Input */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Manual Edge ID Closure
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. E01_N01_N02"
                    value={customEdge}
                    onChange={(e) => setCustomEdge(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    onClick={() => {
                      if (customEdge) onToggleClosure(customEdge, false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      if (customEdge) onToggleClosure(customEdge, true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                  >
                    Open
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Submit Incident Form */}
              <form onSubmit={handleReportSubmit} className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
                <div className="text-xs font-bold text-white uppercase tracking-wider">
                  Submit Hazard Incident Report
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase">Target Edge</label>
                    <select
                      value={reportEdge}
                      onChange={(e) => setReportEdge(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="E15_BRIDGE_SOUTH_EW">Bridge South Underpass [E15]</option>
                      <option value="E13_BRIDGE_NORTH_EW">Bridge North [E13]</option>
                      <option value="E05_N03_N04">East Bridge Access [E05]</option>
                      <option value="E11_N05_N07">River South Promenade [E11]</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase">Hazard Type</label>
                    <select
                      value={reportKind}
                      onChange={(e) => setReportKind(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="road_flooded">Severe Flooding</option>
                      <option value="debris_blocked">Fallen Tree / Debris</option>
                      <option value="bridge_closed">Structural Damage</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 uppercase">Description</label>
                  <input
                    type="text"
                    placeholder="Water level over 0.3m, completely impassable"
                    value={reportDesc}
                    onChange={(e) => setReportDesc(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Submit Incident Report</span>
                </button>
              </form>

              {/* Reports Queue */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Incident Verification Queue ({reports.length})
                </div>

                {reports.length === 0 ? (
                  <div className="text-xs text-slate-500 py-3 text-center">No active reports. Submit one above.</div>
                ) : (
                  reports.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{r.edge_id}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                            r.status === 'verified'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : r.status === 'rejected'
                              ? 'bg-slate-700 text-slate-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {r.description || r.kind} • Corroboration score: {(r.verification_score * 100).toFixed(0)}% ({r.evidence_count} report)
                        </div>
                      </div>

                      {onReviewReport && r.status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onReviewReport(r.id, 'verify')}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => onReviewReport(r.id, 'reject')}
                            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-bold"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
