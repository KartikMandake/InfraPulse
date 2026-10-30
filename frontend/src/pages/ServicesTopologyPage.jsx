import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';

export const ServicesTopologyPage = () => {
  const { services, alerts, deployments } = useApp();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState('graph');
  const [filterHealth, setFilterHealth] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedService, setSelectedService] = useState(services[0] || null);
  const [activeOverlay, setActiveOverlay] = useState('all');

  // Filter services
  const filteredServices = services.filter(s => {
    if (filterHealth !== 'all' && s.status !== filterHealth) return false;
    if (searchFilter.trim() && !s.name.toLowerCase().includes(searchFilter.toLowerCase())) return false;
    return true;
  });

  // Count by status
  const counts = {
    all: services.length,
    nominal: services.filter(s => s.status === 'nominal').length,
    degraded: services.filter(s => s.status === 'degraded').length,
    critical: services.filter(s => s.status === 'critical').length,
  };

  // Node positions on the graph canvas (x, y)
  const nodeLayout = {
    'auth-gateway-v2': { x: 80, y: 160 },
    'checkout-api': { x: 280, y: 160 },
    'cart-service': { x: 280, y: 320 },
    'payment-service': { x: 500, y: 160 },
    'inventory-mesh': { x: 500, y: 320 },
    'ledger-db-proxy': { x: 720, y: 100 },
    'fraud-evaluator': { x: 720, y: 220 },
    'notification-worker': { x: 720, y: 340 },
  };

  // Graph edges (caller / source -> target / dependency)
  const edges = [
    { from: 'auth-gateway-v2', to: 'checkout-api' },
    { from: 'checkout-api', to: 'payment-service' },
    { from: 'checkout-api', to: 'inventory-mesh' },
    { from: 'checkout-api', to: 'cart-service' },
    { from: 'payment-service', to: 'ledger-db-proxy' },
    { from: 'payment-service', to: 'fraud-evaluator' },
    { from: 'checkout-api', to: 'notification-worker' },
  ];

  // Helper to determine downstream callers of selected service (who calls selectedService)
  const downstreamCallers = selectedService
    ? services.filter(s => Array.isArray(s.dependencies) && s.dependencies.includes(selectedService.id)).map(s => s.id)
    : [];

  // Helper to determine upstream callees of selected service (who selectedService calls)
  const upstreamDependencies = selectedService?.dependencies || [];

  // Connected alerts and deployments for currently selected service
  const serviceAlerts = selectedService
    ? alerts.filter(a => a.serviceId === selectedService.id || a.serviceName === selectedService.name)
    : [];

  const serviceDeployments = selectedService
    ? deployments.filter(d => d.serviceName.toLowerCase() === selectedService.id.toLowerCase() || d.serviceName.toLowerCase() === selectedService.name.toLowerCase())
    : [];

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Primary Page Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#d4ff24]">
            <span className="material-symbols-outlined text-[20px]">account_tree</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-semibold tracking-tight">Services & Topology Correlation</h1>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                counts.critical > 0 ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#50d890]/20 text-[#50d890]'
              }`}>
                {counts.critical > 0 ? `Degraded Mesh (${counts.critical} Critical)` : 'Mesh Nominal'}
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Topological service dependency graph, bidirectional causal impact propagation, and live telemetry signals.
            </p>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#030407] rounded border border-[#272a33] p-0.5 text-xs">
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                viewMode === 'graph' ? 'bg-[#1558C9] text-white font-semibold' : 'text-[#9296A3] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">bubble_chart</span>
              <span>Graph</span>
            </button>
            <button
              onClick={() => setViewMode('inventory')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                viewMode === 'inventory' ? 'bg-[#1558C9] text-white font-semibold' : 'text-[#9296A3] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">table_rows</span>
              <span>Inventory</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Highlight Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-sm text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex items-center flex-1 max-w-sm">
            <span className="material-symbols-outlined text-[16px] text-[#9296A3] absolute left-2.5 pointer-events-none">
              filter_alt
            </span>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter services, protocols, trace tags..."
              className="w-full pl-8 pr-3 py-1.5 rounded bg-[#030407] border border-[#272a33] text-white placeholder-[#5A5E6B] font-mono text-xs focus:outline-none focus:border-[#d4ff24]"
            />
          </div>

          {/* Health Filter Chips */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterHealth('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterHealth === 'all' ? 'bg-[#22252e] text-white font-bold border border-[#3A3E4D]' : 'bg-[#030407] text-[#9296A3] border border-[#272a33]'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              onClick={() => setFilterHealth('nominal')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                filterHealth === 'nominal' ? 'bg-[#22252e] text-[#50d890] font-bold border border-[#3A3E4D]' : 'bg-[#030407] text-[#9296A3] border border-[#272a33]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#50d890]"></span>
              Nominal ({counts.nominal})
            </button>
            <button
              onClick={() => setFilterHealth('degraded')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                filterHealth === 'degraded' ? 'bg-[#22252e] text-[#ffb547] font-bold border border-[#3A3E4D]' : 'bg-[#030407] text-[#9296A3] border border-[#272a33]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffb547]"></span>
              Degraded ({counts.degraded})
            </button>
            <button
              onClick={() => setFilterHealth('critical')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                filterHealth === 'critical' ? 'bg-[#93000a] text-[#ffdad6] font-bold' : 'bg-[#030407] text-[#ff5364] border border-[#272a33]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff5364] animate-pulse"></span>
              Critical ({counts.critical})
            </button>
          </div>
        </div>

        {/* Visual Graph Overlays */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9296A3] uppercase">Overlays:</span>
          <button
            onClick={() => setActiveOverlay(activeOverlay === 'unhealthy' ? 'all' : 'unhealthy')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
              activeOverlay === 'unhealthy' ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#030407] border border-[#272a33] text-[#9296A3]'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">report</span>
            <span>Highlight Unhealthy</span>
          </button>
          <button
            onClick={() => setActiveOverlay(activeOverlay === 'cascade' ? 'all' : 'cascade')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-colors ${
              activeOverlay === 'cascade' ? 'bg-[#d4ff24] text-[#030407] font-bold' : 'bg-[#030407] border border-[#272a33] text-[#9296A3]'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">hub</span>
            <span>Downstream Cascade Path</span>
          </button>
          <button
            onClick={() => setActiveOverlay(activeOverlay === 'latency' ? 'all' : 'latency')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-colors ${
              activeOverlay === 'latency' ? 'bg-[#1558C9] text-white font-bold' : 'bg-[#030407] border border-[#272a33] text-[#9296A3]'
            }`}
          >
            <span className="material-symbols-outlined text-[13px] text-[#d4ff24]">bolt</span>
            <span>High Latency (&gt;150ms)</span>
          </button>
        </div>
      </div>

      {/* Main View Area: Graph or Inventory */}
      {filteredServices.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="No Services Match Query"
          description={`No services found with search filter "${searchFilter}".`}
          actionText="Clear Filter"
          onAction={() => {
            setSearchFilter('');
            setFilterHealth('all');
          }}
        />
      ) : viewMode === 'graph' ? (
        <div className="relative flex flex-col lg:flex-row w-full gap-3 items-start">
          {/* Interactive Graph Canvas */}
          <div className="relative flex-1 w-full bg-[#030407] border border-[#272a33] rounded-xl overflow-hidden min-h-[580px] shadow-lg flex flex-col justify-between">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid-dots" width="32" height="32" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="#8f9379" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-dots)" />
              </svg>
            </div>

            {/* Top Legend Bar */}
            <div className="relative z-10 flex flex-wrap items-center justify-between p-3 gap-2 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#101116]/90 backdrop-blur border border-[#272a33] text-xs">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#50d890]"></span><span>Nominal</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#ffb547]"></span><span>Degraded</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#ff5364] animate-pulse"></span><span>Critical</span></div>
                <div className="flex items-center gap-1.5 pl-2 border-l border-[#272a33]"><span className="w-2 h-2 rounded bg-[#d4ff24]"></span><span className="text-[#d4ff24]">Selected / Cascade</span></div>
              </div>
              <div className="pointer-events-auto text-[11px] text-[#9296A3] bg-[#101116]/80 px-2.5 py-1 rounded border border-[#272a33]">
                Click node to trace causal downstream dependencies & live metrics
              </div>
            </div>

            {/* Graph Canvas SVG (Edges) + Interactive HTML Nodes */}
            <div className="relative flex-1 w-full min-h-[460px] overflow-x-auto">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: '850px', minHeight: '460px' }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3A3E4D" />
                  </marker>
                  <marker id="arrow-error" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff5364" />
                  </marker>
                  <marker id="arrow-cascade" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#d4ff24" />
                  </marker>
                </defs>
                {edges.map((edge, idx) => {
                  const s = nodeLayout[edge.from];
                  const t = nodeLayout[edge.to];
                  if (!s || !t) return null;

                  const isSelectedPath = selectedService && (
                    (edge.from === selectedService.id && upstreamDependencies.includes(edge.to)) ||
                    (edge.to === selectedService.id && downstreamCallers.includes(edge.from))
                  );

                  const isDegraded = edge.to === 'payment-service' || edge.to === 'ledger-db-proxy';

                  let strokeColor = '#272a33';
                  let strokeWidth = '1.5';
                  let strokeDash = 'none';
                  let marker = 'url(#arrow)';

                  if (isSelectedPath) {
                    strokeColor = '#d4ff24';
                    strokeWidth = '2.5';
                    marker = 'url(#arrow-cascade)';
                  } else if (isDegraded) {
                    strokeColor = '#ff5364';
                    strokeWidth = '2';
                    strokeDash = '4 2';
                    marker = 'url(#arrow-error)';
                  }

                  return (
                    <g key={idx}>
                      <line
                        x1={s.x + 90}
                        y1={s.y + 35}
                        x2={t.x}
                        y2={t.y + 35}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDash}
                        markerEnd={marker}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Service Node Cards */}
              {filteredServices.map(svc => {
                const pos = nodeLayout[svc.id] || { x: 400, y: 200 };
                const isSelected = selectedService?.id === svc.id;
                const isDownstream = downstreamCallers.includes(svc.id);
                const isUpstream = upstreamDependencies.includes(svc.id);

                const isHighlighted = activeOverlay === 'unhealthy' ? svc.status !== 'nominal' :
                                      activeOverlay === 'latency' ? svc.latencyP99 > 150 :
                                      activeOverlay === 'cascade' ? (isSelected || isDownstream) : true;

                return (
                  <div
                    key={svc.id}
                    onClick={() => setSelectedService(svc)}
                    style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
                    className={`absolute w-44 p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                      isSelected
                        ? 'bg-[#171920] border-[#d4ff24] shadow-[0_0_14px_rgba(212,255,36,0.3)] ring-2 ring-[#d4ff24] z-20'
                        : isDownstream
                        ? 'bg-[#171920] border-[#ffb547] ring-1 ring-[#ffb547]/60 z-10'
                        : isUpstream
                        ? 'bg-[#171920] border-[#b1c5ff] ring-1 ring-[#b1c5ff]/40'
                        : isHighlighted
                        ? 'bg-[#101116] border-[#3A3E4D] hover:border-white'
                        : 'bg-[#101116]/60 border-[#272a33] opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#272a33]">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          svc.status === 'critical' ? 'bg-[#ff5364] animate-pulse' :
                          svc.status === 'degraded' ? 'bg-[#ffb547]' : 'bg-[#50d890]'
                        }`} />
                        <span className="text-[11px] text-[#9296A3] uppercase">Tier-{svc.tier}</span>
                      </div>
                      {isDownstream ? (
                        <span className="text-[8px] px-1 rounded bg-[#ffb547]/20 text-[#ffb547] font-bold">
                          CALLER
                        </span>
                      ) : isUpstream ? (
                        <span className="text-[8px] px-1 rounded bg-[#1558c9]/30 text-[#b1c5ff] font-bold">
                          DEP
                        </span>
                      ) : (
                        <span className="text-[9px] px-1 rounded bg-[#030407] text-[#9296A3] border border-[#272a33]">
                          {svc.protocol}
                        </span>
                      )}
                    </div>

                    <div className="font-semibold text-xs text-white truncate" title={svc.name}>
                      {svc.name}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[10px]">
                      <span className={svc.latencyP99 > 150 ? 'text-[#ff5364] font-bold' : 'text-[#9296A3]'}>
                        p99: {svc.latencyP99}ms
                      </span>
                      <span className={svc.errorRate > 1 ? 'text-[#ff5364] font-bold' : 'text-[#50d890]'}>
                        err: {svc.errorRate}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Status Ticker */}
            <div className="relative z-10 p-2.5 bg-[#101116] border-t border-[#272a33] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9296A3]">
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold">Active Mesh:</span>
                <span>{filteredServices.length} Nodes visible</span>
                <span>•</span>
                <span>{edges.length} Dependency edges mapped</span>
              </div>
              <span className="text-[#d4ff24]">Topological Correlation Active</span>
            </div>
          </div>

          {/* Right Inspection Drawer for Selected Service */}
          {selectedService && (
            <div className="w-full lg:w-88 bg-[#101116] border border-[#272a33] rounded-xl p-3 flex flex-col gap-3 shadow-xl text-xs">
              <div className="flex items-start justify-between border-b border-[#272a33] pb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      selectedService.status === 'critical' ? 'bg-[#ff5364] animate-pulse' :
                      selectedService.status === 'degraded' ? 'bg-[#ffb547]' : 'bg-[#50d890]'
                    }`} />
                    <h3 className="text-sm font-bold text-white">{selectedService.name}</h3>
                  </div>
                  <span className="text-[10px] text-[#9296A3]">
                    Tier-{selectedService.tier} • {selectedService.namespace} • {selectedService.region}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/services/${selectedService.id}`)}
                  className="px-2.5 py-1 rounded bg-[#1558C9] text-white text-[11px] font-semibold hover:bg-[#124ab0] transition-colors"
                >
                  Deep Dive →
                </button>
              </div>

              {/* Golden Signals Mini */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-[#030407] border border-[#272a33]">
                  <div className="text-[10px] text-[#9296A3] uppercase">P99 Latency</div>
                  <div className={`text-base font-bold ${selectedService.latencyP99 > 150 ? 'text-[#ff5364]' : 'text-white'}`}>
                    {selectedService.latencyP99}ms
                  </div>
                  <div className="text-[9px] text-[#5A5E6B]">baseline: {selectedService.latencyBaseline}ms</div>
                </div>

                <div className="p-2 rounded bg-[#030407] border border-[#272a33]">
                  <div className="text-[10px] text-[#9296A3] uppercase">Error Rate</div>
                  <div className={`text-base font-bold ${selectedService.errorRate > 1 ? 'text-[#ff5364]' : 'text-[#50d890]'}`}>
                    {selectedService.errorRate}%
                  </div>
                  <div className="text-[9px] text-[#5A5E6B]">target: &lt;0.05%</div>
                </div>

                <div className="p-2 rounded bg-[#030407] border border-[#272a33]">
                  <div className="text-[10px] text-[#9296A3] uppercase">Throughput</div>
                  <div className="text-base font-bold text-white">{(selectedService.rps / 1000).toFixed(1)}k/s</div>
                  <div className="text-[9px] text-[#5A5E6B]">{selectedService.podCount} Pods Active</div>
                </div>

                <div className="p-2 rounded bg-[#030407] border border-[#272a33]">
                  <div className="text-[10px] text-[#9296A3] uppercase">CPU / Memory</div>
                  <div className="text-base font-bold text-white">{selectedService.cpuPercent}%</div>
                  <div className="text-[9px] text-[#5A5E6B]">Memory: {selectedService.memoryPercent}%</div>
                </div>
              </div>

              {/* Topological Call Graph Relationships */}
              <div className="space-y-2 p-2.5 rounded bg-[#030407] border border-[#272a33]">
                <div className="flex items-center justify-between text-[11px] font-bold text-white border-b border-[#272a33] pb-1">
                  <span>Topological Call Neighbors</span>
                  <span className="text-[#d4ff24] text-[10px]">Graph Edge Trace</span>
                </div>

                <div>
                  <span className="text-[10px] text-[#ffb547] font-semibold block mb-1">
                    Direct Downstream Callers ({downstreamCallers.length}) [Clients]:
                  </span>
                  {downstreamCallers.length === 0 ? (
                    <span className="text-[10px] text-[#5A5E6B]">No direct caller dependencies</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {downstreamCallers.map(callerId => (
                        <button
                          key={callerId}
                          onClick={() => {
                            const found = services.find(s => s.id === callerId);
                            if (found) setSelectedService(found);
                          }}
                          className="px-2 py-0.5 rounded bg-[#171920] border border-[#ffb547]/40 text-[#ffb547] text-[10px] hover:border-[#ffb547]"
                        >
                          ← {callerId}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-[#b1c5ff] font-semibold block mb-1">
                    Upstream Dependencies ({upstreamDependencies.length}) [Servers]:
                  </span>
                  {upstreamDependencies.length === 0 ? (
                    <span className="text-[10px] text-[#5A5E6B]">Leaf service (no dependencies)</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {upstreamDependencies.map(depId => (
                        <button
                          key={depId}
                          onClick={() => {
                            const found = services.find(s => s.id === depId);
                            if (found) setSelectedService(found);
                          }}
                          className="px-2 py-0.5 rounded bg-[#171920] border border-[#1558C9] text-[#b1c5ff] text-[10px] hover:border-[#d4ff24]"
                        >
                          → {depId}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Connected Alerts */}
              {serviceAlerts.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase text-[#ff5364] font-bold">
                    Active Firing Alerts ({serviceAlerts.length})
                  </span>
                  {serviceAlerts.map(alt => (
                    <div key={alt.id} className="p-1.5 rounded bg-[#030407] border border-[#ff5364]/40 flex items-center justify-between text-[10px]">
                      <span className="text-white truncate font-medium">{alt.title}</span>
                      <span className="text-[#ff5364] font-bold">{alt.currentValue}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Deployments */}
              {serviceDeployments.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase text-[#b1c5ff] font-bold">
                    Recent Git Deployments ({serviceDeployments.length})
                  </span>
                  {serviceDeployments.map(dep => (
                    <div key={dep.id} className="p-1.5 rounded bg-[#030407] border border-[#272a33] text-[10px] space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-bold">{dep.version} ({dep.environment})</span>
                        <span className="text-[#d4ff24] font-mono">{dep.commitSha}</span>
                      </div>
                      <div className="text-[#9296A3] truncate">{dep.commitMessage}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Inventory Table View */
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-[10px] text-[#9296A3] uppercase border-b border-[#272a33]">
                  <th className="py-2 px-3">Service Name</th>
                  <th className="py-2 px-3">Tier</th>
                  <th className="py-2 px-3">Protocol</th>
                  <th className="py-2 px-3">Namespace</th>
                  <th className="py-2 px-3 text-right">Throughput</th>
                  <th className="py-2 px-3 text-right">P99 Latency</th>
                  <th className="py-2 px-3 text-right">Error Rate</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#272a33]/60">
                {filteredServices.map(svc => (
                  <tr key={svc.id} className="hover:bg-[#171920] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        svc.status === 'critical' ? 'bg-[#ff5364] animate-pulse' :
                        svc.status === 'degraded' ? 'bg-[#ffb547]' : 'bg-[#50d890]'
                      }`} />
                      <span>{svc.name}</span>
                    </td>
                    <td className="py-2.5 px-3 text-[#9296A3]">Tier-{svc.tier}</td>
                    <td className="py-2.5 px-3 text-[#9296A3]">{svc.protocol}</td>
                    <td className="py-2.5 px-3 text-[#9296A3]">{svc.namespace}</td>
                    <td className="py-2.5 px-3 text-right text-white">{(svc.rps / 1000).toFixed(1)}k/s</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${svc.latencyP99 > 150 ? 'text-[#ff5364]' : 'text-white'}`}>
                      {svc.latencyP99}ms
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${svc.errorRate > 1 ? 'text-[#ff5364]' : 'text-[#50d890]'}`}>
                      {svc.errorRate}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                        svc.status === 'critical' ? 'bg-[#93000a] text-[#ffdad6]' :
                        svc.status === 'degraded' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#50d890]/20 text-[#50d890]'
                      }`}>
                        {svc.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => navigate(`/services/${svc.id}`)}
                        className="px-2.5 py-1 rounded bg-[#171920] border border-[#272a33] text-white hover:border-[#3A3E4D] text-xs transition-colors"
                      >
                        Deep Dive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesTopologyPage;
