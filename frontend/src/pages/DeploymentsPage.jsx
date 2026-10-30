import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export const DeploymentsPage = () => {
  const { deployments, rollbackCanary } = useApp();
  const [activeTab, setActiveTab] = useState('canary'); // 'canary', 'pre_deploy', 'blast_radius', 'regressions', 'analytics'
  const [isRollbackRunning, setIsRollbackRunning] = useState(false);
  const [isDiffOpen, setIsDiffOpen] = useState(false);

  // Pre-deployment assessment state
  const [targetServiceId, setTargetServiceId] = useState('payment-service');
  const [previousVersion, setPreviousVersion] = useState('v1.8.2');
  const [newVersion, setNewVersion] = useState('v1.9.0');
  const [deploymentStrategy, setDeploymentStrategy] = useState('rolling');
  const [environment, setEnvironment] = useState('production');
  const [hasSchemaMigration, setHasSchemaMigration] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [assessmentError, setAssessmentError] = useState(null);

  // Post-deployment regressions state
  const [regressions, setRegressions] = useState([]);
  const [isEvaluatingRegression, setIsEvaluatingRegression] = useState(false);

  // Historical Analytics state
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Blast Radius state
  const [blastRadius, setBlastRadius] = useState(null);
  const [loadingBlast, setLoadingBlast] = useState(false);

  const canaryDeploy = deployments.find(d => d.environment === 'canary') || deployments[0] || {};

  const handleRollback = () => {
    setIsRollbackRunning(true);
    setTimeout(() => {
      rollbackCanary(canaryDeploy.id);
      setIsRollbackRunning(false);
    }, 800);
  };

  // Run Pre-Deployment Assessment
  const runAssessment = async () => {
    setIsAssessing(true);
    setAssessmentError(null);
    try {
      const res = await api.assessChange({
        serviceId: targetServiceId,
        previousVersion,
        newVersion,
        deploymentStrategy,
        environment,
        changeType: hasSchemaMigration ? 'schema_migration' : 'code_deployment',
        changedComponents: hasSchemaMigration ? ['db/migration.sql'] : ['src/handler.js']
      });
      setAssessmentResult(res.data);
    } catch (err) {
      setAssessmentError(err.message || 'Failed to assess deployment risk.');
    } finally {
      setIsAssessing(false);
    }
  };

  // Load Blast Radius for Canary
  const loadBlastRadius = async () => {
    setLoadingBlast(true);
    try {
      const res = await api.getChangeBlastRadius('chg-1094').catch(async () => {
        // Fallback to assessChange for payment-service
        return api.assessChange({ serviceId: 'payment-service', newVersion: 'v1.8.3' });
      });
      setBlastRadius(res.data?.impactedServices ? res.data : res.data);
    } catch (err) {
      console.warn('Blast radius fetch fallback:', err.message);
    } finally {
      setLoadingBlast(false);
    }
  };

  // Load Regressions
  const loadRegressions = async () => {
    try {
      const res = await api.getChangeRegressions('chg-1094');
      setRegressions(res.data || []);
    } catch {
      setRegressions([]);
    }
  };

  // Load Historical Analytics
  const loadAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await api.getChangeIntelligenceOverview();
      setAnalytics(res.data);
    } catch (err) {
      console.warn('Analytics fetch fallback:', err.message);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'blast_radius' && !blastRadius) loadBlastRadius();
    if (activeTab === 'regressions' && regressions.length === 0) loadRegressions();
    if (activeTab === 'analytics' && !analytics) loadAnalytics();
  }, [activeTab]);

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#d4ff24]">
            <span className="material-symbols-outlined text-[20px]">deployed_code</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-semibold tracking-tight">Deployments & Change Intelligence</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                canaryDeploy.status === 'rolled_back' ? 'bg-[#50d890]/20 text-[#50d890]' : 'bg-[#93000a] text-[#ffdad6]'
              }`}>
                {canaryDeploy.status === 'rolled_back' ? 'ROLLBACK COMPLETE' : '1 CANARY ANOMALY'}
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Deterministic change risk scoring (0–100), dependency blast radius, post-deployment regression detection & ACA.
            </p>
          </div>
        </div>

        {/* Telemetry Badge */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded bg-[#171920] border border-[#272a33] text-[10px] text-[#9296a3] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff24] animate-pulse"></span>
            Simulated Demo Adapter
          </span>
          <span className="px-2 py-1 rounded bg-[#171920] border border-[#272a33] text-[10px] text-[#b1c5ff] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px]">webhook</span>
            Webhook Ingestion Ready
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 bg-[#101116] border border-[#272a33] rounded-xl p-1 overflow-x-auto text-xs">
        {[
          { id: 'canary', label: 'Deployments & ACA', icon: 'speed' },
          { id: 'pre_deploy', label: 'Pre-Deployment Risk Assessor', icon: 'psychology' },
          { id: 'blast_radius', label: 'Dependency Blast Radius', icon: 'account_tree' },
          { id: 'regressions', label: 'Post-Deployment Regressions', icon: 'trending_down' },
          { id: 'analytics', label: 'Historical Change Intelligence', icon: 'analytics' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#1558c9] text-white shadow-sm'
                : 'text-[#9296A3] hover:text-white hover:bg-[#171920]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: Deployments & ACA (Existing View Elevated) */}
      {activeTab === 'canary' && (
        <div className="space-y-3">
          {/* Hero Active Canary Analysis Card */}
          <div className={`p-4 bg-[#101116] border rounded-xl shadow-md flex flex-col gap-3 ${
            canaryDeploy.status === 'unhealthy' ? 'border-[#ff5364]/50 shadow-[0_0_12px_rgba(255,83,100,0.15)]' : 'border-[#272a33]'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#272a33] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    canaryDeploy.status === 'rolled_back' ? 'bg-[#50d890]/20 text-[#50d890]' : 'bg-[#93000a] text-[#ffdad6]'
                  }`}>
                    {canaryDeploy.status === 'rolled_back' ? 'ROLLED BACK' : 'ACA FAILING'}
                  </span>
                  <span className="text-base text-white font-bold">{canaryDeploy.serviceName} ({canaryDeploy.version})</span>
                  <span className="text-xs text-[#9296A3]">{canaryDeploy.id}</span>
                  <span className="px-2 py-0.5 rounded bg-[#93000a]/40 text-[#ff5364] border border-[#ff5364]/30 text-[10px] font-bold">
                    Risk Score: 78/100 (HIGH)
                  </span>
                </div>
                <p className="text-xs text-[#9296A3] mt-1">
                  Commit <span className="text-[#d4ff24] font-bold">{canaryDeploy.commitSha}</span> by {canaryDeploy.author}: "{canaryDeploy.commitMessage}"
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setIsDiffOpen(!isDiffOpen)}
                  className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e] transition-colors"
                >
                  {isDiffOpen ? 'Hide Git Diff' : 'Inspect Code Diff'}
                </button>
                {canaryDeploy.status !== 'rolled_back' ? (
                  <button
                    onClick={handleRollback}
                    disabled={isRollbackRunning}
                    className="px-3 py-1.5 rounded bg-[#ff5364] text-[#030407] font-bold hover:bg-[#ff7584] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-[15px] ${isRollbackRunning ? 'animate-spin' : ''}`}>
                      replay
                    </span>
                    <span>{isRollbackRunning ? 'Draining Traffic...' : 'Rollback Canary Now'}</span>
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded bg-[#50d890]/20 text-[#50d890] text-xs font-bold border border-[#50d890]/30">
                    Traffic Shifted to Stable
                  </span>
                )}
              </div>
            </div>

            {/* Git Diff drawer */}
            {isDiffOpen && (
              <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg text-xs font-mono space-y-1">
                <div className="text-[#9296A3] pb-1 border-b border-[#272a33]">
                  diff --git a/services/payment/idempotency.go b/services/payment/idempotency.go
                </div>
                <div className="text-[#5A5E6B] leading-tight">
                  @@ -42,6 +42,9 @@ func (s *Server) Authorize(ctx context.Context, req *PaymentReq) (*PaymentResp, error) &#123;<br />
                  <span className="text-[#50d890]">+   // Unindexed table lookup inside transaction</span><br />
                  <span className="text-[#50d890]">+   tx := s.db.Begin()</span><br />
                  <span className="text-[#50d890]">+   defer tx.Rollback()</span><br />
                  <span className="text-[#ff5364]">-   // Previous lockless redis token verify</span>
                </div>
              </div>
            )}

            {/* Canary vs Stable Telemetry Comparison */}
            {canaryDeploy.p99CanaryVsStable && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg">
                  <div className="text-[10px] text-[#9296A3] uppercase">ACA Anomaly Score</div>
                  <div className={`text-2xl font-bold my-1 ${canaryDeploy.status === 'rolled_back' ? 'text-[#50d890]' : 'text-[#ff5364]'}`}>
                    {canaryDeploy.status === 'rolled_back' ? '98 / 100 (Pass)' : '42 / 100 (Fail)'}
                  </div>
                  <div className="text-[10px] text-[#5A5E6B]">Regression threshold: &lt; 85/100</div>
                </div>

                <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg">
                  <div className="text-[10px] text-[#9296A3] uppercase">P99 Latency Regression</div>
                  <div className="text-xl font-bold text-white my-1">
                    Canary: <span className={canaryDeploy.status === 'rolled_back' ? 'text-[#50d890]' : 'text-[#ff5364]'}>{canaryDeploy.p99CanaryVsStable.canary}ms</span> vs Stable: <span className="text-[#50d890]">{canaryDeploy.p99CanaryVsStable.stable}ms</span>
                  </div>
                  <div className="text-[10px] text-[#ff5364]">{canaryDeploy.status === 'rolled_back' ? 'Baseline restored' : '+1,616% latency regression'}</div>
                </div>

                <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg">
                  <div className="text-[10px] text-[#9296A3] uppercase">5xx Error Rate</div>
                  <div className="text-xl font-bold text-white my-1">
                    Canary: <span className={canaryDeploy.status === 'rolled_back' ? 'text-[#50d890]' : 'text-[#ff5364]'}>{canaryDeploy.errorRateCanaryVsStable?.canary}%</span> vs Stable: <span className="text-[#50d890]">{canaryDeploy.errorRateCanaryVsStable?.stable}%</span>
                  </div>
                  <div className="text-[10px] text-[#ff5364]">{canaryDeploy.status === 'rolled_back' ? 'Errors cleared' : '+4.10% failure delta'}</div>
                </div>
              </div>
            )}
          </div>

          {/* Deployment History Table */}
          <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md">
            <h3 className="text-xs font-bold text-white uppercase pb-2 border-b border-[#272a33]">
              Recent Deployment History
            </h3>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[10px] text-[#9296A3] uppercase border-b border-[#272a33]">
                    <th className="py-2 px-3">Service</th>
                    <th className="py-2 px-3">Version</th>
                    <th className="py-2 px-3">Commit</th>
                    <th className="py-2 px-3">Author</th>
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3 text-center">ACA Score</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#272a33]/60">
                  {deployments.map(dep => (
                    <tr key={dep.id} className="hover:bg-[#171920]">
                      <td className="py-2.5 px-3 font-bold text-white">{dep.serviceName}</td>
                      <td className="py-2.5 px-3 text-[#b1c5ff]">{dep.version}</td>
                      <td className="py-2.5 px-3 text-[#d4ff24]">{dep.commitSha}</td>
                      <td className="py-2.5 px-3 text-[#9296A3]">{dep.author}</td>
                      <td className="py-2.5 px-3 text-[#5A5E6B]">{dep.timestamp}</td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {dep.status === 'rolled_back' ? 'Rolled Back' : `${dep.acaScore}/100`}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          dep.status === 'healthy' ? 'bg-[#50d890]/20 text-[#50d890]' :
                          dep.status === 'rolled_back' ? 'bg-[#1558c9]/30 text-[#b1c5ff]' : 'bg-[#93000a] text-[#ffdad6]'
                        }`}>
                          {dep.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Pre-Deployment Risk Assessor */}
      {activeTab === 'pre_deploy' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Assessment Proposal Form */}
          <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md space-y-4">
            <div className="border-b border-[#272a33] pb-2">
              <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-[#d4ff24] text-[18px]">verified_user</span>
                Pre-Deployment Proposal
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Evaluate empirical risk before promoting code to production. Non-blocking.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-[#9296A3] mb-1 font-bold">Target Service</label>
                <select
                  value={targetServiceId}
                  onChange={(e) => setTargetServiceId(e.target.value)}
                  className="w-full bg-[#171920] border border-[#272a33] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#1558c9]"
                >
                  <option value="payment-service">payment-service (Tier-0 Critical)</option>
                  <option value="auth-gateway-v2">auth-gateway-v2 (Tier-0 Edge)</option>
                  <option value="checkout-api">checkout-api (Tier-0 Commerce)</option>
                  <option value="inventory-mesh">inventory-mesh (Tier-1)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#9296A3] mb-1 font-bold">Previous Version</label>
                  <input
                    type="text"
                    value={previousVersion}
                    onChange={(e) => setPreviousVersion(e.target.value)}
                    className="w-full bg-[#171920] border border-[#272a33] rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-[#1558c9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9296A3] mb-1 font-bold">Target Version</label>
                  <input
                    type="text"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="w-full bg-[#171920] border border-[#272a33] rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-[#1558c9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#9296A3] mb-1 font-bold">Environment</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full bg-[#171920] border border-[#272a33] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#1558c9]"
                  >
                    <option value="production">production</option>
                    <option value="canary">canary</option>
                    <option value="staging">staging</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9296A3] mb-1 font-bold">Strategy</label>
                  <select
                    value={deploymentStrategy}
                    onChange={(e) => setDeploymentStrategy(e.target.value)}
                    className="w-full bg-[#171920] border border-[#272a33] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#1558c9]"
                  >
                    <option value="canary">Canary (Gradual Ramp)</option>
                    <option value="rolling">Rolling Update</option>
                    <option value="blue-green">Blue-Green</option>
                    <option value="recreate">Recreate (Outage Risk)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-[#171920] border border-[#272a33] rounded-lg">
                <input
                  type="checkbox"
                  id="schemaMig"
                  checked={hasSchemaMigration}
                  onChange={(e) => setHasSchemaMigration(e.target.checked)}
                  className="rounded border-[#272a33] text-[#1558c9] focus:ring-0"
                />
                <label htmlFor="schemaMig" className="text-[11px] text-[#b1c5ff] cursor-pointer">
                  Includes Database Schema Migration or Stateful DDL
                </label>
              </div>

              <button
                onClick={runAssessment}
                disabled={isAssessing}
                className="w-full py-2 px-4 rounded-lg bg-[#1558c9] text-white font-bold hover:bg-[#1f6feb] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[16px] ${isAssessing ? 'animate-spin' : ''}`}>
                  {isAssessing ? 'progress_activity' : 'calculate'}
                </span>
                <span>{isAssessing ? 'Evaluating 9 Risk Factors...' : 'Assess Deployment Risk'}</span>
              </button>

              {assessmentError && (
                <div className="p-2 rounded bg-[#ff5364]/10 border border-[#ff5364]/30 text-[#ff5364] text-[11px]">
                  {assessmentError}
                </div>
              )}
            </div>
          </div>

          {/* Assessment Output & Breakdown */}
          <div className="lg:col-span-2 bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md space-y-4">
            <div className="border-b border-[#272a33] pb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1558c9] text-[18px]">assessment</span>
                Assessment Report
              </h2>
              {assessmentResult && (
                <span className="text-[10px] text-[#5A5E6B]">ID: {assessmentResult.id}</span>
              )}
            </div>

            {!assessmentResult && !isAssessing && (
              <div className="p-12 text-center text-[#5A5E6B] space-y-2">
                <span className="material-symbols-outlined text-4xl text-[#272a33]">rule</span>
                <p className="text-xs">No active assessment. Select parameters and click "Assess Deployment Risk".</p>
              </div>
            )}

            {isAssessing && (
              <div className="p-12 text-center text-[#9296A3] space-y-2">
                <div className="animate-spin text-3xl text-[#d4ff24] material-symbols-outlined">sync</div>
                <p className="text-xs">Correlating topology, SLO health, and historical failure rate...</p>
              </div>
            )}

            {assessmentResult && (
              <div className="space-y-4">
                {/* Score & Recommendation Banner */}
                <div className="p-4 bg-[#171920] border border-[#272a33] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center border font-bold ${
                      assessmentResult.riskScore >= 60
                        ? 'bg-[#93000a]/20 border-[#ff5364] text-[#ff5364]'
                        : assessmentResult.riskScore >= 30
                        ? 'bg-[#e2a03f]/20 border-[#e2a03f] text-[#e2a03f]'
                        : 'bg-[#50d890]/20 border-[#50d890] text-[#50d890]'
                    }`}>
                      <span className="text-2xl leading-none">{assessmentResult.riskScore}</span>
                      <span className="text-[9px] uppercase tracking-wider">/ 100</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                          assessmentResult.recommendation === 'HIGH_RISK'
                            ? 'bg-[#93000a] text-white'
                            : assessmentResult.recommendation === 'REVIEW_RECOMMENDED'
                            ? 'bg-[#e2a03f] text-black'
                            : 'bg-[#50d890]/20 text-[#50d890] border border-[#50d890]/30'
                        }`}>
                          {assessmentResult.recommendation.replace('_', ' ')}
                        </span>
                        <span className="text-xs font-bold text-white uppercase">Category: {assessmentResult.riskCategory}</span>
                        <span className="text-[10px] text-[#9296A3]">Confidence: {assessmentResult.confidence}</span>
                      </div>
                      <p className="text-xs text-[#9296A3] mt-1">
                        Empirical risk for {assessmentResult.serviceId} ({assessmentResult.version.previous} → {assessmentResult.version.new}) in {assessmentResult.environment}.
                      </p>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <div className="text-[10px] text-[#9296A3] uppercase">Blast Radius Exposure</div>
                    <div className="text-lg font-bold text-white">
                      {assessmentResult.blastRadiusSummary?.totalImpactedCount || 0} Downstream Callers
                    </div>
                    <div className="text-[10px] text-[#ff5364]">
                      {assessmentResult.blastRadiusSummary?.criticalDownstreamCount || 0} Critical Tier-0 Services
                    </div>
                  </div>
                </div>

                {/* 9 Factor Breakdown Cards */}
                <div>
                  <h3 className="text-xs font-bold text-[#b1c5ff] uppercase mb-2">Explainable Risk Factor Breakdown (Max 100)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    {Object.entries(assessmentResult.factorBreakdowns || {}).map(([key, factor]) => (
                      <div key={key} className="p-2.5 bg-[#171920] border border-[#272a33] rounded-lg">
                        <div className="flex justify-between items-center text-[10px] text-[#9296A3]">
                          <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <span className="font-bold text-white">{factor.points} / {factor.max} pts</span>
                        </div>
                        <div className="w-full bg-[#272a33] h-1.5 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className={`h-full ${
                              factor.points > factor.max * 0.6
                                ? 'bg-[#ff5364]'
                                : factor.points > 0
                                ? 'bg-[#e2a03f]'
                                : 'bg-[#50d890]'
                            }`}
                            style={{ width: `${Math.min(100, (factor.points / factor.max) * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Verifications */}
                {assessmentResult.recommendedVerifications?.length > 0 && (
                  <div className="p-3 bg-[#171920] border border-[#272a33] rounded-xl space-y-2">
                    <div className="text-xs font-bold text-[#d4ff24] uppercase flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px]">checklist</span>
                      Actionable Verification Checklist
                    </div>
                    <ul className="text-xs text-[#b1c5ff] space-y-1">
                      {assessmentResult.recommendedVerifications.map((v, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[#d4ff24]">▸</span>
                          <span>{v}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Dependency Blast Radius */}
      {activeTab === 'blast_radius' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md space-y-4">
          <div className="border-b border-[#272a33] pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1558c9] text-[18px]">hub</span>
                Dependency Blast Radius & Topology Propagation
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Directional caller analysis: Identifies services that call the changed service and suffer cascading failures.
              </p>
            </div>
            <button
              onClick={loadBlastRadius}
              className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-xs text-white hover:bg-[#22252e]"
            >
              Refresh Topology Graph
            </button>
          </div>

          {loadingBlast ? (
            <div className="p-12 text-center text-[#9296A3]">Loading graph...</div>
          ) : (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                  <div className="text-[10px] text-[#9296A3] uppercase">Target Changed Service</div>
                  <div className="text-base font-bold text-white mt-1">payment-service</div>
                  <div className="text-[10px] text-[#d4ff24]">Tier-0 Critical (Core)</div>
                </div>

                <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                  <div className="text-[10px] text-[#9296A3] uppercase">Direct Downstream Callers</div>
                  <div className="text-xl font-bold text-white mt-1">1 Direct Caller</div>
                  <div className="text-[10px] text-[#ff5364]">checkout-api (1-hop)</div>
                </div>

                <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                  <div className="text-[10px] text-[#9296A3] uppercase">Critical Tier-0 in Blast Path</div>
                  <div className="text-xl font-bold text-[#ff5364] mt-1">2 Services</div>
                  <div className="text-[10px] text-[#9296A3]">checkout-api, payment-service</div>
                </div>

                <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                  <div className="text-[10px] text-[#9296A3] uppercase">Active SLO Impact</div>
                  <div className="text-xl font-bold text-[#e2a03f] mt-1">2 SLOs Monitored</div>
                  <div className="text-[10px] text-[#50d890]">Error Budget Monitored</div>
                </div>
              </div>

              {/* Visual Blast Propagation Flow */}
              <div className="p-4 bg-[#030407] border border-[#272a33] rounded-xl space-y-3">
                <div className="text-xs font-bold text-white uppercase flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ff5364] text-[16px]">arrow_downward</span>
                  Directional Impact Propagation Flow
                </div>

                <div className="flex flex-col md:flex-row items-center justify-center gap-3 p-4 bg-[#101116] border border-[#272a33] rounded-lg">
                  {/* Changed Target */}
                  <div className="p-3 bg-[#93000a]/20 border border-[#ff5364] rounded-lg text-center min-w-[180px]">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ff5364] text-black font-bold uppercase">TARGET REVISION</span>
                    <div className="text-sm font-bold text-white mt-1">payment-service</div>
                    <div className="text-[10px] text-[#9296A3]">v1.8.3 Canary</div>
                  </div>

                  <div className="text-center font-bold text-[#ff5364]">
                    <span className="material-symbols-outlined text-2xl">east</span>
                    <div className="text-[9px] text-[#9296A3]">1-Hop Direct</div>
                  </div>

                  {/* Direct Caller */}
                  <div className="p-3 bg-[#171920] border border-[#e2a03f] rounded-lg text-center min-w-[180px]">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#e2a03f] text-black font-bold uppercase">DIRECT CALLER</span>
                    <div className="text-sm font-bold text-white mt-1">checkout-api</div>
                    <div className="text-[10px] text-[#e2a03f]">Tier-0 (Active Incident)</div>
                  </div>

                  <div className="text-center font-bold text-[#b1c5ff]">
                    <span className="material-symbols-outlined text-2xl">east</span>
                    <div className="text-[9px] text-[#9296A3]">2-Hop Transitive</div>
                  </div>

                  {/* Edge Caller */}
                  <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg text-center min-w-[180px]">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#272a33] text-[#9296A3] font-bold uppercase">TRANSITIVE CALLER</span>
                    <div className="text-sm font-bold text-white mt-1">auth-gateway-v2</div>
                    <div className="text-[10px] text-[#9296A3]">Edge Ingress Gateway</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Post-Deployment Regressions */}
      {activeTab === 'regressions' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md space-y-4">
          <div className="border-b border-[#272a33] pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ff5364] text-[18px]">troubleshoot</span>
                Post-Deployment Telemetry Regressions
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Compares pre-deployment baseline against observation window. Distinguishes temporal correlation from causation.
              </p>
            </div>
            <button
              onClick={async () => {
                setIsEvaluatingRegression(true);
                try {
                  const res = await api.evaluateChangeRegression('chg-1094', { observationWindowMinutes: 30 });
                  setRegressions(res.data?.regressions || []);
                } finally {
                  setIsEvaluatingRegression(false);
                }
              }}
              disabled={isEvaluatingRegression}
              className="px-3 py-1.5 rounded bg-[#1558c9] text-white text-xs font-bold hover:bg-[#1f6feb] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[15px] ${isEvaluatingRegression ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span>{isEvaluatingRegression ? 'Scanning Metrics...' : 'Evaluate Regressions Now'}</span>
            </button>
          </div>

          <div className="space-y-3">
            {regressions.length === 0 ? (
              <div className="p-8 text-center text-[#5A5E6B] text-xs">
                No regressions detected or click "Evaluate Regressions Now".
              </div>
            ) : (
              regressions.map((reg, idx) => (
                <div key={idx} className="p-3 bg-[#171920] border border-[#272a33] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        reg.regression_severity === 'critical' ? 'bg-[#93000a] text-white' : 'bg-[#e2a03f] text-black'
                      }`}>
                        {reg.regression_severity}
                      </span>
                      <span className="text-xs font-bold text-white uppercase">{reg.metric_name}</span>
                      <span className="px-2 py-0.5 rounded bg-[#101116] border border-[#272a33] text-[10px] text-[#b1c5ff]">
                        {reg.causality_status || 'correlated_temporal'}
                      </span>
                    </div>
                    <p className="text-xs text-[#9296A3] mt-1.5">{reg.explanation}</p>
                    <div className="flex items-center gap-4 text-[10px] text-[#5A5E6B] mt-2">
                      <span>Window: {reg.observation_window_minutes}m</span>
                      <span>Related Incident: {reg.related_incidents?.join(', ') || 'None'}</span>
                      <span>Temporal Association: {reg.temporal_association ? 'Confirmed' : 'Uncorrelated'}</span>
                    </div>
                  </div>

                  <div className="text-right text-xs bg-[#101116] p-3 rounded-lg border border-[#272a33] min-w-[140px]">
                    <div className="text-[10px] text-[#9296A3] uppercase">Shift Delta</div>
                    <div className="text-lg font-bold text-[#ff5364]">+{reg.delta_percent}%</div>
                    <div className="text-[10px] text-[#5A5E6B]">{reg.baseline_value} → {reg.current_value}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Historical Change Intelligence */}
      {activeTab === 'analytics' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md space-y-4">
          <div className="border-b border-[#272a33] pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-[#d4ff24] text-[18px]">monitoring</span>
                Historical Change Analytics & DORA Metrics
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Empirical delivery reliability metrics computed across deployment events.
              </p>
            </div>
            <button
              onClick={loadAnalytics}
              className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-xs text-white hover:bg-[#22252e]"
            >
              Recalculate
            </button>
          </div>

          {loadingAnalytics ? (
            <div className="p-12 text-center text-[#9296A3]">Calculating metrics...</div>
          ) : analytics ? (
            <div className="space-y-4 text-xs">
              {/* Sample Size Disclosure */}
              <div className="p-2.5 bg-[#171920] border border-[#272a33] rounded-lg text-[11px] text-[#b1c5ff] flex items-center justify-between">
                <span>Sample Status: <strong className="text-white uppercase">{analytics.sampleSizeStatus}</strong> (Observed: {analytics.sampleSize} deployments, Minimum required: {analytics.minRequiredSamples})</span>
                {analytics.dateRange && (
                  <span className="text-[#5A5E6B]">Timespan: Last {analytics.dateRange.timespanHours} hours</span>
                )}
              </div>

              {/* DORA KPI Cards */}
              {analytics.metrics && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                    <div className="text-[10px] text-[#9296A3] uppercase">Change Failure Rate</div>
                    <div className="text-2xl font-bold text-[#ff5364] mt-1">
                      {analytics.metrics.changeFailureRatePercent}%
                    </div>
                    <div className="text-[10px] text-[#5A5E6B]">{analytics.metrics.failedDeploymentsCount} of {analytics.metrics.totalDeployments} failed</div>
                  </div>

                  <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                    <div className="text-[10px] text-[#9296A3] uppercase">Mean Time to Recovery (MTTR)</div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {analytics.metrics.meanTimeToRecoveryMinutes}m
                    </div>
                    <div className="text-[10px] text-[#50d890]">Rollback drain time</div>
                  </div>

                  <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                    <div className="text-[10px] text-[#9296A3] uppercase">Total Evaluated Deployments</div>
                    <div className="text-2xl font-bold text-[#d4ff24] mt-1">
                      {analytics.metrics.totalDeployments}
                    </div>
                    <div className="text-[10px] text-[#5A5E6B]">Across all environments</div>
                  </div>

                  <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                    <div className="text-[10px] text-[#9296A3] uppercase">Risk Tiering Accuracy</div>
                    <div className="text-2xl font-bold text-[#50d890] mt-1">
                      100%
                    </div>
                    <div className="text-[10px] text-[#5A5E6B]">High-risk changes flagged correctly</div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
