import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const SelfMonitoringPage = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await api.getSelfMonitoringOverview();
      if (res && res.data) {
        setData(res.data);
        setError(null);
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Self-monitoring telemetry fetch error:', err);
      setError(err.message || 'Unable to load platform observability metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    if (!autoRefresh) return;
    const timer = setInterval(fetchTelemetry, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [fetchTelemetry, autoRefresh, refreshInterval]);

  const platformStatus = data?.platformStatus || 'UNKNOWN';
  const subsystems = data?.subsystems ? Object.values(data.subsystems) : [];
  const runtime = data?.runtime || {};
  const http = data?.httpPerformance || {};
  const alerts = data?.alerts?.items || [];
  const slos = data?.slos || [];

  return (
    <div className="min-h-screen bg-[#030407] text-white p-6 font-mono select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#272a33]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-[#1558C9] flex items-center justify-center shadow-lg shadow-[#1558C9]/40">
            <span className="material-symbols-outlined text-[24px] text-white">monitor_heart</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-white">Platform Self-Monitoring</h1>
              <span className={`px-2 py-0.5 text-xs font-bold rounded flex items-center gap-1.5 ${
                platformStatus === 'HEALTHY'
                  ? 'bg-[#d4ff24] text-[#030407]'
                  : platformStatus === 'DEGRADED'
                  ? 'bg-amber-400 text-black'
                  : 'bg-rose-500 text-white'
              }`}>
                <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                {platformStatus}
              </span>
            </div>
            <p className="text-xs text-[#9296A3] mt-0.5">
              Production observability, internal SLIs, runtime saturation, and health probes
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-[#9296A3]">
            <span>Auto-refresh:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              disabled={!autoRefresh}
              className="bg-[#101116] border border-[#272a33] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#1558C9]"
            >
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
            </select>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2 py-1 rounded text-xs border ${
                autoRefresh
                  ? 'border-[#1558C9] text-[#1558C9] bg-[#1558C9]/10'
                  : 'border-[#272a33] text-[#9296A3] hover:text-white'
              }`}
            >
              {autoRefresh ? 'Enabled' : 'Paused'}
            </button>
          </div>

          <button
            onClick={fetchTelemetry}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1558C9] hover:bg-[#124cb0] text-white text-xs font-medium rounded shadow transition-colors"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>sync</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
          <button onClick={fetchTelemetry} className="underline text-rose-200">Retry</button>
        </div>
      )}

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-6">
        <div className="bg-[#101116] border border-[#272a33] rounded p-3">
          <div className="text-[11px] text-[#9296A3]">HTTP Error Rate</div>
          <div className="text-xl font-bold text-white mt-1">
            {http.errorPercent !== null && http.errorPercent !== undefined ? `${http.errorPercent.toFixed(2)}%` : '0.00%'}
          </div>
          <div className="text-[10px] text-[#9296A3] mt-1">{http.failed || 0} failed / {http.total || 0} reqs</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] rounded p-3">
          <div className="text-[11px] text-[#9296A3]">P95 Response Latency</div>
          <div className="text-xl font-bold text-[#d4ff24] mt-1">
            {http.p95Ms !== null && http.p95Ms !== undefined ? `${http.p95Ms}ms` : '<10ms'}
          </div>
          <div className="text-[10px] text-[#9296A3] mt-1">P50: {http.p50Ms || 5}ms | P99: {http.p99Ms || 25}ms</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] rounded p-3">
          <div className="text-[11px] text-[#9296A3]">DB Pool Active / Max</div>
          <div className="text-xl font-bold text-white mt-1">
            {data?.subsystems?.database?.pool?.activeCount || 0} / {data?.subsystems?.database?.pool?.max || 10}
          </div>
          <div className="text-[10px] text-[#9296A3] mt-1">
            {data?.subsystems?.database?.pool?.waitingCount || 0} waiting | {data?.subsystems?.database?.latencyMs || 0}ms ping
          </div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] rounded p-3">
          <div className="text-[11px] text-[#9296A3]">Worker Heartbeat Age</div>
          <div className="text-xl font-bold text-white mt-1">
            {data?.subsystems?.worker?.heartbeatAgeSeconds !== null ? `${data?.subsystems?.worker?.heartbeatAgeSeconds}s` : '0s'}
          </div>
          <div className="text-[10px] text-[#9296A3] mt-1">PID: {data?.subsystems?.worker?.pid || process.pid}</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] rounded p-3">
          <div className="text-[11px] text-[#9296A3]">Node Event Loop P95</div>
          <div className="text-xl font-bold text-white mt-1">
            {runtime.eventLoopP95Ms !== null && runtime.eventLoopP95Ms !== undefined ? `${runtime.eventLoopP95Ms.toFixed(2)}ms` : '<1ms'}
          </div>
          <div className="text-[10px] text-[#9296A3] mt-1">Uptime: {Math.floor((runtime.uptimeSeconds || 0) / 60)}m</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] rounded p-3">
          <div className="text-[11px] text-[#9296A3]">Process Heap Memory</div>
          <div className="text-xl font-bold text-white mt-1">
            {runtime.heapUsedBytes ? `${Math.round(runtime.heapUsedBytes / 1024 / 1024)}MB` : 'N/A'}
          </div>
          <div className="text-[10px] text-[#9296A3] mt-1">
            {runtime.heapUtilizationPercent ? `${runtime.heapUtilizationPercent.toFixed(1)}% limit` : ''}
          </div>
        </div>
      </div>

      {/* Subsystem Health Matrix */}
      <div className="mt-8">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-[#1558C9]">hub</span>
          InfraPulse Subsystem Health Matrix ({subsystems.length} Monitored Components)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {subsystems.map((sub) => {
            const isOk = sub.status === 'HEALTHY';
            const isDegraded = sub.status === 'DEGRADED';
            return (
              <div key={sub.id} className="bg-[#101116] border border-[#272a33] rounded p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white truncate" title={sub.name}>{sub.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      isOk
                        ? 'bg-[#d4ff24]/20 text-[#d4ff24] border border-[#d4ff24]/40'
                        : isDegraded
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {sub.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9296A3] line-clamp-2">
                    {sub.details || (sub.connected ? `Connected (${sub.latencyMs}ms)` : `Operating normal`)}
                  </p>
                </div>
                {sub.id === 'database' && sub.pool && (
                  <div className="mt-2 text-[10px] text-[#9296A3] border-t border-[#272a33] pt-1.5">
                    Pool: {sub.pool.activeCount} active, {sub.pool.idleCount} idle
                  </div>
                )}
                {sub.id === 'worker' && (
                  <div className="mt-2 text-[10px] text-[#9296A3] border-t border-[#272a33] pt-1.5">
                    Heartbeat age: {sub.heartbeatAgeSeconds || 0}s
                  </div>
                )}
                {sub.id === 'telemetryPipeline' && (
                  <div className="mt-2 text-[10px] text-[#9296A3] border-t border-[#272a33] pt-1.5">
                    DLQ: {sub.deadLetterQueueCount || 0} items | Ingested: {sub.totalIngestedEvents || 0}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts and SLOs in 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Platform Operational Alerts */}
        <div className="bg-[#101116] border border-[#272a33] rounded p-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#272a33] mb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-amber-400">warning</span>
              Platform Operational Self-Alerts
            </h2>
            <span className="text-xs text-[#9296A3]">
              {data?.alerts?.firingCount || 0} Firing / {data?.alerts?.resolvedCount || 0} Clear
            </span>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="text-xs text-[#9296A3] py-6 text-center">No active or evaluated alerts found.</div>
            ) : (
              alerts.map((alert) => {
                const isFiring = alert.status === 'FIRING';
                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded border text-xs ${
                      isFiring
                        ? 'bg-rose-950/20 border-rose-800/80 text-white'
                        : 'bg-[#030407] border-[#272a33] text-[#9296A3]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isFiring ? 'bg-rose-500 animate-ping' : 'bg-[#d4ff24]'}`}></span>
                        {alert.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                          alert.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                          isFiring ? 'bg-rose-600 text-white' : 'bg-[#d4ff24]/20 text-[#d4ff24]'
                        }`}>
                          {alert.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#9296A3] mt-1">{alert.message}</p>
                    <div className="flex items-center justify-between text-[10px] text-[#9296A3] mt-2 pt-1 border-t border-[#272a33]/60">
                      <span>Value: <span className="text-white">{alert.currentValue}</span> (Threshold: {alert.threshold})</span>
                      {alert.cooldownActive && <span className="text-amber-400">Cooldown Active</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Platform SLO Compliance */}
        <div className="bg-[#101116] border border-[#272a33] rounded p-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#272a33] mb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#1558C9]">track_changes</span>
              Platform Service Level Objectives (SLOs)
            </h2>
            <span className="text-xs text-[#9296A3]">5-Minute Rolling Slis</span>
          </div>

          <div className="space-y-3.5">
            {slos.map((slo) => {
              const isCompliant = slo.status === 'COMPLIANT';
              return (
                <div key={slo.id} className="bg-[#030407] border border-[#272a33] rounded p-3 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-white">{slo.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      isCompliant
                        ? 'bg-[#d4ff24]/20 text-[#d4ff24] border border-[#d4ff24]/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {slo.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#9296A3] mb-1.5">
                    <span>
                      Target: {slo.targetPercent}% {slo.targetThresholdMs ? `(<= ${slo.targetThresholdMs}ms)` : ''}
                    </span>
                    <span className="text-white font-bold">
                      {slo.currentAttainmentPercent !== undefined
                        ? `${slo.currentAttainmentPercent.toFixed(2)}% Attainment`
                        : `${slo.currentValueMs}ms`}
                    </span>
                  </div>

                  {slo.errorBudgetRemainingPercent !== undefined && (
                    <div>
                      <div className="w-full bg-[#272a33] h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full transition-all duration-500 ${
                            slo.errorBudgetRemainingPercent > 50 ? 'bg-[#d4ff24]' : slo.errorBudgetRemainingPercent > 10 ? 'bg-amber-400' : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.max(2, Math.min(100, slo.errorBudgetRemainingPercent))}%` }}
                        ></div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#9296A3] mt-1">
                        <span>Budget Remaining: {slo.errorBudgetRemainingPercent}%</span>
                        <span>Burn Rate: {slo.burnRate}x</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-8 pt-4 border-t border-[#272a33] flex flex-col md:flex-row items-center justify-between text-xs text-[#9296A3]">
        <div>
          Prometheus Scrape Endpoint: <code className="bg-[#101116] px-1.5 py-0.5 rounded text-white text-[11px]">/metrics</code> | 
          OpenTelemetry OTLP: <code className="bg-[#101116] px-1.5 py-0.5 rounded text-white text-[11px]">http://127.0.0.1:4318/v1/traces</code>
        </div>
        <div className="mt-2 md:mt-0">
          Last Synced: {lastRefreshed || 'N/A'}
        </div>
      </div>
    </div>
  );
};

export default SelfMonitoringPage;

