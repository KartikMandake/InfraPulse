import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/common/EmptyState';

export const ServiceDetailPage = () => {
  const { serviceId } = useParams();
  const { services, alerts, incidents, rollbackCanary, addToast } = useApp();
  const navigate = useNavigate();

  const service = services.find(s => s.id === serviceId) || services.find(s => s.name === serviceId);

  const [activeTab, setActiveTab] = useState('endpoints');
  const [isSimulatingTraffic, setIsSimulatingTraffic] = useState(false);

  if (!service) {
    return (
      <div className="py-12">
        <EmptyState
          icon="search_off"
          title="Service Not Found"
          description={`The service "${serviceId}" could not be located in the current Kubernetes cluster namespace.`}
          actionText="Back to Services Topology"
          onAction={() => navigate('/services')}
        />
      </div>
    );
  }

  const linkedAlerts = alerts.filter(a => a.serviceId === service.id || a.serviceName === service.name);
  const linkedIncident = incidents.find(i => i.serviceId === service.id && i.status !== 'resolved');

  const simulateTrafficBurst = () => {
    setIsSimulatingTraffic(true);
    addToast({
      type: 'info',
      title: `Injecting Traffic Burst on ${service.name}`,
      description: 'Synthetic 500 RPS load generator active for 1.5s.'
    });
    setTimeout(() => {
      setIsSimulatingTraffic(false);
      addToast({
        type: 'success',
        title: 'Traffic Burst Completed',
        description: 'P99 and saturation curves sampled nominal.'
      });
    }, 1500);
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Back button & Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-[#9296A3]">
        <button
          onClick={() => navigate('/services')}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">arrow_back</span>
          <span>Services & Topology</span>
        </button>
        <span className="text-[#5A5E6B]">/</span>
        <span className="text-white font-bold">{service.name}</span>
      </div>

      {/* Service Header Card */}
      <div className="p-4 bg-[#101116] border border-[#272a33] rounded-xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
            service.status === 'critical' ? 'bg-[#93000a]/20 border-[#ff5364]/40 text-[#ff5364]' :
            service.status === 'degraded' ? 'bg-[#ffb547]/20 border-[#ffb547]/40 text-[#ffb547]' :
            'bg-[#171920] border-[#272a33] text-[#50d890]'
          }`}>
            <span className="material-symbols-outlined text-[24px]">hub</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{service.name}</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                service.status === 'critical' ? 'bg-[#93000a] text-[#ffdad6]' :
                service.status === 'degraded' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#50d890]/20 text-[#50d890]'
              }`}>
                {service.status}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] text-[10px] text-[#9296A3]">
                Tier-{service.tier} • {service.protocol}
              </span>
            </div>
            <p className="text-xs text-[#9296A3] mt-1">
              Namespace: <span className="text-white">{service.namespace}</span> • Cluster: <span className="text-white">prod-k8s-mesh</span> • Region: <span className="text-white">{service.region}</span>
            </p>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {linkedIncident && (
            <button
              onClick={() => navigate(`/incidents/${linkedIncident.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#93000a] text-[#ffdad6] hover:bg-[#b00010] font-semibold transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">troubleshoot</span>
              <span>Investigate {linkedIncident.id}</span>
            </button>
          )}

          {service.id === 'payment-service' && (
            <button
              onClick={() => {
                rollbackCanary('dep-1094');
                navigate('/deployments');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e] transition-colors"
            >
              <span className="material-symbols-outlined text-[15px] text-[#ff5364]">replay</span>
              <span>Rollback Canary #1094</span>
            </button>
          )}

          <button
            onClick={simulateTrafficBurst}
            disabled={isSimulatingTraffic}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] hover:bg-[#e1ff59] font-bold transition-colors disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[15px]">speed</span>
            <span>{isSimulatingTraffic ? 'Injecting 500 RPS...' : 'Inject Traffic Burst'}</span>
          </button>
        </div>
      </div>

      {/* Golden Signals KPI Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[10px]">P99 Latency</span>
            <span className={service.latencyP99 > 150 ? 'text-[#ff5364] font-bold' : 'text-[#50d890]'}>
              {service.latencyP99 > 150 ? '+1,616% surge' : 'Nominal'}
            </span>
          </div>
          <div className={`my-1.5 text-2xl font-bold ${service.latencyP99 > 150 ? 'text-[#ff5364]' : 'text-white'}`}>
            {service.latencyP99}ms
          </div>
          <div className="text-[10px] text-[#5A5E6B]">Nominal baseline: {service.latencyBaseline}ms</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[10px]">Error Rate</span>
            <span className={service.errorRate > 1 ? 'text-[#ff5364] font-bold' : 'text-[#50d890]'}>
              {service.errorRate > 1 ? 'SLO Breached' : 'Within Budget'}
            </span>
          </div>
          <div className={`my-1.5 text-2xl font-bold ${service.errorRate > 1 ? 'text-[#ff5364]' : 'text-white'}`}>
            {service.errorRate}%
          </div>
          <div className="text-[10px] text-[#5A5E6B]">Target: &lt; 0.05%</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[10px]">Throughput</span>
            <span className="text-[#50d890]">Active</span>
          </div>
          <div className="my-1.5 text-2xl font-bold text-white">
            {(service.rps / 1000).toFixed(1)}k <span className="text-xs text-[#9296A3]">rps</span>
          </div>
          <div className="text-[10px] text-[#5A5E6B]">{service.podCount} Pods active in mesh</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#9296A3]">
            <span className="uppercase text-[10px]">Resource Saturation</span>
            <span className={service.cpuPercent > 85 ? 'text-[#ff5364]' : 'text-[#d4ff24]'}>
              CPU: {service.cpuPercent}%
            </span>
          </div>
          <div className="my-1.5 text-2xl font-bold text-white">{service.memoryPercent}% <span className="text-xs text-[#9296A3]">Mem</span></div>
          <div className="text-[10px] text-[#5A5E6B]">eBPF runtime metrics</div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1 border-b border-[#272a33] pt-2 text-xs">
        <button
          onClick={() => setActiveTab('endpoints')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'endpoints' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Endpoints & Routes ({service.endpoints?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('pods')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'pods' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Pod Instances ({service.pods?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'alerts' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Linked Alerts ({linkedAlerts.length})
        </button>
        <button
          onClick={() => setActiveTab('dependencies')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'dependencies' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Dependencies ({service.dependencies?.length || 0})
        </button>
      </div>

      {/* Tab 1: Endpoints */}
      {activeTab === 'endpoints' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md">
          {(!service.endpoints || service.endpoints.length === 0) ? (
            <EmptyState
              title="No Endpoints Configured"
              description="This service does not expose direct HTTP/gRPC ingress routes."
            />
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-[#9296A3] border-b border-[#272a33]">
                  <th className="py-2 px-3">Method & Route</th>
                  <th className="py-2 px-3 text-right">RPS</th>
                  <th className="py-2 px-3 text-right">P50</th>
                  <th className="py-2 px-3 text-right">P99</th>
                  <th className="py-2 px-3 text-right">Error %</th>
                  <th className="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#272a33]/60">
                {service.endpoints.map(ep => (
                  <tr key={ep.id} className="hover:bg-[#171920]">
                    <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        ep.method === 'POST' ? 'bg-[#1558C9]/30 text-[#b1c5ff]' :
                        ep.method === 'GET' ? 'bg-[#22252e] text-[#9296A3]' : 'bg-[#171920] text-[#d4ff24]'
                      }`}>
                        {ep.method}
                      </span>
                      <span>{ep.path}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-white">{(ep.rps / 1000).toFixed(1)}k/s</td>
                    <td className="py-2.5 px-3 text-right text-[#9296A3]">{ep.p50Ms}ms</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${ep.p99Ms > 100 ? 'text-[#ff5364]' : 'text-white'}`}>
                      {ep.p99Ms}ms
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${ep.errorRatePercent > 1 ? 'text-[#ff5364]' : 'text-[#50d890]'}`}>
                      {ep.errorRatePercent}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        ep.status === 'failing' ? 'bg-[#93000a] text-[#ffdad6]' :
                        ep.status === 'degraded' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#50d890]/20 text-[#50d890]'
                      }`}>
                        {ep.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Pod Instances */}
      {activeTab === 'pods' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md space-y-2">
          {service.pods?.map(p => (
            <div key={p.id} className="p-2.5 rounded bg-[#030407] border border-[#272a33] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${p.status === 'Running' ? 'bg-[#50d890]' : 'bg-[#ff5364] animate-pulse'}`} />
                <span className="text-white font-semibold">{p.name}</span>
                <span className="px-1.5 py-0.2 rounded bg-[#171920] text-[#9296A3] text-[10px]">{p.version}</span>
              </div>
              <div className="flex items-center gap-4 text-[#9296A3]">
                <span>CPU: <strong className="text-white">{p.cpuPercent}%</strong></span>
                <span>Mem: <strong className="text-white">{p.memoryPercent}%</strong></span>
                <span>Restarts: <strong className={p.restarts > 0 ? 'text-[#ff5364]' : 'text-white'}>{p.restarts}</strong></span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'Running' ? 'bg-[#50d890]/20 text-[#50d890]' : 'bg-[#93000a] text-[#ffdad6]'}`}>
                  {p.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Alerts */}
      {activeTab === 'alerts' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md space-y-2 text-xs">
          {linkedAlerts.length === 0 ? (
            <EmptyState
              icon="notifications_off"
              title="No Active Alerts"
              description={`There are currently no firing alerts targeting ${service.name}.`}
            />
          ) : (
            linkedAlerts.map(alt => (
              <div key={alt.id} className="p-3 rounded bg-[#030407] border border-[#272a33] flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">{alt.title}</div>
                  <div className="text-[11px] text-[#9296A3] mt-0.5">Threshold: {alt.threshold} • Current: {alt.currentValue}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  alt.severity === 'critical' ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#ffb547]/20 text-[#ffb547]'
                }`}>
                  {alt.severity}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Dependencies */}
      {activeTab === 'dependencies' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md text-xs space-y-3">
          <h3 className="font-bold text-white uppercase text-xs">Downstream Service Call Graph</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {service.dependencies?.map(dep => (
              <div
                key={dep}
                onClick={() => navigate(`/services/${dep}`)}
                className="p-3 rounded bg-[#030407] border border-[#272a33] hover:border-[#d4ff24] cursor-pointer flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#b1c5ff]">account_tree</span>
                  <span className="font-semibold text-white">{dep}</span>
                </div>
                <span className="text-[#9296A3] text-xs">Inspect →</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

