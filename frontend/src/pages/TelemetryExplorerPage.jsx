import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { INITIAL_TRACES } from '../data/mockData';
import { EmptyState } from '../components/common/EmptyState';
import api from '../services/api';

export const TelemetryExplorerPage = () => {
  const { telemetryLogs, addToast } = useApp();
  const [activeTab, setActiveTab] = useState('traces');
  const [query, setQuery] = useState('service.name = "payment-service" AND http.status_code >= 500');
  const [activeFilterToken, setActiveFilterToken] = useState('payment-service');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState(INITIAL_TRACES[0]);

  // Telemetry Mode & Datasources State
  const [telemetryMode, setTelemetryMode] = useState('demo'); // 'demo' | 'live'
  const [datasourceStatus, setDatasourceStatus] = useState(null);
  const [isCheckingDatasources, setIsCheckingDatasources] = useState(false);

  // Poll / fetch datasource connectivity status
  const checkStatus = async () => {
    setIsCheckingDatasources(true);
    try {
      const res = await api.getTelemetryStatus();
      if (res.success && res.data) {
        setDatasourceStatus(res.data);
        setTelemetryMode(res.data.activeMode || 'demo');
      }
    } catch (err) {
      console.warn('Could not check telemetry datasources status:', err.message);
    } finally {
      setIsCheckingDatasources(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleModeToggle = async (newMode) => {
    try {
      const res = await api.setTelemetryMode(newMode);
      if (res.success) {
        setTelemetryMode(newMode);
        addToast({
          type: newMode === 'live' ? 'warning' : 'info',
          title: `Telemetry Mode: ${newMode.toUpperCase()}`,
          description: newMode === 'live' 
            ? 'Connected to local OpenTelemetry / Prometheus / Tempo / Loki stack.' 
            : 'Reverted to simulated deterministic mock telemetry.'
        });
        checkStatus();
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Mode Switch Error',
        description: err.message
      });
    }
  };

  const handleRunQuery = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 400);
  };

  const filteredTraces = useMemo(() => {
    if (!activeFilterToken) return INITIAL_TRACES;
    const token = activeFilterToken.toLowerCase();
    return INITIAL_TRACES.filter(t => 
      t.service?.toLowerCase().includes(token) || 
      t.operation?.toLowerCase().includes(token) ||
      (t.httpStatus && t.httpStatus.toString().includes(token)) ||
      (t.status === 'error' && token.includes('500'))
    );
  }, [activeFilterToken]);

  const filteredLogs = useMemo(() => {
    if (!activeFilterToken) return telemetryLogs;
    const token = activeFilterToken.toLowerCase();
    return telemetryLogs.filter(l => 
      l.service?.toLowerCase().includes(token) || 
      l.message?.toLowerCase().includes(token) ||
      l.level?.toLowerCase().includes(token)
    );
  }, [telemetryLogs, activeFilterToken]);

  const setFilterAndQuery = (q, token) => {
    setQuery(q);
    setActiveFilterToken(token);
    handleRunQuery();
  };

  const ds = datasourceStatus?.datasources;

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#1558C9]">
            <span className="material-symbols-outlined text-[20px]">terminal</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-semibold tracking-tight">Telemetry Explorer (OTel / ClickHouse)</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                telemetryMode === 'live' ? 'bg-[#d4ff24] text-[#030407]' : 'bg-[#171920] border border-[#272a33] text-[#9296A3]'
              }`}>
                {telemetryMode === 'live' ? 'LIVE OTel STACK' : 'MOCK DEMO MODE'}
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Unified machine telemetry: distributed traces (Tempo), structured logs (Loki), and Prometheus metrics.
            </p>
          </div>
        </div>

        {/* Telemetry Mode Toggle Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#030407] rounded border border-[#272a33] p-0.5 text-xs">
            <button
              onClick={() => handleModeToggle('demo')}
              className={`px-3 py-1 rounded transition-colors ${
                telemetryMode === 'demo' ? 'bg-[#1558C9] text-white font-semibold' : 'text-[#9296A3] hover:text-white'
              }`}
            >
              Demo Mode
            </button>
            <button
              onClick={() => handleModeToggle('live')}
              className={`px-3 py-1 rounded transition-colors ${
                telemetryMode === 'live' ? 'bg-[#d4ff24] text-[#030407] font-bold' : 'text-[#9296A3] hover:text-white'
              }`}
            >
              Live Local Mode
            </button>
          </div>
          <button
            onClick={checkStatus}
            disabled={isCheckingDatasources}
            className="p-1.5 rounded bg-[#171920] border border-[#272a33] text-[#9296A3] hover:text-white"
            title="Refresh Datasource Statuses"
          >
            <span className={`material-symbols-outlined text-[15px] ${isCheckingDatasources ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* Datasource Health Strip */}
      <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[10px] text-[#9296A3] uppercase font-bold">Local Observability Datasources:</span>
          
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ds?.prometheus?.connected ? 'bg-[#50d890]' : 'bg-[#5A5E6B]'}`} />
            <span className="text-white">Prometheus</span>
            <span className="text-[10px] text-[#5A5E6B]">(:9090)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ds?.tempo?.connected ? 'bg-[#50d890]' : 'bg-[#5A5E6B]'}`} />
            <span className="text-white">Tempo</span>
            <span className="text-[10px] text-[#5A5E6B]">(:3200)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ds?.loki?.connected ? 'bg-[#50d890]' : 'bg-[#5A5E6B]'}`} />
            <span className="text-white">Loki</span>
            <span className="text-[10px] text-[#5A5E6B]">(:3100)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ds?.otelCollector?.connected ? 'bg-[#50d890]' : 'bg-[#5A5E6B]'}`} />
            <span className="text-white">OTel Collector</span>
            <span className="text-[10px] text-[#5A5E6B]">(:4318)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ds?.demoServicesGateway?.connected ? 'bg-[#d4ff24]' : 'bg-[#5A5E6B]'}`} />
            <span className="text-white">Demo Mesh</span>
            <span className="text-[10px] text-[#5A5E6B]">(:4001)</span>
          </div>
        </div>

        <div className="text-[11px]">
          {datasourceStatus?.isLiveStackAvailable ? (
            <span className="text-[#50d890] font-bold">✓ Local OTel Stack Online</span>
          ) : (
            <span className="text-[#9296A3]">Local Docker stack offline • Operating in safe fallback</span>
          )}
        </div>
      </div>

      {/* Query Builder Bar */}
      <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9296A3] uppercase">Query:</span>
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveFilterToken(e.target.value);
              }}
              placeholder="Filter by service, method, status code..."
              className="w-full bg-[#030407] border border-[#272a33] focus:border-[#d4ff24] px-3 py-2 rounded text-xs text-white placeholder-[#5A5E6B] focus:outline-none"
            />
          </div>
          <button
            onClick={handleRunQuery}
            disabled={isRunning}
            className="px-4 py-2 rounded bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-all flex items-center gap-1.5 shadow disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-[15px] ${isRunning ? 'animate-spin' : ''}`}>
              search
            </span>
            <span>{isRunning ? 'Executing...' : 'Run Query'}</span>
          </button>
        </div>

        {/* Quick query chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#9296A3]">
          <span className="text-[#5A5E6B]">Presets:</span>
          <button
            onClick={() => setFilterAndQuery('service.name = "payment-service" AND http.status_code >= 500', 'payment-service')}
            className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] hover:text-white"
          >
            Payment 5xx Spikes
          </button>
          <button
            onClick={() => setFilterAndQuery('hikaricp.wait_time_ms > 100', 'hikaricp')}
            className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] hover:text-white"
          >
            Pool Lock Contention
          </button>
          <button
            onClick={() => setFilterAndQuery('service.name = "auth-gateway-v2"', 'auth-gateway')}
            className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] hover:text-white"
          >
            Auth Gateway Spans
          </button>
          <button
            onClick={() => setFilterAndQuery('', '')}
            className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] text-[#d4ff24] hover:underline"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#272a33] text-xs">
        <button
          onClick={() => setActiveTab('traces')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'traces' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Distributed Traces ({filteredTraces.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'logs' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Structured Logs ({filteredLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('metrics')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'metrics' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Time-Series Metrics (PromQL)
        </button>
      </div>

      {/* Tab 1: Traces */}
      {activeTab === 'traces' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
          {/* Traces List (7 cols) */}
          <div className="lg:col-span-7 bg-[#101116] border border-[#272a33] rounded-xl p-3 flex flex-col gap-2">
            <span className="text-[10px] text-[#9296A3] uppercase pb-1 border-b border-[#272a33]">
              Sampled Traces matching query ({filteredTraces.length} results)
            </span>
            {filteredTraces.length === 0 ? (
              <EmptyState
                icon="filter_list_off"
                title="No Traces Matched"
                description={`No distributed traces found for criteria "${query}".`}
                actionText="Clear Filter Query"
                onAction={() => setFilterAndQuery('', '')}
              />
            ) : (
              filteredTraces.map(tr => (
                <div
                  key={tr.id}
                  onClick={() => setSelectedTrace(tr)}
                  className={`p-2.5 rounded border cursor-pointer transition-colors ${
                    selectedTrace?.id === tr.id ? 'bg-[#171920] border-[#d4ff24]' : 'bg-[#030407] border-[#272a33] hover:border-[#3A3E4D]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{tr.service}: {tr.operation}</span>
                    <span className={tr.status === 'error' ? 'text-[#ff5364] font-bold' : 'text-[#50d890]'}>
                      {tr.durationMs}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#9296A3] mt-1">
                    <span>trace_id: {tr.traceId}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${tr.status === 'error' ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#50d890]/20 text-[#50d890]'}`}>
                      {tr.httpStatus ? `HTTP ${tr.httpStatus}` : tr.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Trace Inspector (5 cols) */}
          <div className="lg:col-span-5 bg-[#101116] border border-[#272a33] rounded-xl p-3 flex flex-col gap-2">
            <span className="text-[10px] text-[#9296A3] uppercase pb-1 border-b border-[#272a33]">
              Raw Span JSON Payload
            </span>
            <pre className="bg-[#030407] border border-[#272a33] p-2.5 rounded text-[11px] text-[#e2e2e9] overflow-x-auto max-h-96">
              {JSON.stringify(selectedTrace, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 2: Logs */}
      {activeTab === 'logs' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 flex flex-col gap-2 text-xs">
          <span className="text-[10px] text-[#9296A3] uppercase pb-1 border-b border-[#272a33]">
            Live OTLP Log Stream ({filteredLogs.length} events)
          </span>
          {filteredLogs.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="No Logs Matched"
              description={`No log lines found matching token "${activeFilterToken}".`}
              actionText="Reset Log Filter"
              onAction={() => setFilterAndQuery('', '')}
            />
          ) : (
            <div className="space-y-1.5">
              {filteredLogs.map((log) => (
                <div key={log.id} className="p-2 rounded bg-[#030407] border border-[#272a33] flex items-start gap-2">
                  <span className="text-[#5A5E6B] text-[10px]">{log.timestamp}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    log.level === 'ERROR' ? 'bg-[#93000a] text-[#ffdad6]' :
                    log.level === 'WARN' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#1558C9]/30 text-[#b1c5ff]'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-[#b1c5ff] font-semibold">{log.service}</span>
                  <span className="text-white flex-1">{log.message}</span>
                  <span className="text-[#5A5E6B] text-[10px]">{log.pod}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Metrics */}
      {activeTab === 'metrics' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 flex flex-col gap-3 text-xs">
          <span className="text-[10px] text-[#9296A3] uppercase pb-1 border-b border-[#272a33]">
            PromQL Time-Series Metrics
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded bg-[#030407] border border-[#272a33]">
              <div className="text-white font-semibold mb-1">hikaricp_active_connections&#123;service="payment-service"&#125;</div>
              <div className="text-2xl font-bold text-[#ff5364]">100 / 100 connections</div>
              <div className="text-[10px] text-[#5A5E6B] mt-1">Pool saturation 100% since 14:32 UTC</div>
            </div>
            <div className="p-3 rounded bg-[#030407] border border-[#272a33]">
              <div className="text-white font-semibold mb-1">http_requests_total&#123;status=~"5.."&#125;</div>
              <div className="text-2xl font-bold text-[#ff5364]">760 errors/sec</div>
              <div className="text-[10px] text-[#5A5E6B] mt-1">504 Gateway Timeout spike</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
