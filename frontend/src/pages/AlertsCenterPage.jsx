import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from '../components/common/EmptyState';

export const AlertsCenterPage = () => {
  const { alerts, services = [], acknowledgeAlert, resolveAlert, silenceAlert, evaluateAlerts } = useApp();
  const { isViewer, role } = useAuth();
  const navigate = useNavigate();

  const [filterState, setFilterState] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [isEvaluating, setIsEvaluating] = useState(false);

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    try {
      await evaluateAlerts({ mode: 'mock' });
    } catch (e) {
      console.error('Failed to evaluate alerts:', e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const filtered = alerts.filter(a => {
    // Status/state filter
    if (filterState !== 'all') {
      if (filterState === 'firing') {
        if (a.state !== 'firing' && a.status !== 'active') return false;
      } else if (filterState === 'resolved') {
        if (a.state !== 'resolved' && a.status !== 'resolved') return false;
      } else if (filterState === 'acknowledged') {
        if (a.state !== 'acknowledged' && a.status !== 'acknowledged') return false;
      } else if (filterState === 'silenced') {
        if (a.state !== 'silenced') return false;
      }
    }

    // Severity filter
    if (filterSeverity !== 'all' && a.severity?.toLowerCase() !== filterSeverity.toLowerCase()) {
      return false;
    }

    // Service filter
    if (filterService !== 'all' && a.serviceId !== filterService) {
      return false;
    }

    return true;
  });

  const firingCount = alerts.filter(a => a.state === 'firing' || a.status === 'active').length;
  const criticalCount = alerts.filter(a => (a.state === 'firing' || a.status === 'active') && a.severity === 'critical').length;
  const warningCount = alerts.filter(a => (a.state === 'firing' || a.status === 'active') && a.severity === 'warning').length;

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#ffb547]">
            <span className="material-symbols-outlined text-[20px]">notifications_active</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-semibold tracking-tight">Alerts Center & Intelligent Correlation</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${firingCount > 0 ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#50d890]/20 text-[#50d890]'}`}>
                {firingCount} FIRING
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Intelligent anomaly thresholds, topological correlation, and automated incident routing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleEvaluate}
            disabled={isEvaluating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1558C9] text-white hover:bg-[#124ab0] disabled:opacity-50 text-xs font-semibold transition-colors shadow-sm"
          >
            <span className={`material-symbols-outlined text-[15px] ${isEvaluating ? 'animate-spin' : ''}`}>
              {isEvaluating ? 'sync' : 'bolt'}
            </span>
            <span>{isEvaluating ? 'Evaluating...' : 'Evaluate Alerts'}</span>
          </button>

          <button
            onClick={() => navigate('/slos')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e] text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-[#d4ff24]">speed</span>
            <span>SLO Burn Rates</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Active Firing Alerts</div>
          <div className="text-2xl font-bold text-[#ff5364] my-1">
            {firingCount}
          </div>
          <div className="text-[10px] text-[#ff5364]">
            {criticalCount} Critical • {warningCount} Warning
          </div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Fatigue Suppression Index</div>
          <div className="text-2xl font-bold text-[#50d890] my-1">94.2%</div>
          <div className="text-[10px] text-[#9296A3]">
            {alerts.filter(a => a.occurrenceCount > 1).length} alert rules deduplicated
          </div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Silenced & Resolved</div>
          <div className="text-2xl font-bold text-white my-1">
            {alerts.filter(a => a.state === 'silenced' || a.status === 'resolved' || a.state === 'resolved').length}
          </div>
          <div className="text-[10px] text-[#9296A3]">
            {alerts.filter(a => a.status === 'resolved' || a.state === 'resolved').length} Resolved • {alerts.filter(a => a.state === 'silenced').length} Silenced
          </div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl">
          <div className="text-[10px] uppercase text-[#9296A3]">Active On-Call Escalation</div>
          <div className="text-base font-bold text-white my-1 truncate">Sarah Chen</div>
          <div className="text-[10px] text-[#d4ff24]">Primary Tier-0 Rotation</div>
        </div>
      </div>

      {/* Filter Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[#9296A3] uppercase text-[10px]">Filter State:</span>
            {[
              { id: 'all', label: 'ALL' },
              { id: 'firing', label: 'FIRING' },
              { id: 'acknowledged', label: 'ACK' },
              { id: 'resolved', label: 'RESOLVED' },
              { id: 'silenced', label: 'SILENCED' }
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setFilterState(st.id)}
                className={`px-2.5 py-1 rounded transition-colors text-[11px] ${
                  filterState === st.id ? 'bg-[#1558C9] text-white font-bold' : 'bg-[#030407] border border-[#272a33] text-[#9296A3]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
            <span className="text-[#9296A3] uppercase text-[10px]">Severity:</span>
            {['all', 'critical', 'warning', 'info'].map(sev => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-2 py-1 rounded transition-colors text-[11px] ${
                  filterSeverity === sev ? 'bg-[#22252e] text-white font-bold border border-[#3A3E4D]' : 'bg-[#030407] border border-[#272a33] text-[#9296A3]'
                }`}
              >
                {sev.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#9296A3] uppercase text-[10px]">Service:</span>
          <select
            value={filterService}
            onChange={(e) => setFilterService(e.target.value)}
            className="bg-[#030407] border border-[#272a33] text-white text-[11px] px-2.5 py-1 rounded outline-none focus:border-[#1558C9]"
          >
            <option value="all">All Monitored Services</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts Table/List or Empty State */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="notifications_off"
          title="No Alerts Match Filter"
          description={`There are no alerts in state "${filterState}", severity "${filterSeverity}", and service "${filterService}".`}
          actionText="Show All Alerts"
          onAction={() => {
            setFilterState('all');
            setFilterSeverity('all');
            setFilterService('all');
          }}
        />
      ) : (
        <div className="flex flex-col gap-2 text-xs">
          {filtered.map(alert => {
            const isFiring = alert.state === 'firing' || alert.status === 'active';
            const isAcked = alert.state === 'acknowledged' || alert.status === 'acknowledged';
            const isResolved = alert.state === 'resolved' || alert.status === 'resolved';

            return (
              <div
                key={alert.id}
                className={`p-3.5 bg-[#101116] border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                  isFiring && alert.severity === 'critical'
                    ? 'border-[#ff5364]/50 shadow-[0_0_10px_rgba(255,83,100,0.12)]'
                    : isResolved
                    ? 'border-[#272a33]/60 opacity-75'
                    : 'border-[#272a33]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 mt-0.5 ${
                    alert.severity === 'critical' ? 'bg-[#93000a] text-[#ffdad6]' :
                    alert.severity === 'warning' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#1558C9]/30 text-[#b1c5ff]'
                  }`}>
                    {alert.severity}
                  </span>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-white font-semibold text-sm">{alert.title}</span>
                      <span className="text-[10px] text-[#5A5E6B]">{alert.id}</span>
                      {alert.occurrenceCount > 1 && (
                        <span className="px-1.5 py-0.5 rounded bg-[#171920] border border-[#272a33] text-[#50d890] text-[10px]">
                          ⚡ Deduplicated ({alert.occurrenceCount}x)
                        </span>
                      )}
                      {alert.incidentId && (
                        <button
                          onClick={() => navigate('/incidents')}
                          className="px-1.5 py-0.5 rounded bg-[#1558C9]/20 hover:bg-[#1558C9]/40 border border-[#1558C9]/50 text-[#b1c5ff] text-[10px] flex items-center gap-1 transition-colors"
                          title="Click to view correlated incident"
                        >
                          <span className="material-symbols-outlined text-[11px]">link</span>
                          <span>Linked {alert.incidentId}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[#9296A3] text-[11px] mt-1.5">
                      <span>Target: <strong className="text-white hover:underline cursor-pointer" onClick={() => navigate(`/services/${alert.serviceId}`)}>{alert.serviceName || alert.serviceId}</strong></span>
                      <span>Threshold: <strong className="text-[#d4ff24]">{alert.operator ? `${alert.operator} ` : ''}{alert.threshold}</strong></span>
                      <span>Current: <strong className={alert.severity === 'critical' && isFiring ? 'text-[#ff5364]' : 'text-white'}>{alert.currentValue || alert.observedValue}</strong></span>
                      <span>Fired: {alert.firedAt}</span>
                      {alert.resolvedAt && <span className="text-[#50d890]">Resolved: {new Date(alert.resolvedAt).toLocaleTimeString()}</span>}
                    </div>

                    {Array.isArray(alert.evidenceRefs) && alert.evidenceRefs.length > 0 && (
                      <div className="mt-1 text-[10px] text-[#717684] flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px] text-[#d4ff24]">fact_check</span>
                        <span>Evidence: {alert.evidenceRefs[0].description}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isViewer ? (
                    <span className="px-2 py-1 rounded bg-[#171920] border border-[#272a33] text-[#606470] text-[10px] italic">
                      Read-Only (Viewer)
                    </span>
                  ) : (
                    <>
                      {isFiring && (
                        <>
                          <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="px-2.5 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e] transition-colors"
                          >
                            Acknowledge
                          </button>
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="px-2.5 py-1.5 rounded bg-[#171920] border border-[#272a33] text-[#50d890] hover:bg-[#50d890]/10 transition-colors"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => silenceAlert(alert.id)}
                            className="px-2.5 py-1.5 rounded bg-[#171920] border border-[#272a33] text-[#9296A3] hover:text-white transition-colors"
                          >
                            Silence
                          </button>
                        </>
                      )}

                      {isAcked && (
                        <>
                          <span className="px-2 py-1 rounded bg-[#171920] text-[#50d890] text-[10px] border border-[#272a33]">
                            Acknowledged
                          </span>
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="px-2.5 py-1.5 rounded bg-[#171920] border border-[#272a33] text-[#50d890] hover:bg-[#50d890]/10 transition-colors"
                          >
                            Resolve
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {isResolved && (
                    <span className="px-2 py-1 rounded bg-[#50d890]/10 text-[#50d890] text-[10px] border border-[#50d890]/30 font-semibold">
                      ✓ Resolved
                    </span>
                  )}

                  {alert.state === 'silenced' && (
                    <span className="px-2 py-1 rounded bg-[#171920] text-[#9296A3] text-[10px] border border-[#272a33]">
                      {alert.silenceDuration || 'Silenced'}
                    </span>
                  )}

                  <button
                    onClick={() => navigate(`/services/${alert.serviceId}`)}
                    className="px-2.5 py-1.5 rounded bg-[#1558C9] text-white font-semibold hover:bg-[#124ab0] transition-colors"
                  >
                    Inspect Service
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
