import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

export const SystemOverviewPage = () => {
  const { 
    environment, setEnvironment, 
    timeRange, setTimeRange, 
    incidents, addToast 
  } = useApp();
  const navigate = useNavigate();

  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState(false);

  const activeInc = incidents.find(i => i.status !== 'resolved');

  const triggerDiagnostic = () => {
    setIsDiagnosticRunning(true);
    addToast({
      type: 'info',
      title: 'Diagnostic Sampling Initialized',
      description: 'Sampling 142 microservices across 3 cloud regions.'
    });

    setTimeout(() => {
      setIsDiagnosticRunning(false);
      addToast({
        type: 'success',
        title: 'Diagnostic Run Completed',
        description: 'Cluster health evaluated at 98.6%. 2 anomalous nodes isolated.'
      });
    }, 1200);
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-4 font-mono">
      {/* 1. Page Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-1 border-b border-[#272a33]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-white font-semibold tracking-tight">System Overview</h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#171920] border border-[#272a33]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff24] animate-ping"></span>
              <span className="text-[10px] text-[#d4ff24] uppercase tracking-wider font-medium">
                Realtime Streaming
              </span>
            </div>
            <span className="text-[#5A5E6B] text-xs hidden sm:inline">|</span>
            <span className="text-[#9296A3] text-xs hidden sm:inline">Last telemetry sync 4s ago</span>
          </div>
          <p className="text-xs text-[#9296A3]">
            Continuous cross-cluster observability, automated correlation, and anomaly attribution engine.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Environment Switcher */}
          <div className="flex items-center p-0.5 rounded bg-[#101116] border border-[#272a33]">
            {['Production', 'Staging', 'Canary'].map(env => (
              <button
                key={env}
                onClick={() => setEnvironment(env)}
                className={`px-2.5 py-1 rounded text-[11px] transition-all ${
                  environment === env ? 'bg-[#1558C9] text-white font-semibold' : 'text-[#9296A3] hover:text-white'
                }`}
              >
                {env}
              </button>
            ))}
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center p-0.5 rounded bg-[#101116] border border-[#272a33]">
            {['15m', '1h', '6h', '24h'].map(t => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-2 py-1 rounded text-[11px] transition-all ${
                  timeRange === t ? 'bg-[#22252e] text-white font-semibold' : 'text-[#9296A3] hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Auto-Refresh Toggle */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#101116] border border-[#272a33] text-[#9296A3] text-[11px]">
            <span className="material-symbols-outlined text-[13px] text-[#d4ff24]">autorenew</span>
            <span>10s</span>
          </div>

          {/* Primary Action: Run Diagnostic */}
          <button
            onClick={triggerDiagnostic}
            disabled={isDiagnosticRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#d4ff24] hover:bg-[#e1ff59] text-[#030407] text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-[15px] ${isDiagnosticRunning ? 'animate-spin' : ''}`}>
              bolt
            </span>
            <span>{isDiagnosticRunning ? 'Sampling...' : 'Run Diagnostic'}</span>
          </button>
        </div>
      </div>

      {/* Operational State Banner */}
      {!isBannerDismissed && activeInc && (
        <div className="p-3 rounded-lg bg-[#101116] border border-[#ff5364]/40 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#93000a] text-[#ffdad6] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">warning</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#ff5364] font-semibold">Incident {activeInc.id} Active</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#ff5364] text-[#030407] font-bold uppercase">
                  {activeInc.severity}
                </span>
              </div>
              <span className="text-xs text-[#9296A3] mt-0.5">
                {activeInc.summary}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate(`/incidents/${activeInc.id}`)}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] text-xs font-bold hover:bg-[#e1ff59] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">troubleshoot</span>
              <span>Investigate {activeInc.id}</span>
            </button>
            <button
              onClick={() => setIsBannerDismissed(true)}
              className="p-1.5 rounded bg-[#171920] border border-[#272a33] text-[#9296A3] hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Four Golden Signals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
        {/* Signal 1: Latency */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[11px] font-semibold">Latency Percentiles</span>
            <span className="text-[#ff5364] text-[10px]">+18ms p99 drift</span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-white">
              38.4<span className="text-xs font-normal text-[#9296A3] ml-1">ms (p99)</span>
            </div>
            <div className="flex items-center gap-3 text-[#9296A3] mt-1">
              <span>p50: <strong className="text-white">12.1ms</strong></span>
              <span>p95: <strong className="text-white">28.4ms</strong></span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-[#171920] rounded-full overflow-hidden flex">
            <div className="h-full bg-[#50d890]" style={{ width: '70%' }}></div>
            <div className="h-full bg-[#ffb547]" style={{ width: '20%' }}></div>
            <div className="h-full bg-[#ff5364]" style={{ width: '10%' }}></div>
          </div>
        </div>

        {/* Signal 2: Traffic Throughput */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[11px] font-semibold">Traffic Volume</span>
            <span className="text-[#50d890] text-[10px]">Nominal Peak</span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-white">
              1.84<span className="text-xs font-normal text-[#9296A3] ml-1">M req/sec</span>
            </div>
            <div className="flex items-center gap-3 text-[#9296A3] mt-1">
              <span>HTTP: <strong className="text-white">62%</strong></span>
              <span>gRPC: <strong className="text-white">31%</strong></span>
              <span>Kafka: <strong className="text-white">7%</strong></span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-[#171920] rounded-full overflow-hidden flex">
            <div className="h-full bg-[#1558C9]" style={{ width: '88%' }}></div>
          </div>
        </div>

        {/* Signal 3: Error Rate */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[11px] font-semibold">Mesh Errors (5xx)</span>
            <span className="text-[#ff5364] text-[10px]">Payment Hotspot</span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-[#ff5364]">
              0.042<span className="text-xs font-normal text-[#9296A3] ml-1">%</span>
            </div>
            <div className="flex items-center gap-2 text-[#9296A3] mt-1 truncate">
              <span>504 Gateway Timeout (checkout handoff)</span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-[#171920] rounded-full overflow-hidden flex">
            <div className="h-full bg-[#50d890]" style={{ width: '92%' }}></div>
            <div className="h-full bg-[#ff5364]" style={{ width: '8%' }}></div>
          </div>
        </div>

        {/* Signal 4: Saturation */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[11px] font-semibold">Cluster Saturation</span>
            <span className="text-[#d4ff24] text-[10px]">68.2% avg</span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-white">
              68.2<span className="text-xs font-normal text-[#9296A3] ml-1">% node load</span>
            </div>
            <div className="flex items-center gap-3 text-[#9296A3] mt-1">
              <span>CPU: <strong className="text-white">64%</strong></span>
              <span>Memory: <strong className="text-white">72%</strong></span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-[#171920] rounded-full overflow-hidden flex">
            <div className="h-full bg-[#d4ff24]" style={{ width: '68%' }}></div>
          </div>
        </div>
      </div>

      {/* Multi-Region Global Ingress & Service Topology Health Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
        {/* Regions Card */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-[#272a33]">
            <span className="text-xs font-semibold text-white uppercase">Cloud Region Mesh</span>
            <span className="text-[10px] text-[#9296A3]">3 Active</span>
          </div>
          {[
            { name: 'us-east-1 (N. Virginia)', status: 'Degraded', rps: '1.14M', p99: '412ms', health: 'degraded' },
            { name: 'eu-west-1 (Ireland)', status: 'Nominal', rps: '520k', p99: '28ms', health: 'nominal' },
            { name: 'ap-southeast-1 (Singapore)', status: 'Nominal', rps: '180k', p99: '34ms', health: 'nominal' },
          ].map(r => (
            <div key={r.name} className="p-2 rounded bg-[#030407] border border-[#272a33] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${r.health === 'nominal' ? 'bg-[#50d890]' : 'bg-[#ff5364] animate-pulse'}`} />
                <span className="text-white font-medium">{r.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#9296A3]">{r.rps}</span>
                <span className={r.health === 'nominal' ? 'text-[#50d890]' : 'text-[#ff5364] font-bold'}>{r.p99}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Node Pools Card */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-[#272a33]">
            <span className="text-xs font-semibold text-white uppercase">K8s Node Pool Health</span>
            <span className="text-[10px] text-[#9296A3]">48 Nodes</span>
          </div>
          {[
            { pool: 'pool-compute-c5.4xlarge', count: '24 nodes', cpu: '62%', mem: '71%' },
            { pool: 'pool-memory-r5.2xlarge', count: '16 nodes', cpu: '54%', mem: '84%' },
            { pool: 'pool-ingress-m5.xlarge', count: '8 nodes', cpu: '48%', mem: '52%' },
          ].map(p => (
            <div key={p.pool} className="p-2 rounded bg-[#030407] border border-[#272a33] flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">{p.pool}</span>
                <span className="text-[#9296A3] text-[10px]">{p.count}</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-[#9296A3]">
                <span>CPU: <strong className="text-white">{p.cpu}</strong></span>
                <span>Mem: <strong className="text-white">{p.mem}</strong></span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Triage Shortcuts */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-[#272a33]">
            <span className="text-xs font-semibold text-white uppercase">Operator Triage Actions</span>
            <span className="text-[10px] text-[#d4ff24]">Quick Links</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => navigate('/services/payment-service')}
              className="p-2 rounded bg-[#171920] border border-[#272a33] hover:border-[#3A3E4D] text-left text-white flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#ff5364]">hub</span>
                <span>Inspect payment-service Pods</span>
              </div>
              <span className="material-symbols-outlined text-[14px] text-[#9296A3]">arrow_forward</span>
            </button>
            <button
              onClick={() => navigate('/telemetry')}
              className="p-2 rounded bg-[#171920] border border-[#272a33] hover:border-[#3A3E4D] text-left text-white flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#1558C9]">terminal</span>
                <span>Query Error Spans (OTel)</span>
              </div>
              <span className="material-symbols-outlined text-[14px] text-[#9296A3]">arrow_forward</span>
            </button>
            <button
              onClick={() => navigate('/runbooks')}
              className="p-2 rounded bg-[#171920] border border-[#272a33] hover:border-[#3A3E4D] text-left text-white flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#d4ff24]">play_circle</span>
                <span>Execute Runbook RB-402</span>
              </div>
              <span className="material-symbols-outlined text-[14px] text-[#9296A3]">arrow_forward</span>
            </button>
          </div>
          <div className="text-[10px] text-[#5A5E6B] text-center pt-1">
            Simulated local state engine • 0 external dependencies
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemOverviewPage;

