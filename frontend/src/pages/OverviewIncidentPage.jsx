import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';

export const OverviewIncidentPage = () => {
  const { 
    services, incidents, rollbackCanary, 
    setIsAiHypothesisOpen, telemetryLogs,
    mitigateIncident 
  } = useApp();
  const navigate = useNavigate();

  const [activeRegionFilter, setActiveRegionFilter] = useState('All Regions');
  const [activeTierFilter, setActiveTierFilter] = useState('All');
  const [activeProtocolFilter, setActiveProtocolFilter] = useState('All');

  // Filtered services
  const displayedServices = services.filter(s => {
    if (activeTierFilter === 'Tier-0' && s.tier !== 0) return false;
    if (activeTierFilter === 'Tier-1' && s.tier !== 1) return false;
    if (activeProtocolFilter !== 'All' && s.protocol !== activeProtocolFilter) return false;
    return true;
  });

  const activeIncidents = incidents.filter(i => i.status !== 'resolved');

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-sans">
      {/* Executive Header & Quick Filter Ribbons */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#d4ff24] shadow-[0_0_8px_#d4ff24]"></span>
              <h1 className="text-xl text-white font-semibold tracking-tight">System Health & Incident Intelligence</h1>
              <span className="px-2 py-0.5 rounded bg-[#171920] text-xs font-mono text-[#9296A3] border border-[#272a33]">
                SLO TARGET: 99.95%
              </span>
            </div>
            <p className="text-xs text-[#9296A3] mt-0.5">
              Monitoring 142 microservices across 3 cloud regions • 1.84M req/sec telemetry pipeline • Continuous anomaly baseline
            </p>
          </div>

          {/* Quick Filter Ribbons */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            <div className="flex items-center bg-[#101116] p-0.5 rounded border border-[#272a33]">
              {['All Regions', 'us-east-1', 'eu-west-1'].map(r => (
                <button
                  key={r}
                  onClick={() => setActiveRegionFilter(r)}
                  className={`px-2.5 py-1 rounded text-[11px] uppercase font-semibold transition-colors ${
                    activeRegionFilter === r ? 'bg-[#22252e] text-white shadow-sm' : 'text-[#9296A3] hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-[#272a33]"></div>

            <div className="flex items-center bg-[#101116] p-0.5 rounded border border-[#272a33]">
              {['All', 'Tier-0', 'Tier-1'].map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTierFilter(t)}
                  className={`px-2.5 py-1 rounded text-[11px] uppercase font-semibold transition-colors ${
                    activeTierFilter === t ? 'bg-[#22252e] text-white' : 'text-[#9296A3] hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-[#272a33]"></div>

            <div className="flex items-center bg-[#101116] p-0.5 rounded border border-[#272a33]">
              {['All', 'gRPC', 'HTTP', 'Kafka'].map(p => (
                <button
                  key={p}
                  onClick={() => setActiveProtocolFilter(p)}
                  className={`px-2.5 py-1 rounded text-[11px] uppercase font-semibold transition-colors ${
                    activeProtocolFilter === p ? 'bg-[#22252e] text-white' : 'text-[#9296A3] hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI Root-Cause Urgent Intelligence Strip */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#d4ff24] shadow-[0_0_12px_#d4ff24]"></div>
          <div className="flex items-start lg:items-center gap-3 pl-2">
            <div className="p-1.5 rounded-lg bg-[#171920] text-[#d4ff24] flex items-center justify-center shrink-0 border border-[#272a33]">
              <span className="material-symbols-outlined text-[20px]">psychology</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-[#93000a] text-[#ffdad6] font-mono font-semibold uppercase tracking-wider text-[10px]">
                AI Root Cause Spike
              </span>
              <span className="text-white font-medium">
                Anomaly in <code className="font-mono text-[#d4ff24] px-1 py-0.5 rounded bg-[#171920] border border-[#272a33]">auth-gateway-v2 & payment-service</code>
              </span>
              <span className="text-[#5A5E6B] hidden md:inline">•</span>
              <span className="text-[#9296A3]">
                p99 latency spike to <span className="text-[#ff5364] font-medium font-mono">412ms</span> correlated with Canary Deploy <span className="font-mono text-white">#1094</span> at <span className="font-mono text-white">14:22 UTC</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-2 lg:pl-0 shrink-0">
            <button
              onClick={() => setIsAiHypothesisOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] text-xs font-semibold hover:bg-[#e1ff59] transition-all shadow-[0_0_10px_rgba(212,255,36,0.25)]"
            >
              <span className="material-symbols-outlined text-[16px]">troubleshoot</span>
              <span>Inspect Hypothesis (94% Conf.)</span>
            </button>
            <button
              onClick={() => rollbackCanary('dep-1094')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white text-xs hover:bg-[#22252e] transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-[#ff5364]">replay</span>
              <span>Rollback Canary</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Operational KPI Grid (5 metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {/* Metric 1: P99 Latency */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between hover:border-[#3A3E4D] transition-all">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span className="uppercase tracking-wider text-[10px] font-semibold font-mono">P99 Mesh Latency</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#93000a] text-[#ffdad6] font-mono font-medium">+12.3%</span>
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">38.4<span className="text-xs font-normal text-[#9296A3] ml-1">ms</span></span>
            <span className="text-[11px] text-[#9296A3] font-mono">baseline: 34.2ms</span>
          </div>
          <div className="h-6 w-full flex items-end">
            <svg className="w-full h-5 overflow-visible" fill="none" viewBox="0 0 160 28">
              <path d="M0 22 L20 20 L40 21 L60 17 L80 18 L100 14 L120 16 L140 7 L160 3" stroke="#b1c5ff" strokeLinecap="round" strokeWidth="1.75"></path>
              <circle cx="160" cy="3" fill="#ff5364" r="2.5"></circle>
            </svg>
          </div>
        </div>

        {/* Metric 2: Global Error Rate */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between hover:border-[#3A3E4D] transition-all">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span className="uppercase tracking-wider text-[10px] font-semibold font-mono">Global Error Rate</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#171920] text-[#d4ff24] font-mono font-medium border border-[#272a33]">SLO OK</span>
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">0.042<span className="text-xs font-normal text-[#9296A3] ml-1">%</span></span>
            <span className="text-[11px] text-[#9296A3] font-mono">budget: 0.050%</span>
          </div>
          <div className="h-6 w-full flex items-end gap-1">
            <div className="h-2 w-full bg-[#171920] rounded-sm overflow-hidden flex">
              <div className="h-full bg-[#d4ff24]" style={{ width: '84%' }}></div>
              <div className="h-full bg-[#ff5364]" style={{ width: '16%' }}></div>
            </div>
          </div>
        </div>

        {/* Metric 3: Active Incidents */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between hover:border-[#3A3E4D] transition-all cursor-pointer" onClick={() => navigate('/incidents')}>
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span className="uppercase tracking-wider text-[10px] font-semibold font-mono">Active Incidents</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#ff5364] text-[#030407] font-mono font-bold tracking-tight">
              {activeIncidents.length} ACTIVE
            </span>
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">{activeIncidents.length}<span className="text-xs font-normal text-[#9296A3] ml-1">total</span></span>
            <span className="text-[11px] text-[#ff5364] font-mono">INC-4921 active</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#9296A3]">
            <span className="w-2 h-2 rounded-full bg-[#ff5364] animate-pulse"></span>
            <span className="truncate font-mono text-[11px]">checkout-api (504s)</span>
          </div>
        </div>

        {/* Metric 4: Mesh Apdex Score */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between hover:border-[#3A3E4D] transition-all">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span className="uppercase tracking-wider text-[10px] font-semibold font-mono">Mesh Apdex (T=100ms)</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#171920] text-[#d4ff24] font-mono border border-[#272a33]">99.4% SAT</span>
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">0.994</span>
            <span className="text-[11px] text-[#9296A3] font-mono">4.2B spans/day</span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#9296A3]">
            <span className="text-[#d4ff24]">T: 98.7%</span>
            <span className="text-[#9296A3]">F: 0.9%</span>
            <span className="text-[#ff5364]">U: 0.4%</span>
          </div>
        </div>

        {/* Metric 5: OTel Telemetry Ingestion */}
        <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl flex flex-col justify-between hover:border-[#3A3E4D] transition-all">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span className="uppercase tracking-wider text-[10px] font-semibold font-mono">OTel Ingestion</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#171920] text-white font-mono border border-[#272a33]">0 drop</span>
          </div>
          <div className="my-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">942<span className="text-xs font-normal text-[#9296A3] ml-1">k spans/s</span></span>
            <span className="text-[11px] text-[#9296A3] font-mono">48 collector pods</span>
          </div>
          <div className="flex items-center gap-1 text-[#9296A3]">
            <div className="h-1.5 flex-1 bg-[#1558C9] rounded-sm"></div>
            <div className="h-1.5 flex-1 bg-[#1558C9] rounded-sm"></div>
            <div className="h-1.5 flex-1 bg-[#1558C9] rounded-sm"></div>
            <div className="h-1.5 flex-1 bg-[#d4ff24] rounded-sm"></div>
          </div>
        </div>
      </div>

      {/* Deep Telemetry & Incident Intelligence Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* LEFT COLUMN: Latency Waterfall Chart & Services Matrix (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {/* Chart Panel */}
          <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl shadow-sm flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#b1c5ff]">stacked_line_chart</span>
                <div>
                  <h2 className="text-xs uppercase tracking-wider text-white font-semibold">Global Throughput & Multi-Tier Latency Waterfall</h2>
                  <span className="text-[11px] text-[#9296A3] font-mono">Correlated with Production Deployments & Canary Windows</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-[#9296A3]">
                <div className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#d4ff24]"></span><span className="text-white">p99</span></div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#b1c5ff]"></span><span className="text-white">p95</span></div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#5b6573]"></span><span className="text-white">p50</span></div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2 bg-[#1558C9]/40 rounded-sm"></span><span>Throughput</span></div>
              </div>
            </div>

            {/* SVG Telemetry Waterfall */}
            <div className="relative w-full h-52 bg-[#030407] border border-[#272a33] rounded p-2 overflow-hidden select-none">
              <div className="absolute inset-x-0 top-6 h-px bg-[#272a33]/40"></div>
              <div className="absolute inset-x-0 top-18 h-px bg-[#272a33]/40"></div>
              <div className="absolute inset-x-0 top-32 h-px bg-[#272a33]/40"></div>
              <div className="absolute left-2 top-2 text-[10px] text-[#5A5E6B] font-mono">500ms</div>
              <div className="absolute left-2 top-20 text-[10px] text-[#5A5E6B] font-mono">200ms</div>
              <div className="absolute left-2 bottom-1 text-[10px] text-[#5A5E6B] font-mono">0ms</div>
              <div className="absolute right-2 top-2 text-[10px] text-[#5A5E6B] font-mono">2.2M rps</div>

              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 700 200">
                <g fill="#1558C9" opacity="0.3">
                  {[20, 44, 68, 92, 116, 140, 164, 188, 212, 236, 260, 284, 308, 332, 356, 380, 404, 428, 452, 476, 500, 524, 548, 572, 596, 620, 644, 668].map((x, idx) => (
                    <rect key={x} x={x} y={60 + (idx % 7) * 8} width="16" height={130 - (idx % 7) * 8} rx="1" />
                  ))}
                </g>
                <path d="M 20 162 Q 180 160 300 158 T 460 156 T 700 155" fill="none" stroke="#5b6573" strokeDasharray="3 3" strokeWidth="1.5" />
                <path d="M 20 148 Q 120 146 220 142 T 380 138 T 450 115 T 520 110 T 620 135 T 700 132" fill="none" stroke="#b1c5ff" strokeWidth="2" />
                <path d="M 20 135 L 140 132 L 260 128 L 360 125 L 430 118 L 470 34 L 510 42 L 560 62 L 620 120 L 700 115" fill="none" stroke="#d4ff24" strokeWidth="2.5" />
                <circle cx="470" cy="34" fill="#d4ff24" r="4" stroke="#030407" strokeWidth="2" />
                <line x1="450" y1="10" x2="450" y2="190" stroke="#d4ff24" strokeDasharray="4 2" strokeWidth="1.5" opacity="0.8" />
              </svg>

              <div className="absolute left-[62%] top-3 -translate-x-1/2 bg-[#171920] border border-[#272a33] px-2 py-0.5 rounded shadow flex items-center gap-1.5 pointer-events-none text-[11px] font-mono">
                <span className="material-symbols-outlined text-[13px] text-[#d4ff24]">deployed_code</span>
                <span className="text-white font-medium">Deploy: v1.8.3</span>
              </div>
              <div className="absolute left-[65%] top-12 -translate-x-1/2 bg-[#22252e] border border-[#3A3E4D] px-2 py-0.5 rounded shadow pointer-events-none text-[11px] font-mono text-[#d4ff24] font-semibold">
                p99: 412.8ms
              </div>
            </div>

            <div className="flex items-center justify-between pt-1.5 text-[10px] text-[#9296A3] font-mono">
              <span>14:00 UTC</span>
              <span>14:10 UTC</span>
              <span className="text-[#d4ff24]">14:22 UTC (Deploy Event)</span>
              <span>14:30 UTC</span>
              <span className="text-white">14:40 UTC (Live)</span>
            </div>
          </div>

          {/* Critical Mesh Services Health Matrix Table */}
          <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#272a33]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[17px] text-[#d4ff24]">hub</span>
                <h2 className="text-xs uppercase tracking-wider text-white font-semibold">Critical Mesh Services Health Matrix</h2>
              </div>
              <span className="text-[11px] text-[#9296A3] font-mono">{displayedServices.length} prioritized</span>
            </div>

            {displayedServices.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  title="No Services Found"
                  description="No services matched the selected region, tier, or protocol filters."
                  actionText="Reset Filters"
                  onAction={() => {
                    setActiveRegionFilter('All Regions');
                    setActiveTierFilter('All');
                    setActiveProtocolFilter('All');
                  }}
                />
              </div>
            ) : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase font-mono text-[#9296A3] border-b border-[#272a33]">
                      <th className="py-1.5 px-2">Service</th>
                      <th className="py-1.5 px-2">Proto</th>
                      <th className="py-1.5 px-2 text-right">RPS</th>
                      <th className="py-1.5 px-2 text-right">P99</th>
                      <th className="py-1.5 px-2 text-right">Error %</th>
                      <th className="py-1.5 px-2 text-center">Status</th>
                      <th className="py-1.5 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono text-xs">
                    {displayedServices.map(svc => (
                      <tr key={svc.id} className="hover:bg-[#171920]/80 transition-colors">
                        <td className="py-2 px-2 font-medium text-white flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            svc.status === 'critical' ? 'bg-[#ff5364] animate-pulse' :
                            svc.status === 'degraded' ? 'bg-[#ffb547]' : 'bg-[#50d890]'
                          }`} />
                          <span>{svc.name}</span>
                        </td>
                        <td className="py-2 px-2 text-[#9296A3]">{svc.protocol}</td>
                        <td className="py-2 px-2 text-right text-white">{(svc.rps / 1000).toFixed(1)}k/s</td>
                        <td className={`py-2 px-2 text-right font-semibold ${svc.latencyP99 > 100 ? 'text-[#ff5364]' : 'text-white'}`}>
                          {svc.latencyP99}ms
                        </td>
                        <td className={`py-2 px-2 text-right font-semibold ${svc.errorRate > 1 ? 'text-[#ff5364]' : 'text-[#50d890]'}`}>
                          {svc.errorRate.toFixed(2)}%
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                            svc.status === 'critical' ? 'bg-[#93000a] text-[#ffdad6]' :
                            svc.status === 'degraded' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#50d890]/20 text-[#50d890]'
                          }`}>
                            {svc.status}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={() => navigate(`/services/${svc.id}`)}
                            className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] text-[10px] text-[#9296A3] hover:text-white hover:border-[#3A3E4D] transition-colors"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: AI Incident Queue & Live Telemetry Stream (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Active Incident Intelligence Queue */}
          <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#272a33]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[17px] text-[#ff5364]">warning</span>
                <h2 className="text-xs uppercase tracking-wider text-white font-semibold">Incident Intelligence Queue</h2>
              </div>
              <span className="px-1.5 py-0.2 rounded bg-[#93000a] text-[#ffdad6] font-mono text-[10px] font-bold">
                {activeIncidents.length} OPEN
              </span>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              {incidents.map(inc => (
                <div 
                  key={inc.id}
                  className={`p-2.5 rounded border transition-all ${
                    inc.severity === 'SEV-1' ? 'bg-[#171920] border-[#3A3E4D]' : 'bg-[#101116] border-[#272a33]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                        inc.severity === 'SEV-1' ? 'bg-[#ff5364] text-[#030407]' :
                        inc.severity === 'SEV-2' ? 'bg-[#ffb547] text-[#030407]' : 'bg-[#1558c9] text-white'
                      }`}>
                        {inc.id}
                      </span>
                      <span className="text-xs text-white font-semibold truncate">{inc.title}</span>
                    </div>
                    <span className="font-mono text-[10px] text-[#ff5364] font-bold shrink-0">{inc.severity}</span>
                  </div>

                  <p className="text-[11px] text-[#9296A3] mt-1 line-clamp-2 leading-relaxed font-mono">
                    {inc.summary}
                  </p>

                  {/* AI Copilot cardlet inside active incident */}
                  {inc.status !== 'resolved' && (
                    <div className="bg-[#030407] border border-[#272a33] p-2 rounded mt-2 flex flex-col gap-1 text-[11px]">
                      <div className="flex items-center justify-between text-[#d4ff24] font-mono">
                        <span className="flex items-center gap-1 font-semibold">
                          <span className="material-symbols-outlined text-[13px]">psychology</span>
                          AI Copilot Attribution
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#171920] border border-[#272a33]">
                          {inc.aiConfidencePercent}% Confidence
                        </span>
                      </div>
                      <p className="text-[#e2e2e9] font-mono text-[11px] leading-tight">
                        {inc.aiHypothesis}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between text-xs font-mono">
                    <button
                      onClick={() => navigate(`/incidents/${inc.id}`)}
                      className="flex items-center gap-1 text-[11px] text-[#b1c5ff] hover:underline"
                    >
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      <span>Investigate in War Room</span>
                    </button>
                    {inc.status !== 'resolved' ? (
                      <button
                        onClick={() => mitigateIncident(inc.id)}
                        className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] text-[10px] text-[#ffb547] hover:bg-[#22252e]"
                      >
                        Mitigate
                      </button>
                    ) : (
                      <span className="text-[10px] text-[#50d890] font-bold">RESOLVED</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Telemetry Anomaly Stream */}
          <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl shadow-sm flex flex-col flex-1">
            <div className="flex items-center justify-between pb-2 border-b border-[#272a33]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[17px] text-[#d4ff24]">terminal</span>
                <h2 className="text-xs uppercase tracking-wider text-white font-semibold">Live Telemetry Anomaly Stream</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff24] animate-ping"></span>
                <span className="text-[10px] text-[#9296A3] font-mono">100 spans/sec</span>
              </div>
            </div>

            <div className="flex-1 bg-[#030407] border border-[#272a33] rounded p-2 font-mono text-[11px] mt-2 overflow-y-auto max-h-56 space-y-1.5">
              {telemetryLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 hover:bg-[#171920] p-1 rounded transition-colors">
                  <span className="text-[#5A5E6B] shrink-0 text-[10px]">{log.timestamp}</span>
                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                    log.level === 'ERROR' ? 'bg-[#93000a] text-[#ffdad6]' :
                    log.level === 'WARN' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#1558C9]/30 text-[#b1c5ff]'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-[#b1c5ff] shrink-0 text-[10px] font-semibold">{log.service}</span>
                  <span className="text-[#e2e2e9] truncate text-[10px]">{log.message}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 pt-1 flex items-center justify-between text-[#9296A3] font-mono text-[11px]">
              <span>Filter: <span className="text-white">severity &gt;= WARN</span></span>
              <button 
                onClick={() => navigate('/telemetry')}
                className="text-[#d4ff24] hover:underline flex items-center gap-1"
              >
                <span>Open in Telemetry Explorer</span>
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewIncidentPage;

