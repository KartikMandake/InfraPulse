/**
 * Autonomous SRE Intelligence Dashboard — InfraPulse Phase 23K
 * 
 * Provides proactive operational intelligence:
 * - Unified Infrastructure & Service Health (with explicit freshness and data gap disclosures)
 * - Predictive Risk Forecasting (OLS regression slopes, time-to-exhaustion horizons)
 * - SLO and Multi-Window Error Budget Tracking
 * - Capacity & Cost Waste Optimization
 * - Governed SRE Operational Recommendations
 */

import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export const SREIntelligencePage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'predictive' | 'slos' | 'capacity' | 'recommendations'

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Data states
  const [overview, setOverview] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [overviewRes, recsRes] = await Promise.all([
          api.getSreOverview(),
          api.getSreRecommendations()
        ]);

        if (mounted) {
          setOverview(overviewRes?.data || null);
          setRecommendations(recsRes?.data || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || 'Failed to load SRE Intelligence data.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => { mounted = false; };
  }, [refreshTrigger]);

  const handleUpdateRecStatus = async (id, status) => {
    try {
      await api.updateSreRecommendationStatus(id, {
        status,
        resolutionNotes: `Status changed to ${status} via SRE Console.`
      });
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      alert(`Failed to update recommendation: ${err.message}`);
    }
  };

  const health = overview?.health;
  const sloData = overview?.sloOverview;
  const risks = overview?.risks || [];
  const capacity = overview?.capacity || { summary: {}, insights: [] };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'HEALTHY':
      case 'nominal':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">HEALTHY</span>;
      case 'DEGRADED':
      case 'burn_warning':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">DEGRADED</span>;
      case 'CRITICAL':
      case 'breached':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">CRITICAL</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/30">{status || 'UNKNOWN'}</span>;
    }
  };

  const getPriorityBadge = (p) => {
    switch (p) {
      case 'P0': return <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-900/50 text-rose-300 border border-rose-500/40">P0 CRITICAL</span>;
      case 'P1': return <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">P1 HIGH</span>;
      case 'P2': return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">P2 MEDIUM</span>;
      default: return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">{p || 'P3 LOW'}</span>;
    }
  };

  const filteredRecs = recommendations.filter(r => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  return (
    <div className="min-h-screen bg-[#0d0e12] text-slate-200 p-6 font-mono">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#272a33]">
        <div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-indigo-400 text-3xl">insights</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">Autonomous SRE Intelligence</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Phase 23K</span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Proactive infrastructure health, statistical risk forecasting, error budget burn rates, and governed SRE recommendations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setRefreshTrigger(p => p + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1c1f2b] hover:bg-[#252a3b] border border-[#2e3447] text-xs text-slate-200 transition"
          >
            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>sync</span>
            Refresh State
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <span className="material-symbols-outlined text-rose-400">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {/* Overall Health Card */}
        <div className="bg-[#14161f] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>INFRASTRUCTURE HEALTH</span>
            {health && getStatusBadge(health.healthStatus)}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{health?.overallScore ?? '--'}%</span>
            <span className="text-xs text-slate-400">Score</span>
          </div>
          <div className="mt-2 pt-2 border-t border-[#222530] flex items-center justify-between text-[11px] text-slate-400">
            <span>Data Freshness:</span>
            <span className={health?.telemetryStatus === 'FRESH' ? 'text-emerald-400' : 'text-amber-400'}>
              {health?.telemetryStatus} ({health?.dataFreshnessSeconds ? `${health.dataFreshnessSeconds}s ago` : 'no telemetry'})
            </span>
          </div>
        </div>

        {/* At-Risk Services */}
        <div className="bg-[#14161f] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>AT-RISK SERVICES</span>
            <span className="material-symbols-outlined text-amber-400 text-sm">warning</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-amber-400">{sloData?.kpis?.atRiskServicesCount ?? 0}</span>
            <span className="text-xs text-slate-400">of {sloData?.kpis?.totalSlos ?? 0} monitored</span>
          </div>
          <div className="mt-2 pt-2 border-t border-[#222530] flex items-center justify-between text-[11px] text-slate-400">
            <span>Compliance Rate:</span>
            <span className="text-slate-300 font-semibold">{sloData?.kpis?.overallCompliancePercent ?? 100}%</span>
          </div>
        </div>

        {/* Predictive Risks */}
        <div className="bg-[#14161f] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>PREDICTIVE RISKS</span>
            <span className="material-symbols-outlined text-indigo-400 text-sm">trending_up</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{risks.length}</span>
            <span className="text-xs text-slate-400">Active Forecasts</span>
          </div>
          <div className="mt-2 pt-2 border-t border-[#222530] flex items-center justify-between text-[11px] text-slate-400">
            <span>Methodology:</span>
            <span className="text-indigo-300">OLS Regression (Linear)</span>
          </div>
        </div>

        {/* Monthly Waste USD */}
        <div className="bg-[#14161f] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>EST. MONTHLY WASTE</span>
            <span className="material-symbols-outlined text-emerald-400 text-sm">savings</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-400">${capacity?.summary?.totalMonthlyWasteUsd ?? '0.00'}</span>
            <span className="text-xs text-slate-400">USD/mo</span>
          </div>
          <div className="mt-2 pt-2 border-t border-[#222530] flex items-center justify-between text-[11px] text-slate-400">
            <span>Underutilized Compute:</span>
            <span className="text-slate-300">{capacity?.summary?.underutilizedComputeCount ?? 0} workloads</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#272a33] mt-8 gap-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-xs font-semibold transition border-b-2 ${
            activeTab === 'overview'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Unified Health & Topology
        </button>
        <button
          onClick={() => setActiveTab('predictive')}
          className={`px-4 py-2 text-xs font-semibold transition border-b-2 ${
            activeTab === 'predictive'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Predictive Risks ({risks.length})
        </button>
        <button
          onClick={() => setActiveTab('slos')}
          className={`px-4 py-2 text-xs font-semibold transition border-b-2 ${
            activeTab === 'slos'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          SLOs & Burn Rates
        </button>
        <button
          onClick={() => setActiveTab('capacity')}
          className={`px-4 py-2 text-xs font-semibold transition border-b-2 ${
            activeTab === 'capacity'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Capacity & Cost Optimization
        </button>
        <button
          onClick={() => setActiveTab('recommendations')}
          className={`px-4 py-2 text-xs font-semibold transition border-b-2 ${
            activeTab === 'recommendations'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          SRE Recommendations ({recommendations.length})
        </button>
      </div>

      {/* Tab 1: Unified Health */}
      {activeTab === 'overview' && (
        <div className="mt-6 space-y-6">
          <div className="bg-[#14161f] border border-[#272a33] rounded-lg p-5">
            <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400">health_and_safety</span>
              Unified Infrastructure Health Intelligence
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Real-time multi-dimensional assessment of compute, memory, disk, network, containers, Kubernetes pods, and AWS workloads.
            </p>

            {/* Services breakdown table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-[#272a33]">
                <thead className="bg-[#1b1e2a] text-slate-400 border-b border-[#272a33]">
                  <tr>
                    <th className="p-3">Service</th>
                    <th className="p-3">Health Score</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Telemetry State</th>
                    <th className="p-3">Active Incidents</th>
                    <th className="p-3">Contributing Factors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222533]">
                  {health?.servicesHealth?.map(s => (
                    <tr key={s.serviceId} className="hover:bg-[#1a1d29]/50">
                      <td className="p-3 font-semibold text-white">{s.serviceName || s.serviceId}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{s.healthScore}%</span>
                          <div className="w-16 bg-[#252838] h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${s.healthScore > 80 ? 'bg-emerald-500' : s.healthScore > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${s.healthScore}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3">{getStatusBadge(s.status)}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] ${s.telemetryStatus === 'FRESH' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {s.telemetryStatus}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{s.activeIncidentsCount}</td>
                      <td className="p-3 text-[11px] text-slate-400">
                        {s.deductions?.length > 0 ? s.deductions.join('; ') : 'Nominal metrics.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Predictive Risks */}
      {activeTab === 'predictive' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Identifies trend trajectories (memory growth, disk fill, latency degradation) using transparent OLS regression.</span>
            <span>Forecast Horizon: 24h - 48h</span>
          </div>

          {risks.length === 0 ? (
            <div className="p-8 text-center bg-[#14161f] border border-[#272a33] rounded-lg text-slate-400 text-sm">
              <span className="material-symbols-outlined text-4xl text-emerald-400 mb-2">check_circle</span>
              <p>No critical predictive risk conditions detected across telemetry series.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {risks.map(risk => (
                <div key={risk.id} className="bg-[#14161f] border border-[#272a33] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-400 text-base">warning</span>
                      <span className="font-bold text-white text-sm">{risk.risk_type || risk.riskType}</span>
                    </div>
                    {getStatusBadge(risk.risk_level || risk.riskLevel)}
                  </div>

                  <p className="text-xs text-slate-300">
                    Target: <span className="text-white font-semibold">{risk.target_resource_id || risk.target_service_id}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#191c28] p-2.5 rounded border border-[#262b3d]">
                    <div>
                      <span className="text-slate-400 text-[11px]">Rate of Change:</span>
                      <p className="font-semibold text-white">+{risk.rate_of_change_per_hour || risk.rateOfChangePerHour}% / hour</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[11px]">Time to Exhaustion:</span>
                      <p className="font-semibold text-rose-400">{risk.time_to_exhaustion_hours ? `~${risk.time_to_exhaustion_hours} hours` : 'N/A'}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {risk.recommended_investigation || risk.recommendedInvestigation}
                  </p>

                  <div className="pt-2 border-t border-[#222530] flex items-center justify-between text-[11px] text-slate-500">
                    <span>Methodology: {risk.methodology || 'OLS_LINEAR_REGRESSION'}</span>
                    <span>Confidence: {risk.confidence || 'HIGH'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: SLOs */}
      {activeTab === 'slos' && (
        <div className="mt-6 bg-[#14161f] border border-[#272a33] rounded-lg p-5">
          <h2 className="text-base font-bold text-white mb-2">Service Level Objectives & Error Budget Burn Rates</h2>
          <p className="text-xs text-slate-400 mb-4">
            Calculated following Google SRE Workbook standards with multi-window burn rate alerts (1h fast burn, 6h slow burn).
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-[#272a33]">
              <thead className="bg-[#1b1e2a] text-slate-400 border-b border-[#272a33]">
                <tr>
                  <th className="p-3">SLO Name</th>
                  <th className="p-3">Service</th>
                  <th className="p-3">SLI Type</th>
                  <th className="p-3">Target %</th>
                  <th className="p-3">Current SLI</th>
                  <th className="p-3">Remaining Budget</th>
                  <th className="p-3">Burn Rate (1h)</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222533]">
                {sloData?.slos?.map(slo => (
                  <tr key={slo.id} className="hover:bg-[#1a1d29]/50">
                    <td className="p-3 font-semibold text-white">{slo.name}</td>
                    <td className="p-3 text-slate-300">{slo.serviceName}</td>
                    <td className="p-3 uppercase text-[11px] text-indigo-400">{slo.sliType}</td>
                    <td className="p-3">{slo.targetPercent}%</td>
                    <td className="p-3 font-bold text-white">{slo.currentSliValue !== null ? `${slo.currentSliValue}%` : 'N/A'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${slo.remainingBudgetPercent < 20 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {slo.remainingBudgetPercent}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">{slo.burnRate1h}x</td>
                    <td className="p-3">{getStatusBadge(slo.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Capacity & Cost */}
      {activeTab === 'capacity' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Identifies underutilized instances, stopped compute accumulating storage fees, and over-provisioned limits.</span>
            <span className="text-emerald-400 font-semibold">Total Monthly Waste: ${capacity?.summary?.totalMonthlyWasteUsd ?? 0}/mo</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capacity?.insights?.map((ins, idx) => (
              <div key={ins.id || idx} className="bg-[#14161f] border border-[#272a33] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{ins.resource_id || ins.resourceId}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    ${ins.estimated_monthly_waste_usd || ins.estimatedMonthlyWasteUsd}/mo waste
                  </span>
                </div>

                <p className="text-xs text-slate-300">
                  Category: <span className="text-indigo-400 font-medium">{ins.optimization_category || ins.optimizationCategory}</span>
                </p>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {ins.justification}
                </p>

                <div className="p-2.5 rounded bg-[#181b26] border border-[#262938] flex items-center justify-between text-xs">
                  <span className="text-slate-400">Governed Remediation Action:</span>
                  <span className="font-mono text-amber-300 font-semibold">{ins.recommended_governed_action || ins.recommendedGovernedAction}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: SRE Recommendations */}
      {activeTab === 'recommendations' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter by status:</span>
              {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded text-xs transition ${statusFilter === st ? 'bg-indigo-600 text-white' : 'bg-[#1a1d28] text-slate-400 hover:text-white'}`}
                >
                  {st}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">Total: {filteredRecs.length}</span>
          </div>

          <div className="space-y-3">
            {filteredRecs.map(rec => (
              <div key={rec.id} className="bg-[#14161f] border border-[#272a33] rounded-lg p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {getPriorityBadge(rec.priority)}
                    <span className="font-bold text-white text-sm">{rec.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">{rec.recommendation_code || rec.recommendationCode}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700">{rec.status}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-[#191c28] p-2.5 rounded border border-[#262b3d]">
                  <div>
                    <span className="text-slate-400 text-[11px]">Affected Workload:</span>
                    <p className="font-semibold text-white">{rec.affected_resource || rec.affectedResource} ({rec.affected_service || rec.affectedService})</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">Required Governance Approval:</span>
                    <p className="font-semibold text-indigo-300">{rec.required_approval || rec.requiredApproval}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  <span className="text-slate-400">Suggested Action: </span>
                  {rec.suggested_action || rec.suggestedAction}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-[#222530] text-xs">
                  <span className="text-[11px] text-slate-400">
                    Benefit: {rec.expected_benefit || rec.expectedBenefit}
                  </span>

                  <div className="flex items-center gap-2">
                    {rec.status === 'OPEN' && (
                      <button
                        onClick={() => handleUpdateRecStatus(rec.id, 'ACKNOWLEDGED')}
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs transition"
                      >
                        Acknowledge
                      </button>
                    )}
                    {rec.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleUpdateRecStatus(rec.id, 'RESOLVED')}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs transition"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SREIntelligencePage;

