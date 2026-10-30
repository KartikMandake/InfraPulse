import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from '../components/common/EmptyState';

export const IncidentManagementPage = () => {
  const { incidents, alerts = [], mitigateIncident, resolveIncident, createManualIncident, services } = useApp();
  const { isViewer, role } = useAuth();
  const navigate = useNavigate();

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newServiceId, setNewServiceId] = useState('payment-service');
  const [newSeverity, setNewSeverity] = useState('SEV-2');

  const filtered = incidents.filter(inc => {
    if (filterStatus === 'active' && inc.status === 'resolved') return false;
    if (filterStatus === 'resolved' && inc.status !== 'resolved') return false;
    if (filterSeverity !== 'all' && inc.severity !== filterSeverity) return false;
    return true;
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const targetService = services.find(s => s.id === newServiceId) || services[0];
    createManualIncident({
      title: newTitle,
      severity: newSeverity,
      serviceId: targetService?.id || 'payment-service',
      serviceName: targetService?.name || 'Payment Service',
      summary: `Manually declared anomaly on ${targetService?.name || 'Payment Service'}.`,
    });
    setNewTitle('');
    setIsCreateModalOpen(false);
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#93000a] text-[#ffdad6] flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[20px]">emergency</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-semibold tracking-tight">Incident Management & War Rooms</h1>
              <span className="px-2 py-0.5 rounded bg-[#93000a] text-[#ffdad6] text-[10px] font-bold">
                {incidents.filter(i => i.status !== 'resolved').length} ACTIVE
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Real-time causal graph diagnosis, responder triage coordination, and automatic postmortem tracking.
            </p>
          </div>
        </div>

        {isViewer ? (
          <span className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-[#606470] text-xs italic">
            Read-Only (Viewer)
          </span>
        ) : (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] text-xs font-bold hover:bg-[#e1ff59] transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">add_alert</span>
            <span>Declare Incident</span>
          </button>
        )}
      </div>

      {/* Operational Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Active Critical Incidents</div>
          <div className="text-2xl font-bold text-[#ff5364] my-1">
            {incidents.filter(i => i.severity === 'SEV-1' && i.status !== 'resolved').length}
          </div>
          <div className="text-[10px] text-[#ff5364]">Immediate SRE Page active</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Mean Time to Detect (MTTD)</div>
          <div className="text-2xl font-bold text-white my-1">42s</div>
          <div className="text-[10px] text-[#50d890]">AI telemetry anomaly attribution</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Mean Time to Mitigate (MTTM)</div>
          <div className="text-2xl font-bold text-white my-1">12.4m</div>
          <div className="text-[10px] text-[#b1c5ff]">Trailing 30-day baseline</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Est. Revenue at Risk</div>
          <div className="text-2xl font-bold text-[#ff5364] my-1">$14.2k<span className="text-xs text-[#9296A3]">/min</span></div>
          <div className="text-[10px] text-[#ff5364]">4.12% checkout drop rate</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[#9296A3] uppercase text-[10px]">Status:</span>
          {['all', 'active', 'resolved'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterStatus === st ? 'bg-[#1558C9] text-white font-bold' : 'bg-[#030407] border border-[#272a33] text-[#9296A3]'
              }`}
            >
              {st.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#9296A3] uppercase text-[10px]">Severity:</span>
          {['all', 'SEV-1', 'SEV-2', 'SEV-3'].map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterSeverity === sev ? 'bg-[#22252e] text-white font-bold border border-[#3A3E4D]' : 'bg-[#030407] border border-[#272a33] text-[#9296A3]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Incidents List or Empty State */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="check_circle"
          title="No Matching Incidents"
          description="All incidents matching this filter are resolved or inactive."
          actionText="Clear Filters"
          onAction={() => {
            setFilterStatus('all');
            setFilterSeverity('all');
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(inc => (
            <div
              key={inc.id}
              className={`p-4 bg-[#101116] border rounded-xl shadow-md transition-all ${
                inc.severity === 'SEV-1' && inc.status !== 'resolved'
                  ? 'border-[#ff5364]/50 shadow-[0_0_12px_rgba(255,83,100,0.15)]'
                  : 'border-[#272a33]'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${
                    inc.severity === 'SEV-1' ? 'bg-[#ff5364] text-[#030407]' :
                    inc.severity === 'SEV-2' ? 'bg-[#ffb547] text-[#030407]' : 'bg-[#1558c9] text-white'
                  }`}>
                    {inc.severity}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[#ff5364] font-bold">{inc.id}</span>
                      <span className="text-[#5A5E6B]">•</span>
                      <span className="text-white font-semibold text-sm">{inc.title}</span>
                      {alerts.filter(a => a.incidentId === inc.id).length > 0 && (
                        <button
                          onClick={() => navigate('/alerts')}
                          className="px-2 py-0.5 rounded bg-[#ff5364]/10 text-[#ff5364] border border-[#ff5364]/30 text-[10px] flex items-center gap-1 hover:bg-[#ff5364]/20 transition-colors"
                          title="View correlated alerts"
                        >
                          <span className="material-symbols-outlined text-[12px]">notifications_active</span>
                          <span>{alerts.filter(a => a.incidentId === inc.id).length} Linked Alert{alerts.filter(a => a.incidentId === inc.id).length > 1 ? 's' : ''}</span>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#9296A3] mt-1 leading-relaxed">{inc.summary}</p>
                  </div>
                </div>

                {/* Triage & Actions */}
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <button
                    onClick={() => navigate(`/incidents/${inc.id}`)}
                    className="px-3 py-1.5 rounded bg-[#1558C9] text-white font-semibold hover:bg-[#124ab0] transition-colors"
                  >
                    Investigate
                  </button>
                  {inc.status !== 'mitigating' && inc.status !== 'resolved' && (
                    <button
                      onClick={() => mitigateIncident(inc.id)}
                      className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e] transition-colors"
                    >
                      Mark Mitigating
                    </button>
                  )}
                  {inc.status !== 'resolved' && (
                    <button
                      onClick={() => resolveIncident(inc.id)}
                      className="px-3 py-1.5 rounded bg-[#50d890]/20 border border-[#50d890]/40 text-[#50d890] hover:bg-[#50d890]/30 transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>

              {/* Metadata Footer Strip */}
              <div className="mt-3 pt-2.5 border-t border-[#272a33] flex flex-wrap items-center justify-between gap-3 text-xs text-[#9296A3]">
                <div className="flex items-center gap-4">
                  <span>Lead: <strong className="text-white">{inc.lead}</strong> ({inc.leadRole})</span>
                  <span>Room: <strong className="text-[#b1c5ff] hover:underline cursor-pointer">{inc.channel}</strong></span>
                  <span>Started: <strong className="text-white">{inc.startedAt}</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#d4ff24]">AI Confidence: {inc.aiConfidencePercent}%</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    inc.status === 'resolved' ? 'bg-[#50d890]/20 text-[#50d890]' :
                    inc.status === 'mitigating' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#93000a] text-[#ffdad6]'
                  }`}>
                    {inc.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Declare Incident Dialog */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-[#030407]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#3A3E4D] w-full max-w-lg p-4 rounded-xl shadow-2xl flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-2">
              <span className="text-sm font-bold text-white">Declare New Incident</span>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-[#9296A3] hover:text-white">✕</button>
            </div>
            <div className="space-y-1">
              <label className="text-[#9296A3]">Incident Title / Symptom</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Memory pressure on order-fulfillment pods..."
                className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[#9296A3]">Affected Service</label>
              <select
                value={newServiceId}
                onChange={(e) => setNewServiceId(e.target.value)}
                className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none"
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.namespace})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[#9296A3]">Severity Tier</label>
              <div className="flex items-center gap-2">
                {['SEV-1', 'SEV-2', 'SEV-3'].map(sev => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setNewSeverity(sev)}
                    className={`flex-1 p-2 rounded text-center font-bold ${
                      newSeverity === sev ? 'bg-[#ff5364] text-[#030407]' : 'bg-[#171920] border border-[#272a33] text-[#9296A3]'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#272a33]">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] font-bold hover:bg-[#e1ff59]"
              >
                Declare & Page On-Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

