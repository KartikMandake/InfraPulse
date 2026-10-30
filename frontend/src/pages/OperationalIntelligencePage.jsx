import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export const OperationalIntelligencePage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'patterns' | 'recommendations' | 'trends'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [overview, setOverview] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [serviceRisks, setServiceRisks] = useState([]);
  const [earlyWarnings, setEarlyWarnings] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [trends, setTrends] = useState(null);
  const [selectedDays, setSelectedDays] = useState(30);

  // Selected item modal states
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [selectedPatternEvidence, setSelectedPatternEvidence] = useState([]);
  const [isPatternModalOpen, setIsPatternModalOpen] = useState(false);

  // Verification modal state
  const [verifyingRec, setVerifyingRec] = useState(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [isVerifyingModalOpen, setIsVerifyingModalOpen] = useState(false);

  // Dismissal modal state
  const [dismissingRec, setDismissingRec] = useState(null);
  const [dismissedReason, setDismissedReason] = useState('');
  const [isDismissModalOpen, setIsDismissModalOpen] = useState(false);

  // New Recommendation modal state
  const [isNewRecModalOpen, setIsNewRecModalOpen] = useState(false);
  const [newRecForm, setNewRecForm] = useState({
    title: '',
    explanation: '',
    serviceId: 'payment-service',
    priority: 'P1',
    expectedBenefit: '',
    verificationMethod: ''
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState(null);

  const canMutate = user?.role === 'admin' || user?.role === 'responder';

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [overviewRes, patternsRes, risksRes, warningsRes, recsRes, trendsRes] = await Promise.all([
        api.getOperationalOverview().catch(() => ({ data: null })),
        api.getOperationalPatterns().catch(() => ({ data: [] })),
        api.getServiceRiskProfiles().catch(() => ({ data: [] })),
        api.getEarlyWarnings().catch(() => ({ data: [] })),
        api.getPreventiveRecommendations().catch(() => ({ data: [] })),
        api.getOperationalTrends({ days: selectedDays }).catch(() => ({ data: null }))
      ]);

      setOverview(overviewRes?.data || null);
      setPatterns(patternsRes?.data || []);
      setServiceRisks(risksRes?.data || []);
      setEarlyWarnings(warningsRes?.data || []);
      setRecommendations(recsRes?.data || []);
      setTrends(trendsRes?.data || null);
    } catch (err) {
      console.error('Failed to load operational intelligence data:', err);
      setError(err.message || 'Failed to load operational intelligence.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDays]);

  const handleOpenPatternModal = async (pat) => {
    try {
      setSelectedPattern(pat);
      setIsPatternModalOpen(true);
      const detailRes = await api.getOperationalPatternById(pat.id);
      if (detailRes?.data?.evidence) {
        setSelectedPatternEvidence(detailRes.data.evidence);
      } else {
        setSelectedPatternEvidence([]);
      }
    } catch (err) {
      console.error('Failed to load pattern detail:', err);
    }
  };

  const handleTransition = async (recId, targetStatus, payload = {}) => {
    try {
      setActionLoading(true);
      setError(null);
      await api.transitionPreventiveRecommendation(recId, { status: targetStatus, ...payload });
      setActionSuccessMsg(`Recommendation transitioned to ${targetStatus}`);
      setTimeout(() => setActionSuccessMsg(null), 3000);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to transition recommendation status');
    } finally {
      setActionLoading(false);
      setIsVerifyingModalOpen(false);
      setIsDismissModalOpen(false);
      setVerifyingRec(null);
      setDismissingRec(null);
      setVerificationNotes('');
      setDismissedReason('');
    }
  };

  const handleCreateRecommendation = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      await api.createPreventiveRecommendation(newRecForm);
      setActionSuccessMsg('Preventive recommendation created successfully');
      setTimeout(() => setActionSuccessMsg(null), 3000);
      setIsNewRecModalOpen(false);
      setNewRecForm({
        title: '',
        explanation: '',
        serviceId: 'payment-service',
        priority: 'P1',
        expectedBenefit: '',
        verificationMethod: ''
      });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to create recommendation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncPatterns = async () => {
    try {
      setActionLoading(true);
      await api.syncOperationalPatterns();
      setActionSuccessMsg('Failure patterns synchronized and verified.');
      setTimeout(() => setActionSuccessMsg(null), 3000);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncWarnings = async () => {
    try {
      setActionLoading(true);
      await api.syncEarlyWarnings();
      setActionSuccessMsg('Early warning signals re-evaluated.');
      setTimeout(() => setActionSuccessMsg(null), 3000);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCaptureSnapshot = async () => {
    try {
      setActionLoading(true);
      await api.captureOperationalTrendSnapshot({ days: selectedDays });
      setActionSuccessMsg('Operational trend snapshot saved successfully.');
      setTimeout(() => setActionSuccessMsg(null), 3000);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[#9296A3]">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        <span>Synthesizing operational intelligence across telemetry, incidents, and changes...</span>
      </div>
    );
  }

  const kpis = overview?.kpis || {
    totalRecurringPatterns: patterns.length,
    highRiskServicesCount: serviceRisks.filter(s => s.riskCategory === 'high' || s.riskCategory === 'critical').length,
    openRecommendationsCount: recommendations.filter(r => r.status === 'OPEN').length,
    activeEarlyWarningsCount: earlyWarnings.length,
    recurrenceRatePercent: 75
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#272a33] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1558C9] text-28px">psychology</span>
              Operational Intelligence & Predictive Prevention
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1558C9]/20 text-[#60a5fa] border border-[#1558C9]/40 font-semibold">
              Phase 18
            </span>
          </div>
          <p className="text-xs text-[#9296A3] mt-1 font-mono">
            Deterministic analysis of recurring failure patterns, early-warning signals, explainable service risk profiles, and preventive engineering recommendations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canMutate && (
            <>
              <button
                onClick={handleSyncPatterns}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-[#171920] hover:bg-[#20232c] text-xs font-mono text-white rounded border border-[#272a33] flex items-center gap-1.5 transition-all"
              >
                <span className="material-symbols-outlined text-[16px] text-[#D4FF24]">sync</span>
                Sync Patterns
              </button>
              <button
                onClick={handleSyncWarnings}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-[#171920] hover:bg-[#20232c] text-xs font-mono text-white rounded border border-[#272a33] flex items-center gap-1.5 transition-all"
              >
                <span className="material-symbols-outlined text-[16px] text-[#fbbf24]">warning</span>
                Scan Warnings
              </button>
              <button
                onClick={() => setIsNewRecModalOpen(true)}
                className="px-3 py-1.5 bg-[#1558C9] hover:bg-[#124cb0] text-xs font-mono text-white font-semibold rounded shadow flex items-center gap-1.5 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New Recommendation
              </button>
            </>
          )}
        </div>
      </div>

      {/* Global Alerts / Feedback */}
      {error && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-200 p-3 rounded text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-red-400 text-sm">error</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}
      {actionSuccessMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 p-3 rounded text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#101116] border border-[#272a33] p-3.5 rounded-lg">
          <div className="text-[11px] font-mono text-[#9296A3] uppercase tracking-wider">Recurring Patterns</div>
          <div className="text-2xl font-bold text-white mt-1 flex items-baseline gap-2">
            <span>{kpis.totalRecurringPatterns}</span>
            <span className="text-[10px] text-[#D4FF24] font-mono">≥2 occurrences</span>
          </div>
          <div className="text-[10px] text-[#6b7280] mt-1">Verified failure signatures</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] p-3.5 rounded-lg">
          <div className="text-[11px] font-mono text-[#9296A3] uppercase tracking-wider">High-Risk Services</div>
          <div className="text-2xl font-bold text-amber-400 mt-1 flex items-baseline gap-2">
            <span>{kpis.highRiskServicesCount}</span>
            <span className="text-[10px] text-amber-500/80 font-mono">Score &gt; 50</span>
          </div>
          <div className="text-[10px] text-[#6b7280] mt-1">Requiring proactive SRE attention</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] p-3.5 rounded-lg">
          <div className="text-[11px] font-mono text-[#9296A3] uppercase tracking-wider">Early-Warning Signals</div>
          <div className="text-2xl font-bold text-rose-400 mt-1 flex items-baseline gap-2">
            <span>{kpis.activeEarlyWarningsCount}</span>
            <span className="text-[10px] text-rose-500/80 font-mono">Active</span>
          </div>
          <div className="text-[10px] text-[#6b7280] mt-1">Deterministic leading indicators</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] p-3.5 rounded-lg">
          <div className="text-[11px] font-mono text-[#9296A3] uppercase tracking-wider">Preventive Recs</div>
          <div className="text-2xl font-bold text-[#60a5fa] mt-1 flex items-baseline gap-2">
            <span>{kpis.openRecommendationsCount}</span>
            <span className="text-[10px] text-[#60a5fa]/80 font-mono">Open / In-Prog</span>
          </div>
          <div className="text-[10px] text-[#6b7280] mt-1">Evidence-backed engineering tasks</div>
        </div>

        <div className="bg-[#101116] border border-[#272a33] p-3.5 rounded-lg">
          <div className="text-[11px] font-mono text-[#9296A3] uppercase tracking-wider">Recurrence Rate</div>
          <div className="text-2xl font-bold text-[#D4FF24] mt-1 flex items-baseline gap-2">
            <span>{kpis.recurrenceRatePercent}%</span>
            <span className="text-[10px] text-[#D4FF24]/80 font-mono">30d window</span>
          </div>
          <div className="text-[10px] text-[#6b7280] mt-1">Incidents with known pattern</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-[#272a33] flex items-center gap-1 font-mono text-xs">
        {[
          { id: 'overview', label: 'Executive Overview & Early Warnings', icon: 'speed' },
          { id: 'patterns', label: 'Recurring Failure Patterns', icon: 'pattern' },
          { id: 'recommendations', label: 'Preventive Recommendations Inbox', icon: 'task_alt' },
          { id: 'trends', label: 'Reliability Trends & Forecasting', icon: 'trending_up' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 flex items-center gap-2 border-b-2 font-medium transition-all ${
              activeTab === tab.id
                ? 'border-[#1558C9] text-white bg-[#1558C9]/10'
                : 'border-transparent text-[#9296A3] hover:text-white hover:bg-[#171920]/40'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: EXECUTIVE OVERVIEW & EARLY WARNINGS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Active Early-Warning Signals Section */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-400 text-lg">crisis_alert</span>
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                  Bounded Early-Warning Signals (Leading Indicators)
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#9296A3]">
                Deterministic Pre-Failure Telemetry Profiles
              </span>
            </div>

            {earlyWarnings.length === 0 ? (
              <div className="p-8 text-center text-[#9296A3] text-xs font-mono">
                No active early-warning signals detected. All services operating within baseline thresholds.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {earlyWarnings.map((w) => (
                  <div
                    key={w.id}
                    className={`p-3.5 rounded-lg border flex flex-col justify-between ${
                      w.severity === 'critical'
                        ? 'bg-rose-950/20 border-rose-600/40'
                        : w.severity === 'high'
                        ? 'bg-amber-950/20 border-amber-600/40'
                        : 'bg-[#171920] border-[#272a33]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-[#1558C9]">dns</span>
                          {w.serviceName}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            w.severity === 'critical'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : w.severity === 'high'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                          }`}
                        >
                          {w.severity}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-[#9296A3] mb-2">
                        Signal: <span className="text-white">{w.category.replace(/_/g, ' ')}</span>
                      </div>

                      <div className="space-y-1 mb-2.5">
                        {(w.indicators || []).map((ind, i) => (
                          <div key={i} className="text-xs text-[#d1d5db] flex items-start gap-1.5">
                            <span className="text-[#D4FF24] text-[10px] mt-0.5 font-mono">▶</span>
                            <span>{ind}</span>
                          </div>
                        ))}
                      </div>

                      <div className="p-2 bg-[#030407]/60 rounded border border-[#272a33] text-[11px] text-[#9ca3af] mb-2 font-mono">
                        <span className="text-amber-400 font-semibold">Historical Correlation: </span>
                        {w.historicalComparison || w.historical_comparison}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#272a33]/60 flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#6b7280]">Confidence: <span className="text-white capitalize">{w.confidence}</span></span>
                      <span className="text-[#9296A3] truncate max-w-[200px]" title={w.recommendedInvestigation}>
                        Action: {w.recommendedInvestigation}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Service Risk Leaderboard */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#D4FF24] text-lg">analytics</span>
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                  Explainable Service Reliability Risk Profiles
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#9296A3]">
                Weighted Synthesis (0-100 Score)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#272a33] text-[#9296A3] uppercase text-[10px]">
                    <th className="py-2.5 px-3">Service</th>
                    <th className="py-2.5 px-3">Risk Score</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Incidents</th>
                    <th className="py-2.5 px-3">MTTR</th>
                    <th className="py-2.5 px-3">Remaining Budget</th>
                    <th className="py-2.5 px-3">Trend</th>
                    <th className="py-2.5 px-3">Contributing Factors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#272a33]/60">
                  {serviceRisks.map((p) => {
                    const factors = p.contributingFactors || {};
                    return (
                      <tr key={p.serviceId} className="hover:bg-[#171920]/60 transition-colors">
                        <td className="py-3 px-3 font-semibold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-[#1558C9]">dns</span>
                            {p.serviceName}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-bold">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm ${
                                p.riskScore >= 75
                                  ? 'text-rose-400'
                                  : p.riskScore >= 50
                                  ? 'text-amber-400'
                                  : p.riskScore >= 25
                                  ? 'text-blue-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {p.riskScore}
                            </span>
                            <div className="w-16 h-1.5 bg-[#272a33] rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  p.riskScore >= 75
                                    ? 'bg-rose-500'
                                    : p.riskScore >= 50
                                    ? 'bg-amber-500'
                                    : p.riskScore >= 25
                                    ? 'bg-blue-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${p.riskScore}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                              p.riskCategory === 'critical'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                : p.riskCategory === 'high'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                : p.riskCategory === 'moderate'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            }`}
                          >
                            {p.riskCategory}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#d1d5db]">{p.incidentCount}</td>
                        <td className="py-3 px-3 text-[#d1d5db]">{p.mttrMinutes ? `${p.mttrMinutes}m` : 'N/A'}</td>
                        <td className="py-3 px-3">
                          <span className={p.remainingErrorBudgetPercent < 25 ? 'text-rose-400 font-bold' : 'text-[#d1d5db]'}>
                            {p.remainingErrorBudgetPercent}%
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`text-xs flex items-center gap-1 ${
                              p.trendDirection === 'deteriorating'
                                ? 'text-rose-400'
                                : p.trendDirection === 'improving'
                                ? 'text-emerald-400'
                                : 'text-[#9296A3]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {p.trendDirection === 'deteriorating'
                                ? 'trending_down'
                                : p.trendDirection === 'improving'
                                ? 'trending_up'
                                : 'trending_flat'}
                            </span>
                            {p.trendDirection}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-[#9ca3af]">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(factors).map(([key, val]) => (
                              val.points > 0 && (
                                <span
                                  key={key}
                                  className="px-1.5 py-0.5 bg-[#171920] border border-[#272a33] rounded text-[10px]"
                                  title={val.explanation}
                                >
                                  {key.replace(/_/g, ' ')}: +{val.points}pt
                                </span>
                              )
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECURRING FAILURE PATTERNS */}
      {activeTab === 'patterns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-[#9296A3]">
              Showing <span className="text-white font-bold">{patterns.length}</span> verified recurring patterns with sample size &ge; 2.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {patterns.map((pat) => (
              <div
                key={pat.id}
                onClick={() => handleOpenPatternModal(pat)}
                className="bg-[#101116] border border-[#272a33] hover:border-[#1558C9] p-4 rounded-lg cursor-pointer transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1558C9]/20 text-[#60a5fa] border border-[#1558C9]/40 font-bold uppercase">
                      {pat.category.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-mono text-[#D4FF24] font-bold">
                      {pat.occurrenceCount} Occurrences
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white mb-1.5">{pat.title}</h3>
                  <p className="text-xs text-[#9296A3] line-clamp-2 mb-3">{pat.description}</p>

                  <div className="space-y-1.5 mb-3">
                    <div className="text-[11px] font-mono text-[#6b7280]">Common Observable Signals:</div>
                    {(pat.commonSignals || []).slice(0, 2).map((sig, idx) => (
                      <div key={idx} className="text-xs text-[#d1d5db] flex items-center gap-1.5">
                        <span className="text-[#1558C9] text-[10px]">●</span>
                        <span className="truncate">{sig}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#272a33] flex items-center justify-between text-[11px] font-mono text-[#9296A3]">
                  <span>Services: <span className="text-white font-semibold">{(pat.affectedServices || []).join(', ')}</span></span>
                  <span className="text-[#1558C9] hover:underline flex items-center gap-1">
                    Inspect Evidence ({pat.sampleSize})
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PREVENTIVE RECOMMENDATIONS INBOX */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-[#9296A3]">
              Evidence-grounded engineering tasks mapped to runbooks and recurring patterns.
            </div>
            {canMutate && (
              <button
                onClick={() => setIsNewRecModalOpen(true)}
                className="px-3 py-1.5 bg-[#1558C9] hover:bg-[#124cb0] text-xs font-mono text-white rounded font-semibold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Propose Recommendation
              </button>
            )}
          </div>

          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="bg-[#101116] border border-[#272a33] p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        rec.priority === 'P0'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : rec.priority === 'P1'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                      }`}
                    >
                      {rec.priority}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        rec.status === 'VERIFIED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : rec.status === 'CLOSED'
                          ? 'bg-[#272a33] text-[#9296A3]'
                          : rec.status === 'IN_PROGRESS'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                          : rec.status === 'ACKNOWLEDGED'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                          : rec.status === 'DISMISSED'
                          ? 'bg-gray-800 text-gray-400 border border-gray-700'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}
                    >
                      {rec.status}
                    </span>
                    <span className="font-mono text-xs font-semibold text-white flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-[#1558C9]">dns</span>
                      {rec.serviceName}
                    </span>
                    {rec.linkedIssueRef && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#171920] border border-[#272a33] text-[#9ca3af] rounded">
                        {rec.linkedIssueRef}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-white">{rec.title}</h3>
                  <p className="text-xs text-[#9296A3]">{rec.explanation}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                    <div className="p-2 bg-[#171920] rounded border border-[#272a33]/60">
                      <span className="text-[#D4FF24] font-semibold">Expected Benefit: </span>
                      <span className="text-[#d1d5db]">{rec.expectedBenefit}</span>
                    </div>
                    <div className="p-2 bg-[#171920] rounded border border-[#272a33]/60">
                      <span className="text-[#60a5fa] font-semibold">Verification Method: </span>
                      <span className="text-[#d1d5db]">{rec.verificationMethod}</span>
                    </div>
                  </div>

                  {rec.verificationNotes && (
                    <div className="p-2 bg-emerald-950/20 rounded border border-emerald-500/40 text-[11px] font-mono text-emerald-200">
                      <span className="font-bold">Verified Result: </span>
                      {rec.verificationNotes}
                    </div>
                  )}

                  {rec.dismissedReason && (
                    <div className="p-2 bg-gray-900 rounded border border-gray-700 text-[11px] font-mono text-gray-300">
                      <span className="font-bold text-red-400">Dismissal Rationale: </span>
                      {rec.dismissedReason}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[11px] font-mono text-[#6b7280] pt-1">
                    <span>Owner: <span className="text-[#9ca3af]">{rec.ownerRole}</span></span>
                    {rec.relevantRunbookIds?.length > 0 && (
                      <span>Runbooks: <span className="text-[#60a5fa]">{rec.relevantRunbookIds.join(', ')}</span></span>
                    )}
                  </div>
                </div>

                {/* Status Transition Action Buttons */}
                {canMutate && (
                  <div className="flex flex-row md:flex-col items-end gap-1.5 min-w-[130px]">
                    {rec.status === 'OPEN' && (
                      <button
                        onClick={() => handleTransition(rec.id, 'ACKNOWLEDGED')}
                        disabled={actionLoading}
                        className="w-full px-2.5 py-1.5 bg-[#1558C9]/20 hover:bg-[#1558C9]/40 border border-[#1558C9]/50 text-xs font-mono text-[#60a5fa] rounded font-semibold transition-all"
                      >
                        Acknowledge
                      </button>
                    )}

                    {rec.status === 'ACKNOWLEDGED' && (
                      <button
                        onClick={() => handleTransition(rec.id, 'IN_PROGRESS')}
                        disabled={actionLoading}
                        className="w-full px-2.5 py-1.5 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/50 text-xs font-mono text-purple-300 rounded font-semibold transition-all"
                      >
                        Start Fix
                      </button>
                    )}

                    {rec.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => {
                          setVerifyingRec(rec);
                          setIsVerifyingModalOpen(true);
                        }}
                        disabled={actionLoading}
                        className="w-full px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/50 text-xs font-mono text-emerald-300 rounded font-semibold transition-all"
                      >
                        Verify Fix...
                      </button>
                    )}

                    {rec.status === 'VERIFIED' && (
                      <button
                        onClick={() => handleTransition(rec.id, 'CLOSED')}
                        disabled={actionLoading}
                        className="w-full px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-xs font-mono text-white rounded font-semibold transition-all"
                      >
                        Close Task
                      </button>
                    )}

                    {rec.status !== 'CLOSED' && rec.status !== 'DISMISSED' && (
                      <button
                        onClick={() => {
                          setDismissingRec(rec);
                          setIsDismissModalOpen(true);
                        }}
                        disabled={actionLoading}
                        className="w-full px-2.5 py-1 text-xs font-mono text-[#6b7280] hover:text-red-400 transition-colors"
                      >
                        Dismiss...
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RELIABILITY TRENDS & FORECASTING */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#9296A3]">Evaluation Window:</span>
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDays(d)}
                  className={`px-2.5 py-1 text-xs font-mono rounded border transition-all ${
                    selectedDays === d
                      ? 'bg-[#1558C9] border-[#1558C9] text-white font-bold'
                      : 'bg-[#101116] border-[#272a33] text-[#9296A3] hover:text-white'
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>

            {canMutate && (
              <button
                onClick={handleCaptureSnapshot}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-[#171920] hover:bg-[#20232c] text-xs font-mono text-white rounded border border-[#272a33] flex items-center gap-1.5 transition-all"
              >
                <span className="material-symbols-outlined text-[16px] text-[#60a5fa]">save</span>
                Capture Snapshot
              </button>
            )}
          </div>

          {/* Sample Size Transparency Card */}
          <div className="bg-[#101116] border border-[#272a33] p-4 rounded-lg flex items-center gap-3">
            <span className="material-symbols-outlined text-[#1558C9] text-2xl">info</span>
            <div className="text-xs font-mono">
              <div className="text-white font-bold">
                Analytical Sample Size Disclosure: {trends?.sampleSize || 0} incidents analyzed
              </div>
              <div className="text-[#9296A3] mt-0.5">
                {trends?.metrics?.sampleSizeNote || 'Metrics are calculated strictly against verified historical events.'}
                {' '}Confidence Level:{' '}
                <span className="text-white font-semibold uppercase">{trends?.confidence || 'medium'}</span>.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#101116] border border-[#272a33] p-4 rounded-lg">
              <div className="text-[11px] font-mono text-[#9296A3] uppercase">Incident Recurrence Rate</div>
              <div className="text-3xl font-bold text-[#D4FF24] mt-2">
                {trends?.metrics?.incidentRecurrenceRatePercent || 0}%
              </div>
              <p className="text-xs text-[#6b7280] mt-1 font-mono">
                Portion of incidents associated with recurrent operational failure patterns.
              </p>
            </div>

            <div className="bg-[#101116] border border-[#272a33] p-4 rounded-lg">
              <div className="text-[11px] font-mono text-[#9296A3] uppercase">Average MTTR Evolution</div>
              <div className="text-3xl font-bold text-white mt-2">
                {trends?.metrics?.averageMttrMinutes || 0} <span className="text-sm font-normal text-[#9296A3]">min</span>
              </div>
              <p className="text-xs text-[#6b7280] mt-1 font-mono">
                Mean time to recovery across resolved incidents in {selectedDays}d window.
              </p>
            </div>

            <div className="bg-[#101116] border border-[#272a33] p-4 rounded-lg">
              <div className="text-[11px] font-mono text-[#9296A3] uppercase">Deployment Regressions</div>
              <div className="text-3xl font-bold text-amber-400 mt-2">
                {trends?.metrics?.regressionCount || 0}
              </div>
              <p className="text-xs text-[#6b7280] mt-1 font-mono">
                Correlated post-deployment latency or error rate regressions.
              </p>
            </div>
          </div>

          {/* Failure Category Distribution */}
          <div className="bg-[#101116] border border-[#272a33] p-4 rounded-lg">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider mb-3">
              Historical Failure Category Distribution
            </h3>
            <div className="space-y-2">
              {Object.entries(trends?.categoryBreakdown || {}).map(([cat, count]) => (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#d1d5db] capitalize">{cat.replace(/_/g, ' ')}</span>
                    <span className="text-white font-bold">{count} occurrences</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#171920] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1558C9]"
                      style={{ width: `${Math.min(100, count * 20)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PATTERN DETAIL & EVIDENCE MODAL */}
      {isPatternModalOpen && selectedPattern && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#101116] border border-[#272a33] w-full max-w-2xl rounded-xl p-5 max-h-[85vh] overflow-y-auto space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#1558C9]/20 text-[#60a5fa] border border-[#1558C9]/40 font-bold uppercase">
                  {selectedPattern.category.replace(/_/g, ' ')}
                </span>
                <h2 className="text-base font-bold text-white mt-1">{selectedPattern.title}</h2>
              </div>
              <button
                onClick={() => setIsPatternModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <p className="text-xs text-[#d1d5db]">{selectedPattern.description}</p>

            <div className="grid grid-cols-3 gap-2 p-3 bg-[#171920] rounded-lg border border-[#272a33]">
              <div>
                <span className="text-[#6b7280] text-[10px] uppercase">Occurrences</span>
                <div className="text-white font-bold text-sm">{selectedPattern.occurrenceCount}</div>
              </div>
              <div>
                <span className="text-[#6b7280] text-[10px] uppercase">Trend</span>
                <div className="text-[#D4FF24] font-bold text-sm capitalize">{selectedPattern.trendDirection}</div>
              </div>
              <div>
                <span className="text-[#6b7280] text-[10px] uppercase">Confidence</span>
                <div className="text-white font-bold text-sm capitalize">{selectedPattern.confidence}</div>
              </div>
            </div>

            <div>
              <div className="font-bold text-white mb-2 uppercase text-[11px]">Verifiable Supporting Evidence:</div>
              {selectedPatternEvidence.length === 0 ? (
                <div className="p-3 text-[#6b7280]">No discrete evidence records attached.</div>
              ) : (
                <div className="space-y-2">
                  {selectedPatternEvidence.map((evi) => (
                    <div key={evi.id} className="p-2.5 bg-[#030407] rounded border border-[#272a33] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#60a5fa]">{evi.title}</span>
                        <span className="text-[10px] text-[#6b7280]">{evi.evidenceType}</span>
                      </div>
                      <div className="text-[#9ca3af]">{evi.description}</div>
                      <div className="text-[10px] text-[#6b7280]">Ref: {evi.sourceRefId}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#272a33]">
              <button
                onClick={() => setIsPatternModalOpen(false)}
                className="px-4 py-1.5 bg-[#171920] hover:bg-[#20232c] text-white rounded border border-[#272a33]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VERIFY FIX MODAL (Verification Gate) */}
      {isVerifyingModalOpen && verifyingRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#101116] border border-[#272a33] w-full max-w-lg rounded-xl p-5 space-y-4 font-mono text-xs">
            <div className="border-b border-[#272a33] pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400">verified</span>
                Verification Gate: Document Validation Evidence
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Recommendations require documented verification notes (minimum 10 characters) detailing the test results or telemetry evidence before advancing to VERIFIED.
              </p>
            </div>

            <div className="p-2.5 bg-[#171920] rounded border border-[#272a33]">
              <span className="text-[#60a5fa] font-bold">Target Recommendation: </span>
              <span className="text-white">{verifyingRec.title}</span>
            </div>

            <div>
              <label className="block text-white font-bold mb-1">
                Verification Notes & Test Results *
              </label>
              <textarea
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder="e.g. Conducted HikariCP load test at 25,000 req/sec; verified connection lease wait time remained < 35ms with zero timeouts over 48h."
                rows={4}
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2.5 text-white placeholder-[#6b7280] focus:border-[#1558C9] outline-none"
              />
              <div className="text-[10px] text-[#6b7280] mt-1">
                Current length: {verificationNotes.trim().length} characters (min 10)
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#272a33]">
              <button
                type="button"
                onClick={() => {
                  setIsVerifyingModalOpen(false);
                  setVerifyingRec(null);
                }}
                className="px-3 py-1.5 bg-[#171920] hover:bg-[#20232c] text-white rounded border border-[#272a33]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || verificationNotes.trim().length < 10}
                onClick={() => handleTransition(verifyingRec.id, 'VERIFIED', { verificationNotes })}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded"
              >
                Confirm Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISMISS MODAL */}
      {isDismissModalOpen && dismissingRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#101116] border border-[#272a33] w-full max-w-lg rounded-xl p-5 space-y-4 font-mono text-xs">
            <div className="border-b border-[#272a33] pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-red-400">cancel</span>
                Dismiss Recommendation
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Please provide an explicit dismissal reason (minimum 5 characters) for the audit log.
              </p>
            </div>

            <div>
              <label className="block text-white font-bold mb-1">
                Dismissal Reason *
              </label>
              <textarea
                value={dismissedReason}
                onChange={(e) => setDismissedReason(e.target.value)}
                placeholder="e.g. Superseded by architectural migration to event-driven queue."
                rows={3}
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2.5 text-white placeholder-[#6b7280] focus:border-red-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#272a33]">
              <button
                type="button"
                onClick={() => {
                  setIsDismissModalOpen(false);
                  setDismissingRec(null);
                }}
                className="px-3 py-1.5 bg-[#171920] hover:bg-[#20232c] text-white rounded border border-[#272a33]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || dismissedReason.trim().length < 5}
                onClick={() => handleTransition(dismissingRec.id, 'DISMISSED', { dismissedReason })}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold rounded"
              >
                Confirm Dismissal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW RECOMMENDATION MODAL */}
      {isNewRecModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateRecommendation}
            className="bg-[#101116] border border-[#272a33] w-full max-w-lg rounded-xl p-5 space-y-3 font-mono text-xs"
          >
            <div className="border-b border-[#272a33] pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1558C9]">add_task</span>
                Propose Preventive Engineering Recommendation
              </h2>
            </div>

            <div>
              <label className="block text-white font-bold mb-1">Title *</label>
              <input
                type="text"
                required
                value={newRecForm.title}
                onChange={(e) => setNewRecForm({ ...newRecForm, title: e.target.value })}
                placeholder="e.g. Implement Circuit Breaker on Payment Gateway"
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-white outline-none focus:border-[#1558C9]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white font-bold mb-1">Target Service *</label>
                <select
                  value={newRecForm.serviceId}
                  onChange={(e) => setNewRecForm({ ...newRecForm, serviceId: e.target.value })}
                  className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-white outline-none focus:border-[#1558C9]"
                >
                  {serviceRisks.map((s) => (
                    <option key={s.serviceId} value={s.serviceId}>{s.serviceName}</option>
                  ))}
                  {serviceRisks.length === 0 && (
                    <option value="payment-service">payment-service</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-white font-bold mb-1">Priority</label>
                <select
                  value={newRecForm.priority}
                  onChange={(e) => setNewRecForm({ ...newRecForm, priority: e.target.value })}
                  className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-white outline-none focus:border-[#1558C9]"
                >
                  <option value="P0">P0 (Critical Blocker)</option>
                  <option value="P1">P1 (High Priority)</option>
                  <option value="P2">P2 (Medium)</option>
                  <option value="P3">P3 (Low)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-white font-bold mb-1">Explanation</label>
              <textarea
                value={newRecForm.explanation}
                onChange={(e) => setNewRecForm({ ...newRecForm, explanation: e.target.value })}
                placeholder="Describe architectural flaw and preventive engineering fix..."
                rows={2}
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-white outline-none focus:border-[#1558C9]"
              />
            </div>

            <div>
              <label className="block text-white font-bold mb-1">Expected Benefit</label>
              <input
                type="text"
                value={newRecForm.expectedBenefit}
                onChange={(e) => setNewRecForm({ ...newRecForm, expectedBenefit: e.target.value })}
                placeholder="e.g. Eliminates cascading timeout failures under peak surge."
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-white outline-none focus:border-[#1558C9]"
              />
            </div>

            <div>
              <label className="block text-white font-bold mb-1">Verification Method *</label>
              <textarea
                required
                value={newRecForm.verificationMethod}
                onChange={(e) => setNewRecForm({ ...newRecForm, verificationMethod: e.target.value })}
                placeholder="Detailed testing or monitoring criteria required to verify this fix in staging or production."
                rows={2}
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-white outline-none focus:border-[#1558C9]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#272a33]">
              <button
                type="button"
                onClick={() => setIsNewRecModalOpen(false)}
                className="px-3 py-1.5 bg-[#171920] hover:bg-[#20232c] text-white rounded border border-[#272a33]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-1.5 bg-[#1558C9] hover:bg-[#124cb0] text-white font-bold rounded"
              >
                Create Recommendation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default OperationalIntelligencePage;

