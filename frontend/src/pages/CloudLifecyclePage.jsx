// ==============================================================================
// InfraPulse - Cloud Resource Lifecycle & Cost Governance Dashboard
// Phase 23E: Governed AWS EC2 Start/Stop Lifecycle Management & Multi-Cloud Governance
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export const CloudLifecyclePage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'operations' | 'schedules' | 'costs' | 'audit'

  // Data states
  const [resources, setResources] = useState([]);
  const [operations, setOperations] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [costEstimate, setCostEstimate] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [killSwitch, setKillSwitch] = useState({ active: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Scaling state for Kubernetes workloads
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [scaleTargetResource, setScaleTargetResource] = useState(null);
  const [targetReplicas, setTargetReplicas] = useState(1);
  const [allowStatefulSetScale, setAllowStatefulSetScale] = useState(false);

  // Phase 23G: Infrastructure Drift & Reconciliation States
  const [drifts, setDrifts] = useState([]);
  const [driftStats, setDriftStats] = useState(null);
  const [activeBaseline, setActiveBaseline] = useState(null);
  const [detectingDrift, setDetectingDrift] = useState(false);
  const [initializingBaseline, setInitializingBaseline] = useState(false);
  const [selectedDrift, setSelectedDrift] = useState(null);
  const [driftDetailModalOpen, setDriftDetailModalOpen] = useState(false);
  const [reconciliationPlan, setReconciliationPlan] = useState(null);
  const [reconciliationModalOpen, setReconciliationModalOpen] = useState(false);
  const [submittingReconciliation, setSubmittingReconciliation] = useState(false);
  const [driftSeverityFilter, setDriftSeverityFilter] = useState('all');
  const [driftStatusFilter, setDriftStatusFilter] = useState('all');

  // AWS Discovery & Identity States
  const [awsStatus, setAwsStatus] = useState(null);
  const [awsRegion, setAwsRegion] = useState('ap-south-1');
  const [discoveringAws, setDiscoveringAws] = useState(false);
  const [freeTierGuidelines, setFreeTierGuidelines] = useState(null);

  // Filters
  const [providerFilter, setProviderFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all'); // 'all' | 'live' | 'simulated'
  const [stateFilter, setStateFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dry-run modal
  const [dryRunModalOpen, setDryRunModalOpen] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [selectedResource, setSelectedResource] = useState(null);
  const [selectedAction, setSelectedAction] = useState('stop');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState(null);

  // Explicit Confirmation Modal for Real AWS Execution
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmOperation, setConfirmOperation] = useState(null);
  const [explicitConfirmationChecked, setExplicitConfirmationChecked] = useState(false);
  const [executingOperation, setExecutingOperation] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resData, opsData, schedData, costData, killData, auditData, awsData, ftData, driftsData, statsData, baselineData] = await Promise.all([
        api.getCloudResources(),
        api.getCloudOperations(),
        api.getCloudSchedules(),
        api.getCloudCostEstimate({ environment: 'staging' }),
        api.getCloudKillSwitch(),
        user?.role==='admin'?api.getCloudAuditTrail({ limit: 25 }):Promise.resolve({data:[]}),
        api.getAwsStatus(awsRegion).catch(() => ({ data: { connected: false } })),
        api.getAwsFreeTierGuidelines().catch(() => ({ data: null })),
        api.getDriftEvents({ environment: 'staging' }).catch(() => ({ data: [] })),
        api.getDriftStats({ environment: 'staging' }).catch(() => ({ data: null })),
        api.getActiveBaseline({ environment: 'staging' }).catch(() => ({ data: null }))
      ]);

      setResources(resData.data || []);
      setOperations(opsData.data || []);
      setSchedules(schedData.data || []);
      setCostEstimate(costData.data || null);
      setKillSwitch(killData.data || { active: false });
      setAuditLogs(auditData.data || []);
      setAwsStatus(awsData?.data || null);
      setFreeTierGuidelines(ftData?.data || null);
      setDrifts(driftsData?.data || []);
      setDriftStats(statsData?.data || null);
      setActiveBaseline(baselineData?.data || null);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load cloud lifecycle telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [awsRegion,user?.role]);

  const handleDiscoverAws = async () => {
    if (user?.role !== 'admin') {
      alert('Access Denied: Only Administrators are authorized to trigger AWS resource discovery.');
      return;
    }

    setDiscoveringAws(true);
    try {
      const res = await api.discoverAwsResources(awsRegion);
      const data = res.data;
      setNotificationMsg(`AWS Discovery Complete: ${data.counts?.total || 0} live resource(s) synchronized from ${data.region}.`);
      fetchData();
    } catch (err) {
      alert(`AWS Discovery Error: ${err.message}`);
    } finally {
      setDiscoveringAws(false);
    }
  };

  // Phase 23G Handlers
  const handleTriggerDriftScan = async () => {
    setDetectingDrift(true);
    try {
      const res = await api.triggerDriftDetection({ environment: 'staging' });
      setNotificationMsg(`Drift Detection Completed: ${res.data?.driftsDetectedCount || 0} drift event(s) observed against baseline v${res.data?.baselineVersion || 1}.`);
      fetchData();
    } catch (err) {
      alert(`Drift scan failed: ${err.message}`);
    } finally {
      setDetectingDrift(false);
    }
  };

  const handleInitializeBaseline = async () => {
    if (user?.role !== 'admin') {
      alert('Access Denied: Only Administrators can initialize desired-state baselines.');
      return;
    }

    if (!window.confirm('Initialize desired-state baseline from all current staging workloads? This will establish the new golden configuration.')) {
      return;
    }

    setInitializingBaseline(true);
    try {
      const res = await api.initializeBaselineFromInventory({ environment: 'staging' });
      setNotificationMsg(`Desired-state baseline v${res.data?.version} initialized successfully.`);
      fetchData();
    } catch (err) {
      alert(`Baseline initialization failed: ${err.message}`);
    } finally {
      setInitializingBaseline(false);
    }
  };

  const handleViewDriftDetails = (drift) => {
    setSelectedDrift(drift);
    setDriftDetailModalOpen(true);
  };

  const handleAcknowledgeDrift = async (driftId, status) => {
    try {
      await api.acknowledgeOrIgnoreDrift(driftId, { status, reason: 'Manual review in dashboard' });
      setNotificationMsg(`Drift ${driftId} status updated to '${status}'.`);
      if (driftDetailModalOpen) setDriftDetailModalOpen(false);
      fetchData();
    } catch (err) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleOpenReconciliation = async (drift) => {
    setSelectedDrift(drift);
    try {
      const res = await api.previewReconciliationPlan({ driftId: drift.id });
      setReconciliationPlan(res.data);
      setReconciliationModalOpen(true);
    } catch (err) {
      alert(`Failed to generate reconciliation plan: ${err.message}`);
    }
  };

  const handleSubmitReconciliation = async () => {
    if (!reconciliationPlan) return;
    setSubmittingReconciliation(true);
    try {
      const res = await api.submitReconciliationRequest({
        planId: reconciliationPlan.id,
        reason: 'Authorized reconciliation from Drift Dashboard'
      });
      setNotificationMsg(`Reconciliation submitted! Operation '${res.data?.lifecycleOperation?.id}' pending two-person approval.`);
      setReconciliationModalOpen(false);
      fetchData();
    } catch (err) {
      alert(`Failed to submit reconciliation: ${err.message}`);
    } finally {
      setSubmittingReconciliation(false);
    }
  };

  const handleOpenDryRun = async (resource, action, extraOptions = {}) => {
    setSelectedResource(resource);
    setSelectedAction(action);
    setDryRunResult(null);
    setDryRunLoading(true);
    setDryRunModalOpen(true);

    try {
      const result = await api.dryRunCloudOperation({
        resourceId: resource.id,
        action,
        targetReplicas: extraOptions.targetReplicas,
        allowStatefulSetScale: extraOptions.allowStatefulSetScale,
        exceptionalAuthorization: extraOptions.exceptionalAuthorization
      });
      setDryRunResult(result.data);
    } catch (err) {
      setDryRunResult({
        safe: false,
        blockers: [err.message || 'Dry-run evaluation failed.'],
        warnings: []
      });
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleOpenScaleModal = (resource) => {
    setScaleTargetResource(resource);
    setTargetReplicas(resource.metadata?.replicas || 1);
    setAllowStatefulSetScale(false);
    setScaleModalOpen(true);
  };

  const handleConfirmScaleDryRun = () => {
    if (!scaleTargetResource) return;
    setScaleModalOpen(false);
    handleOpenDryRun(scaleTargetResource, targetReplicas === 0 ? 'scale_down' : 'scale', {
      targetReplicas,
      allowStatefulSetScale
    });
  };

  const handleSubmitRequest = async () => {
    if (!dryRunResult || !dryRunResult.safe) return;
    setSubmittingRequest(true);
    try {
      const idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await api.requestCloudOperation({
        resourceId: selectedResource.id,
        action: selectedAction,
        idempotencyKey,
        dryRunId: dryRunResult.dryRunId,
        targetReplicas: selectedAction.includes('scale') ? (targetReplicas !== undefined ? targetReplicas : 1) : undefined,
        allowStatefulSetScale
      });
      setNotificationMsg(`Operation '${selectedAction}' requested successfully. Awaiting two-person approval.`);
      setDryRunModalOpen(false);
      fetchData();
    } catch (err) {
      alert(`Request submission failed: ${err.message}`);
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleApprove = async (opId) => {
    try {
      await api.approveCloudOperation(opId);
      setNotificationMsg(`Operation ${opId} approved.`);
      fetchData();
    } catch (err) {
      alert(`Approval failed: ${err.message}`);
    }
  };

  const handleExecuteClick = (op) => {
    const isLive = op.resource_id?.startsWith('aws-') || op.provider === 'aws' || op.is_live === true;
    if (isLive) {
      setConfirmOperation(op);
      setExplicitConfirmationChecked(false);
      setConfirmModalOpen(true);
    } else {
      executeApprovedOperation(op.id, false);
    }
  };

  const executeApprovedOperation = async (opId, explicitConfirmation = false) => {
    setExecutingOperation(true);
    try {
      await api.executeCloudOperation(opId, { explicitConfirmation });
      setNotificationMsg(`Operation ${opId} executed successfully.`);
      setConfirmModalOpen(false);
      fetchData();
    } catch (err) {
      alert(`Execution failed: ${err.message}`);
    } finally {
      setExecutingOperation(false);
    }
  };

  const handleCancel = async (opId) => {
    const reason = prompt('Reason for cancelling this operation:');
    if (!reason) return;
    try {
      await api.cancelCloudOperation(opId, { reason });
      setNotificationMsg(`Operation ${opId} cancelled.`);
      fetchData();
    } catch (err) {
      alert(`Cancellation failed: ${err.message}`);
    }
  };

  const handleToggleSchedule = async (schedId, currentPaused) => {
    try {
      await api.updateCloudSchedule(schedId, { is_paused: !currentPaused });
      fetchData();
    } catch (err) {
      alert(`Failed to update schedule: ${err.message}`);
    }
  };

  const handleToggleKillSwitch = async () => {
    const nextState = !killSwitch.active;
    const confirmMsg = nextState
      ? 'EMERGENCY ACTION: Activate global cloud lifecycle kill switch? All mutating cloud operations will be frozen.'
      : 'Deactivate global cloud lifecycle kill switch? Mutating operations will resume.';
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await api.toggleCloudKillSwitch({
        enabled: nextState,
        reason: nextState ? 'Administrative manual emergency freeze' : null
      });
      setKillSwitch(res.data);
      setNotificationMsg(nextState ? 'KILL SWITCH ENGAGED.' : 'Kill switch disengaged.');
    } catch (err) {
      alert(`Kill switch update failed: ${err.message}`);
    }
  };

  const filteredResources = resources.filter((r) => {
    if (providerFilter !== 'all' && r.provider !== providerFilter) return false;
    if (stateFilter !== 'all' && r.current_state !== stateFilter) return false;

    const isLive = r.metadata?.is_live_aws === true;
    if (originFilter === 'live' && !isLive) return false;
    if (originFilter === 'simulated' && isLive) return false;

    if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase()) && !r.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const liveCount = resources.filter(r => r.metadata?.is_live_aws === true).length;
  const simulatedCount = resources.filter(r => r.metadata?.is_live_aws !== true).length;
  const runningCount = resources.filter(r => r.current_state === 'running' || r.current_state === 'in-use' || r.current_state === 'available').length;
  const stoppedCount = resources.filter(r => r.current_state === 'stopped' || r.current_state === 'scaled_down').length;

  return (
    <div className="space-y-6 text-[#e2e2e9] font-mono">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#272a33] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Cloud Resource Lifecycle & Cost Governance</h1>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              AWS EC2 GOVERNED LIFECYCLE
            </span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              TWO-PERSON APPROVAL
            </span>
          </div>
          <p className="text-xs text-[#9296A3] mt-1">
            Controlled EC2 start/stop management, strict eligibility guardrails, two-person approvals & persistent storage defense.
          </p>
        </div>

        {/* Global Controls & Kill Switch */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-[#9296A3] hover:text-white hover:border-[#383d4a] transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={handleToggleKillSwitch}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-md ${
                killSwitch.active
                  ? 'bg-rose-600 text-white animate-pulse border border-rose-400'
                  : 'bg-[#171920] text-rose-400 border border-rose-900/50 hover:bg-rose-950/40'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">emergency_home</span>
              {killSwitch.active ? 'KILL SWITCH ENGAGED' : 'Engage Kill Switch'}
            </button>
          )}
        </div>
      </div>

      {/* AWS READ-ONLY CONNECTION & DISCOVERY CONTROL PANEL */}
      <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              awsStatus?.connected
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                : 'bg-amber-950/40 border-amber-800 text-amber-400'
            }`}>
              <span className="material-symbols-outlined text-[24px]">cloud_sync</span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">AWS Integration (ap-south-1 Mumbai)</span>
                {awsStatus?.connected ? (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    CONNECTED (READ-ONLY)
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                    CREDENTIAL PROVIDER PENDING
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#9296A3]">
                {awsStatus?.identity?.accountIdMasked && (
                  <span>Account: <strong className="text-white font-mono">{awsStatus.identity.accountIdMasked}</strong></span>
                )}
                {awsStatus?.identity?.arnMasked && (
                  <span>IAM: <strong className="text-zinc-300 font-mono text-[11px]">{awsStatus.identity.arnMasked}</strong></span>
                )}
                <span>Region: <strong className="text-white">{awsStatus?.region || 'ap-south-1'}</strong></span>
                <span>Live Discovered: <strong className="text-cyan-400">{awsStatus?.liveResourcesCount || liveCount} workloads</strong></span>
                {awsStatus?.lastSyncAt && (
                  <span>Last Sync: <strong className="text-zinc-400">{new Date(awsStatus.lastSyncAt).toLocaleTimeString()}</strong></span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Region Selector */}
            <select
              value={awsRegion}
              onChange={(e) => setAwsRegion(e.target.value)}
              className="bg-[#030407] border border-[#272a33] text-xs text-white px-3 py-2 rounded focus:outline-none focus:border-[#1558C9]"
            >
              <option value="ap-south-1">ap-south-1 (Mumbai)</option>
            </select>

            {/* Discover AWS Button */}
            <button
              onClick={handleDiscoverAws}
              disabled={discoveringAws || user?.role !== 'admin'}
              className="px-4 py-2 rounded text-xs font-bold transition-all flex items-center gap-2 bg-[#1558C9] text-white hover:bg-[#124ab0] disabled:opacity-50 shadow-md shadow-[#1558C9]/20"
              title={user?.role !== 'admin' ? 'Administrator role required to trigger AWS discovery.' : 'Trigger read-only resource discovery in ap-south-1'}
            >
              <span className={`material-symbols-outlined text-[16px] ${discoveringAws ? 'animate-spin' : ''}`}>
                {discoveringAws ? 'sync' : 'travel_explore'}
              </span>
              {discoveringAws ? 'Discovering AWS...' : 'Discover AWS Resources'}
            </button>
          </div>
        </div>

        {/* Informational Safety Banner */}
        <div className="mt-3 pt-3 border-t border-[#272a33]/60 flex items-center justify-between text-[11px] text-[#9296A3]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400 text-[16px]">verified_user</span>
            <span>Governed EC2 mutations require allowlisting, non-production tags, dry-run evaluation, two-person approval, and explicit confirmation.</span>
          </div>
          <span className="text-emerald-400 font-bold hidden sm:inline">AWS_LIFECYCLE_MUTATIONS_ENABLED: False (Default)</span>
        </div>
      </div>

      {/* Kill Switch Alert Banner */}
      {killSwitch.active && (
        <div className="bg-rose-950/50 border border-rose-800 text-rose-200 px-4 py-3 rounded-lg flex items-center gap-3">
          <span className="material-symbols-outlined text-rose-400 text-[24px]">warning</span>
          <div className="text-xs">
            <span className="font-bold">GLOBAL CLOUD LIFECYCLE KILL SWITCH IS ACTIVE:</span> All start, stop, restart, and scaling operations are suspended by Administrator ({killSwitch.enabledBy || 'Admin'}).
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notificationMsg && (
        <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-200 px-4 py-2.5 rounded text-xs flex justify-between items-center">
          <span>{notificationMsg}</span>
          <button onClick={() => setNotificationMsg(null)} className="text-emerald-400 font-bold ml-4">✕</button>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Workloads & Origin */}
        <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span>Inventoried Workloads</span>
            <span className="material-symbols-outlined text-[18px]">dns</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{resources.length}</span>
            <span className="text-[11px] text-cyan-400 font-medium">{liveCount} Live AWS</span>
            <span className="text-[11px] text-[#9296A3] font-medium">/ {simulatedCount} Sim</span>
          </div>
          <div className="mt-2 text-[10px] text-[#9296A3] flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">{runningCount} Running</span>
            <span>•</span>
            <span className="text-zinc-400">{stoppedCount} Stopped</span>
          </div>
        </div>

        {/* Current Hourly Cost */}
        <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span>Estimated Hourly Burn</span>
            <span className="material-symbols-outlined text-[18px]">payments</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">
              ${costEstimate ? costEstimate.current_hourly_total.toFixed(4) : '0.0000'}
            </span>
            <span className="text-xs text-[#9296A3]">/ hr</span>
          </div>
          <div className="mt-2 text-[10px] text-[#9296A3]">
            Daily: ${costEstimate ? costEstimate.estimated_daily_total.toFixed(2) : '0.00'} (ap-south-1 rates)
          </div>
        </div>

        {/* Monthly Projection */}
        <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span>Monthly Run-Rate (730h)</span>
            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">
              ${costEstimate ? costEstimate.estimated_monthly_total.toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-[#9296A3]">/ mo</span>
          </div>
          <div className="mt-2 text-[10px] text-amber-400 font-medium">
            Storage baseline: ${costEstimate ? costEstimate.ongoing_monthly_storage_cost.toFixed(2) : '0.00'}/mo
          </div>
        </div>

        {/* Free Tier & Savings */}
        <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
          <div className="flex items-center justify-between text-[#9296A3] text-xs">
            <span>Free Tier & Savings</span>
            <span className="material-symbols-outlined text-emerald-400 text-[18px]">savings</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-emerald-400">
              ${costEstimate ? costEstimate.estimated_monthly_savings.toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-emerald-500 font-bold">/ mo</span>
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Free Tier: <span className="text-amber-300 font-bold">Not verified</span> (Billing isolated)
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#272a33] text-xs space-x-1">
        {[
          { id: 'inventory', label: 'Resource Inventory', icon: 'inventory_2', count: resources.length },
          { id: 'drift', label: 'Infrastructure Drift', icon: 'compare_arrows', count: driftStats?.active_unresolved || drifts.filter(d => d.status === 'detected').length },
          { id: 'operations', label: 'Operations & Approvals', icon: 'approval', count: operations.filter(o => o.status === 'pending_approval').length },
          { id: 'schedules', label: 'Automated Schedules', icon: 'schedule', count: schedules.length },
          { id: 'costs', label: 'Cost & Free Tier Intelligence', icon: 'bar_chart' },
          { id: 'audit', label: 'Lifecycle Audit', icon: 'history' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-[#1558C9] text-white bg-[#171920]'
                : 'border-transparent text-[#9296A3] hover:text-white hover:bg-[#171920]/40'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                tab.id === 'operations' ? 'bg-amber-500/20 text-amber-300' : 'bg-[#272a33] text-white'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: RESOURCE INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-[#101116] p-3 rounded-lg border border-[#272a33]">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search workloads by name, ID or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-3 py-1.5 rounded text-xs text-white placeholder-[#9296A3] w-full sm:w-64 focus:outline-none focus:border-[#1558C9]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Origin Filter (Live vs Simulated) */}
              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-2.5 py-1.5 rounded text-xs text-white focus:outline-none"
              >
                <option value="all">All Origins (Live + Sim)</option>
                <option value="live">Live AWS Only</option>
                <option value="simulated">Simulated Only</option>
              </select>

              {/* Provider Filter */}
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-2.5 py-1.5 rounded text-xs text-white focus:outline-none"
              >
                <option value="all">All Providers</option>
                <option value="aws">AWS (ap-south-1)</option>
                <option value="docker">Docker Compose</option>
                <option value="kubernetes">Kubernetes</option>
              </select>

              {/* State Filter */}
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-2.5 py-1.5 rounded text-xs text-white focus:outline-none"
              >
                <option value="all">All States</option>
                <option value="running">Running</option>
                <option value="stopped">Stopped</option>
                <option value="in-use">In-Use (EBS)</option>
                <option value="available">Available</option>
                <option value="scaled_down">Scaled Down</option>
              </select>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] border-b border-[#272a33] text-[#9296A3] uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Resource & Origin</th>
                  <th className="py-3 px-4">Provider / Type</th>
                  <th className="py-3 px-4">Region / Env</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4">Cost / hr</th>
                  <th className="py-3 px-4">Persistence</th>
                  <th className="py-3 px-4 text-right">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#272a33]/60">
                {filteredResources.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-[#9296A3]">
                      No matching cloud workloads found.
                    </td>
                  </tr>
                ) : (
                  filteredResources.map((res) => {
                    const isLive = res.metadata?.is_live_aws === true;
                    const isRunning = ['running', 'in-use', 'available', 'associated'].includes(res.current_state);
                    const isEc2 = ['ec2_instance', 'ec2'].includes(res.resource_type);
                    const isProd = res.environment === 'production' || res.metadata?.tags?.Environment === 'production';
                    const hasStorage = res.persistence_requirements?.volume_name ||
                      res.persistence_requirements?.has_pvc ||
                      res.persistence_requirements?.volume_type ||
                      res.persistence_requirements?.allocated_storage_gb;

                    return (
                      <tr key={res.id} className="hover:bg-[#171920]/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {res.name}
                            {isLive ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-cyan-950 text-cyan-300 border border-cyan-800">
                                LIVE AWS
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
                                SIMULATED
                              </span>
                            )}
                            {res.is_critical_dependency && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                CRITICAL
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#9296A3] font-mono">{res.id}</div>
                          {res.metadata?.instance_type && (
                            <div className="text-[10px] text-zinc-400 mt-0.5">Type: {res.metadata.instance_type}</div>
                          )}
                          {res.metadata?.public_ip && (
                            <div className="text-[10px] text-amber-400/90 font-mono">IPv4: {res.metadata.public_ip}</div>
                          )}

                          {/* Phase 23E & 23F: Eligibility Status Pills */}
                          {isEc2 && (
                            <div className="mt-1 flex items-center gap-1">
                              {isProd ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-rose-950/80 text-rose-300 border border-rose-800">
                                  INELIGIBLE: PROD PROTECTED
                                </span>
                              ) : isLive ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800">
                                  GOVERNED AWS (DRY-RUN & APPROVAL REQ)
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                                  ELIGIBLE (NON-PROD)
                                </span>
                              )}
                            </div>
                          )}

                          {res.provider === 'docker' && (
                            <div className="mt-1 flex items-center gap-1">
                              {res.is_critical_dependency ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800">
                                  PROTECTED: DB DEPENDENCY
                                </span>
                              ) : res.name.includes('backend') ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-rose-950/80 text-rose-300 border border-rose-800">
                                  PROTECTED: CONTROL PLANE
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                                  GOVERNED DOCKER
                                </span>
                              )}
                            </div>
                          )}

                          {res.provider === 'kubernetes' && (
                            <div className="mt-1 flex items-center gap-1">
                              {res.is_critical_dependency ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800">
                                  PROTECTED: STATEFULSET DB
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-blue-950/80 text-blue-300 border border-blue-800">
                                  GOVERNED K8S (REPLICAS: {res.metadata?.replicas || 1})
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            res.provider === 'aws' ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40' :
                            res.provider === 'kubernetes' ? 'bg-blue-900/30 text-blue-400 border border-blue-800/40' :
                            'bg-cyan-900/30 text-cyan-400 border border-cyan-800/40'
                          }`}>
                            {res.provider}
                          </span>
                          <div className="text-[10px] text-[#9296A3] mt-0.5 font-mono">{res.resource_type}</div>
                          {res.metadata?.namespace && (
                            <div className="text-[10px] text-blue-400 mt-0.5 font-mono">ns: {res.metadata.namespace}</div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-white">{res.region}</div>
                          <div className="text-[10px] text-[#9296A3]">{res.environment}</div>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isRunning ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                            {res.current_state}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-white">${parseFloat(res.estimated_hourly_cost).toFixed(4)}</div>
                          <div className="text-[10px] text-[#9296A3]">
                            ${(parseFloat(res.estimated_hourly_cost) * 730).toFixed(2)}/mo
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {hasStorage ? (
                            <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">hard_drive</span>
                              {res.persistence_requirements?.has_pvc ? 'Retained PVC' : 'Preserved Vol'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#9296A3]">Stateless</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {res.provider === 'kubernetes' ? (
                              <>
                                <button
                                  onClick={() => handleOpenScaleModal(res)}
                                  disabled={killSwitch.active}
                                  className="px-2.5 py-1 rounded text-[11px] bg-blue-950/60 text-blue-300 border border-blue-800 hover:bg-blue-900 transition-all disabled:opacity-40"
                                >
                                  Scale Replicas
                                </button>
                                {isRunning && (
                                  <button
                                    onClick={() => handleOpenDryRun(res, 'stop', { targetReplicas: 0 })}
                                    disabled={killSwitch.active}
                                    className="px-2 py-1 rounded text-[11px] bg-rose-950/60 text-rose-300 border border-rose-800 hover:bg-rose-900 transition-all disabled:opacity-40"
                                    title="Scale workload to 0"
                                  >
                                    Scale 0
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                {isRunning ? (
                                  <button
                                    onClick={() => handleOpenDryRun(res, 'stop')}
                                    disabled={killSwitch.active}
                                    className="px-2.5 py-1 rounded text-[11px] bg-rose-950/60 text-rose-300 border border-rose-800 hover:bg-rose-900 transition-all disabled:opacity-40"
                                  >
                                    Dry-Run Stop
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleOpenDryRun(res, 'start')}
                                    disabled={killSwitch.active}
                                    className="px-2.5 py-1 rounded text-[11px] bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-all disabled:opacity-40"
                                  >
                                    Dry-Run Start
                                  </button>
                                )}

                                {res.provider === 'docker' && isRunning && (
                                  <button
                                    onClick={() => handleOpenDryRun(res, 'restart')}
                                    disabled={killSwitch.active}
                                    className="px-2 py-1 rounded text-[11px] bg-cyan-950/60 text-cyan-300 border border-cyan-800 hover:bg-cyan-900 transition-all disabled:opacity-40"
                                  >
                                    Restart
                                  </button>
                                )}
                              </>
                            )}

                            <button
                              onClick={() => handleOpenDryRun(res, 'inspect')}
                              className="px-2 py-1 rounded text-[11px] bg-[#171920] text-[#9296A3] border border-[#272a33] hover:text-white"
                            >
                              Inspect
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INFRASTRUCTURE DRIFT DETECTION & RECONCILIATION */}
      {activeTab === 'drift' && (
        <div className="space-y-4">
          {/* Drift KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Total Drifts</span>
              <span className="text-xl font-bold text-white mt-1 block">
                {driftStats?.total_drifts || drifts.length}
              </span>
              <span className="text-[10px] text-cyan-400">Lifetime events</span>
            </div>

            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Active Unresolved</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">
                {driftStats?.active_unresolved || drifts.filter(d => d.status === 'detected').length}
              </span>
              <span className="text-[10px] text-amber-300/80">Pending action</span>
            </div>

            <div className="bg-[#101116] border border-rose-950/60 rounded-lg p-3">
              <span className="text-[10px] text-rose-400 uppercase block">Critical Severity</span>
              <span className="text-xl font-bold text-rose-400 mt-1 block">
                {driftStats?.critical_count || drifts.filter(d => d.severity === 'critical' && d.status !== 'reconciled').length}
              </span>
              <span className="text-[10px] text-rose-300/80">DB & host affected</span>
            </div>

            <div className="bg-[#101116] border border-amber-950/60 rounded-lg p-3">
              <span className="text-[10px] text-amber-400 uppercase block">High Severity</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">
                {driftStats?.high_count || drifts.filter(d => d.severity === 'high' && d.status !== 'reconciled').length}
              </span>
              <span className="text-[10px] text-amber-300/80">Downstream callers</span>
            </div>

            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Medium & Low</span>
              <span className="text-xl font-bold text-zinc-300 mt-1 block">
                {((driftStats?.medium_count || 0) + (driftStats?.low_count || 0)) || drifts.filter(d => ['medium', 'low'].includes(d.severity) && d.status !== 'reconciled').length}
              </span>
              <span className="text-[10px] text-zinc-400">Config & replicas</span>
            </div>

            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Affected Resources</span>
              <span className="text-xl font-bold text-cyan-400 mt-1 block">
                {driftStats?.affected_resources_count || new Set(drifts.filter(d => d.status !== 'reconciled').map(d => d.resource_id)).size}
              </span>
              <span className="text-[10px] text-cyan-300/80">Unique workloads</span>
            </div>
          </div>

          {/* Active Baseline Status Banner */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-cyan-400 text-[18px]">rule</span>
                  Desired-State Baseline: {activeBaseline ? activeBaseline.name : 'No Active Baseline'}
                </span>
                {activeBaseline && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-cyan-950 text-cyan-300 border border-cyan-800">
                    VERSION {activeBaseline.version}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#9296A3] mt-1">
                {activeBaseline ? (
                  <>
                    Config Hash: <span className="font-mono text-zinc-300">{activeBaseline.configuration_hash?.substring(0, 16)}...</span> • Authorized by: <strong className="text-zinc-300">{activeBaseline.created_by}</strong> • Environment: <strong className="text-white">{activeBaseline.environment}</strong>
                  </>
                ) : (
                  'No golden baseline has been initialized for staging. Click below to snapshot current workloads into a golden baseline.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInitializeBaseline}
                disabled={initializingBaseline || user?.role !== 'admin'}
                className="px-3 py-1.5 rounded text-xs font-bold bg-[#171920] text-zinc-300 border border-[#272a33] hover:text-white hover:border-[#383d4a] transition-all disabled:opacity-50 flex items-center gap-1.5"
                title={user?.role !== 'admin' ? 'Administrator role required to initialize baseline.' : 'Snapshot verified inventory as new baseline'}
              >
                <span className="material-symbols-outlined text-[16px]">bookmark_add</span>
                {initializingBaseline ? 'Initializing...' : 'Initialize Golden Baseline'}
              </button>

              <button
                onClick={handleTriggerDriftScan}
                disabled={detectingDrift}
                className="px-4 py-1.5 rounded text-xs font-bold bg-[#1558C9] text-white hover:bg-[#124ab0] transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#1558C9]/20"
              >
                <span className={`material-symbols-outlined text-[16px] ${detectingDrift ? 'animate-spin' : ''}`}>
                  {detectingDrift ? 'sync' : 'search_check'}
                </span>
                {detectingDrift ? 'Scanning Drift...' : 'Run Drift Scan'}
              </button>
            </div>
          </div>

          {/* Drift Explorer Table Controls */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-[#101116] p-3 rounded-lg border border-[#272a33]">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search drift by resource, type or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-3 py-1.5 rounded text-xs text-white placeholder-[#9296A3] w-full sm:w-64 focus:outline-none focus:border-[#1558C9]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={driftSeverityFilter}
                onChange={(e) => setDriftSeverityFilter(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-2.5 py-1.5 rounded text-xs text-white focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                value={driftStatusFilter}
                onChange={(e) => setDriftStatusFilter(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-2.5 py-1.5 rounded text-xs text-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="detected">Detected (Unresolved)</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="reconciling">Reconciling</option>
                <option value="reconciled">Reconciled</option>
                <option value="ignored">Ignored</option>
              </select>
            </div>
          </div>

          {/* Drift Events Table */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] border-b border-[#272a33] text-[#9296A3] uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Drift ID / Detected</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-4">Provider / Type</th>
                  <th className="py-3 px-4">Drift Type</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Governed Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#272a33]/60">
                {drifts.filter(d => {
                  if (driftSeverityFilter !== 'all' && d.severity !== driftSeverityFilter) return false;
                  if (driftStatusFilter !== 'all' && d.status !== driftStatusFilter) return false;
                  if (providerFilter !== 'all' && d.provider !== providerFilter) return false;
                  if (searchQuery && !d.resource_name?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.resource_id?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.id?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-[#9296A3]">
                      No infrastructure drift detected. All running workloads match active golden baseline.
                    </td>
                  </tr>
                ) : (
                  drifts.filter(d => {
                    if (driftSeverityFilter !== 'all' && d.severity !== driftSeverityFilter) return false;
                    if (driftStatusFilter !== 'all' && d.status !== driftStatusFilter) return false;
                    if (providerFilter !== 'all' && d.provider !== providerFilter) return false;
                    if (searchQuery && !d.resource_name?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.resource_id?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.id?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                    return true;
                  }).map((drift) => {
                    const changedFields = Array.isArray(drift.changed_fields) ? drift.changed_fields : JSON.parse(drift.changed_fields || '[]');

                    return (
                      <tr key={drift.id} className="hover:bg-[#171920]/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white font-mono">{drift.id}</div>
                          <div className="text-[10px] text-[#9296A3]">
                            {new Date(drift.last_observed_at || drift.first_detected_at).toLocaleTimeString()}
                          </div>
                          {drift.observation_count > 1 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                              Observed {drift.observation_count}x
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{drift.resource_name || drift.resource_id}</div>
                          <div className="text-[10px] text-[#9296A3] font-mono">{drift.resource_id}</div>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            drift.provider === 'aws' ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40' :
                            drift.provider === 'kubernetes' ? 'bg-blue-900/30 text-blue-400 border border-blue-800/40' :
                            'bg-cyan-900/30 text-cyan-400 border border-cyan-800/40'
                          }`}>
                            {drift.provider}
                          </span>
                          <div className="text-[10px] text-[#9296A3] mt-0.5">{drift.resource_type}</div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-medium text-white block capitalize">
                            {drift.drift_type?.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {changedFields.length} field delta(s)
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            drift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                            drift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            drift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                            'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}>
                            {drift.severity}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            drift.status === 'detected' ? 'bg-amber-950/80 text-amber-300 border border-amber-800' :
                            drift.status === 'reconciled' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' :
                            drift.status === 'reconciling' ? 'bg-blue-950/80 text-blue-300 border border-blue-800' :
                            'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}>
                            {drift.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleViewDriftDetails(drift)}
                              className="px-2.5 py-1 rounded text-[11px] bg-[#171920] text-zinc-300 border border-[#272a33] hover:text-white hover:border-[#383d4a]"
                            >
                              View Diff
                            </button>

                            {drift.status !== 'reconciled' && user?.role !== 'viewer' && (
                              <button
                                onClick={() => handleOpenReconciliation(drift)}
                                className="px-2.5 py-1 rounded text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 flex items-center gap-1"
                              >
                                Reconcile
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INFRASTRUCTURE DRIFT DETECTION & RECONCILIATION */}
      {activeTab === 'drift' && (
        <div className="space-y-4">
          {/* Drift KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Total Drifts</span>
              <span className="text-xl font-bold text-white mt-1 block">
                {driftStats?.total_drifts || drifts.length}
              </span>
              <span className="text-[10px] text-cyan-400">Lifetime events</span>
            </div>

            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Active Unresolved</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">
                {driftStats?.active_unresolved || drifts.filter(d => d.status === 'detected').length}
              </span>
              <span className="text-[10px] text-amber-300/80">Pending action</span>
            </div>

            <div className="bg-[#101116] border border-rose-950/60 rounded-lg p-3">
              <span className="text-[10px] text-rose-400 uppercase block">Critical Severity</span>
              <span className="text-xl font-bold text-rose-400 mt-1 block">
                {driftStats?.critical_count || drifts.filter(d => d.severity === 'critical' && d.status !== 'reconciled').length}
              </span>
              <span className="text-[10px] text-rose-300/80">DB & host affected</span>
            </div>

            <div className="bg-[#101116] border border-amber-950/60 rounded-lg p-3">
              <span className="text-[10px] text-amber-400 uppercase block">High Severity</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">
                {driftStats?.high_count || drifts.filter(d => d.severity === 'high' && d.status !== 'reconciled').length}
              </span>
              <span className="text-[10px] text-amber-300/80">Downstream callers</span>
            </div>

            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Medium & Low</span>
              <span className="text-xl font-bold text-zinc-300 mt-1 block">
                {((driftStats?.medium_count || 0) + (driftStats?.low_count || 0)) || drifts.filter(d => ['medium', 'low'].includes(d.severity) && d.status !== 'reconciled').length}
              </span>
              <span className="text-[10px] text-zinc-400">Config & replicas</span>
            </div>

            <div className="bg-[#101116] border border-[#272a33] rounded-lg p-3">
              <span className="text-[10px] text-[#9296A3] uppercase block">Affected Resources</span>
              <span className="text-xl font-bold text-cyan-400 mt-1 block">
                {driftStats?.affected_resources_count || new Set(drifts.filter(d => d.status !== 'reconciled').map(d => d.resource_id)).size}
              </span>
              <span className="text-[10px] text-cyan-300/80">Unique workloads</span>
            </div>
          </div>

          {/* Active Baseline Status Banner */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-cyan-400 text-[18px]">rule</span>
                  Desired-State Baseline: {activeBaseline ? activeBaseline.name : 'No Active Baseline'}
                </span>
                {activeBaseline && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-cyan-950 text-cyan-300 border border-cyan-800">
                    VERSION {activeBaseline.version}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#9296A3] mt-1">
                {activeBaseline ? (
                  <>
                    Config Hash: <span className="font-mono text-zinc-300">{activeBaseline.configuration_hash?.substring(0, 16)}...</span> • Authorized by: <strong className="text-zinc-300">{activeBaseline.created_by}</strong> • Environment: <strong className="text-white">{activeBaseline.environment}</strong>
                  </>
                ) : (
                  'No golden baseline has been initialized for staging. Click below to snapshot current workloads into a golden baseline.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInitializeBaseline}
                disabled={initializingBaseline || user?.role !== 'admin'}
                className="px-3 py-1.5 rounded text-xs font-bold bg-[#171920] text-zinc-300 border border-[#272a33] hover:text-white hover:border-[#383d4a] transition-all disabled:opacity-50 flex items-center gap-1.5"
                title={user?.role !== 'admin' ? 'Administrator role required to initialize baseline.' : 'Snapshot verified inventory as new baseline'}
              >
                <span className="material-symbols-outlined text-[16px]">bookmark_add</span>
                {initializingBaseline ? 'Initializing...' : 'Initialize Golden Baseline'}
              </button>

              <button
                onClick={handleTriggerDriftScan}
                disabled={detectingDrift}
                className="px-4 py-1.5 rounded text-xs font-bold bg-[#1558C9] text-white hover:bg-[#124ab0] transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#1558C9]/20"
              >
                <span className={`material-symbols-outlined text-[16px] ${detectingDrift ? 'animate-spin' : ''}`}>
                  {detectingDrift ? 'sync' : 'search_check'}
                </span>
                {detectingDrift ? 'Scanning Drift...' : 'Run Drift Scan'}
              </button>
            </div>
          </div>

          {/* Drift Explorer Table Controls */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-[#101116] p-3 rounded-lg border border-[#272a33]">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search drift by resource, type or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-3 py-1.5 rounded text-xs text-white placeholder-[#9296A3] w-full sm:w-64 focus:outline-none focus:border-[#1558C9]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={driftSeverityFilter}
                onChange={(e) => setDriftSeverityFilter(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-2.5 py-1.5 rounded text-xs text-white focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                value={driftStatusFilter}
                onChange={(e) => setDriftStatusFilter(e.target.value)}
                className="bg-[#030407] border border-[#272a33] px-2.5 py-1.5 rounded text-xs text-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="detected">Detected (Unresolved)</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="reconciling">Reconciling</option>
                <option value="reconciled">Reconciled</option>
                <option value="ignored">Ignored</option>
              </select>
            </div>
          </div>

          {/* Drift Events Table */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] border-b border-[#272a33] text-[#9296A3] uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Drift ID / Detected</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-4">Provider / Type</th>
                  <th className="py-3 px-4">Drift Type</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Governed Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#272a33]/60">
                {drifts.filter(d => {
                  if (driftSeverityFilter !== 'all' && d.severity !== driftSeverityFilter) return false;
                  if (driftStatusFilter !== 'all' && d.status !== driftStatusFilter) return false;
                  if (providerFilter !== 'all' && d.provider !== providerFilter) return false;
                  if (searchQuery && !d.resource_name?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.resource_id?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.id?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-[#9296A3]">
                      No infrastructure drift detected. All running workloads match active golden baseline.
                    </td>
                  </tr>
                ) : (
                  drifts.filter(d => {
                    if (driftSeverityFilter !== 'all' && d.severity !== driftSeverityFilter) return false;
                    if (driftStatusFilter !== 'all' && d.status !== driftStatusFilter) return false;
                    if (providerFilter !== 'all' && d.provider !== providerFilter) return false;
                    if (searchQuery && !d.resource_name?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.resource_id?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.id?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                    return true;
                  }).map((drift) => {
                    const changedFields = Array.isArray(drift.changed_fields) ? drift.changed_fields : JSON.parse(drift.changed_fields || '[]');

                    return (
                      <tr key={drift.id} className="hover:bg-[#171920]/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white font-mono">{drift.id}</div>
                          <div className="text-[10px] text-[#9296A3]">
                            {new Date(drift.last_observed_at || drift.first_detected_at).toLocaleTimeString()}
                          </div>
                          {drift.observation_count > 1 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                              Observed {drift.observation_count}x
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{drift.resource_name || drift.resource_id}</div>
                          <div className="text-[10px] text-[#9296A3] font-mono">{drift.resource_id}</div>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            drift.provider === 'aws' ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40' :
                            drift.provider === 'kubernetes' ? 'bg-blue-900/30 text-blue-400 border border-blue-800/40' :
                            'bg-cyan-900/30 text-cyan-400 border border-cyan-800/40'
                          }`}>
                            {drift.provider}
                          </span>
                          <div className="text-[10px] text-[#9296A3] mt-0.5">{drift.resource_type}</div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-medium text-white block capitalize">
                            {drift.drift_type?.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {changedFields.length} field delta(s)
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            drift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                            drift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            drift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                            'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}>
                            {drift.severity}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            drift.status === 'detected' ? 'bg-amber-950/80 text-amber-300 border border-amber-800' :
                            drift.status === 'reconciled' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' :
                            drift.status === 'reconciling' ? 'bg-blue-950/80 text-blue-300 border border-blue-800' :
                            'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}>
                            {drift.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleViewDriftDetails(drift)}
                              className="px-2.5 py-1 rounded text-[11px] bg-[#171920] text-zinc-300 border border-[#272a33] hover:text-white hover:border-[#383d4a]"
                            >
                              View Diff
                            </button>

                            {drift.status !== 'reconciled' && user?.role !== 'viewer' && (
                              <button
                                onClick={() => handleOpenReconciliation(drift)}
                                className="px-2.5 py-1 rounded text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 flex items-center gap-1"
                              >
                                Reconcile
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OPERATIONS & APPROVALS */}
      {activeTab === 'operations' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e12] border-b border-[#272a33] text-[#9296A3] uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Op ID / Action</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4">Requested By</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Governance Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#272a33]/60">
              {operations.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-[#9296A3]">
                    No cloud lifecycle operations recorded.
                  </td>
                </tr>
              ) : (
                operations.map((op) => {
                  const isPending = op.status === 'pending_approval';
                  const isApproved = op.status === 'approved';
                  const isSelfRequest = user?.email && op.requested_by === user.email;

                  return (
                    <tr key={op.id} className="hover:bg-[#171920]/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span className="uppercase">{op.action}</span>
                          {op.is_dry_run && (
                            <span className="text-[9px] px-1.5 rounded bg-zinc-800 text-zinc-300">DRY-RUN</span>
                          )}
                          {op.resource_id?.startsWith('aws-') && (
                            <span className="text-[9px] px-1.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">LIVE AWS</span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#9296A3] font-mono">{op.id}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{op.resource_name || op.resource_id}</div>
                        <div className="text-[10px] text-[#9296A3]">{op.provider}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white">{op.requested_by}</div>
                        <div className="text-[10px] text-[#9296A3]">{op.requester_role}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          op.status === 'approved' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                          op.status === 'pending_approval' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          op.status === 'completed' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                          op.status === 'dry_run_passed' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                          'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          {op.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[#9296A3]">
                        {new Date(op.created_at).toLocaleTimeString()}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && user?.role === 'admin' && !isSelfRequest && (
                            <button
                              onClick={() => handleApprove(op.id)}
                              className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-500"
                            >
                              Approve
                            </button>
                          )}

                          {isPending && isSelfRequest && (
                            <span className="text-[10px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                              Cannot Self-Approve
                            </span>
                          )}

                          {isApproved && user?.role !== 'viewer' && (
                            <button
                              onClick={() => handleExecuteClick(op)}
                              disabled={killSwitch.active}
                              className="px-2.5 py-1 rounded text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                            >
                              Execute
                            </button>
                          )}

                          {['pending_approval', 'approved'].includes(op.status) && (
                            <button
                              onClick={() => handleCancel(op.id)}
                              className="px-2 py-1 rounded text-[11px] bg-zinc-800 text-zinc-300 hover:text-white"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUTOMATED SCHEDULES */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-lg p-4">
            <h3 className="font-bold text-sm text-white mb-2">Automated Weekday & Overnight Schedules</h3>
            <p className="text-xs text-[#9296A3]">
              Automated stop and start schedules minimize staging compute burn outside active development hours. Configured for Asia/Kolkata timezone.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.map((sched) => (
              <div key={sched.id} className="bg-[#101116] border border-[#272a33] rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{sched.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      sched.is_paused ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                      'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    }`}>
                      {sched.is_paused ? 'PAUSED' : 'ACTIVE'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-[#9296A3]">
                    <div><span className="text-white">Action:</span> {sched.action.toUpperCase()}</div>
                    <div><span className="text-white">Target Resource:</span> {sched.resource_name || sched.resource_id}</div>
                    <div><span className="text-white">Time & Zone:</span> {sched.time_of_day} ({sched.timezone})</div>
                    <div><span className="text-white">Cron:</span> <code className="bg-[#030407] px-1 py-0.5 rounded text-zinc-300">{sched.cron_expression}</code></div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#272a33] flex justify-between items-center text-xs">
                  <span className="text-[10px] text-[#9296A3]">Created by {sched.created_by}</span>
                  {user?.role !== 'viewer' && (
                    <button
                      onClick={() => handleToggleSchedule(sched.id, sched.is_paused)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        sched.is_paused
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {sched.is_paused ? 'Resume Schedule' : 'Pause Schedule'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COST & FREE TIER GOVERNANCE */}
      {activeTab === 'costs' && (
        <div className="space-y-6">
          {/* Cost Transparency 4-Column Model */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Cost Visibility & Distinction Framework</h3>
                <p className="text-xs text-[#9296A3] mt-1">
                  Transparent differentiation between API-retrieved facts, published rate assumptions, billing data, and calculated projections.
                </p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase">
                ap-south-1 Mumbai
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5">
              {/* Column 1: API-Retrieved Facts */}
              <div className="bg-[#0a0b0e] p-4 rounded-lg border border-[#272a33]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                  <span className="material-symbols-outlined text-[16px]">fact_check</span>
                  1. API-Retrieved Facts
                </div>
                <div className="mt-2 text-xs text-[#9296A3] space-y-1">
                  <div>Live Workloads: <strong className="text-white">{liveCount}</strong></div>
                  <div>Attached Volumes: <strong className="text-white">{resources.filter(r => r.resource_type === 'ebs_volume').length}</strong></div>
                  <div>Public IPv4: <strong className="text-white">{resources.filter(r => r.resource_type === 'elastic_ip' || r.metadata?.public_ip).length}</strong></div>
                  <div className="text-[10px] text-zinc-500 mt-2">Retrieved via EC2/RDS read-only descriptors.</div>
                </div>
              </div>

              {/* Column 2: Pricing Assumptions */}
              <div className="bg-[#0a0b0e] p-4 rounded-lg border border-[#272a33]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <span className="material-symbols-outlined text-[16px]">sell</span>
                  2. Pricing Assumptions
                </div>
                <div className="mt-2 text-xs text-[#9296A3] space-y-1">
                  <div>t4g.small: <strong className="text-white">$0.0168/hr</strong></div>
                  <div>gp3 Storage: <strong className="text-white">$0.08/GB-mo</strong></div>
                  <div>Public IPv4: <strong className="text-white">$0.005/hr</strong></div>
                  <div className="text-[10px] text-zinc-500 mt-2">Published AWS ap-south-1 On-Demand rates.</div>
                </div>
              </div>

              {/* Column 3: Calculated Estimates */}
              <div className="bg-[#0a0b0e] p-4 rounded-lg border border-[#272a33]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <span className="material-symbols-outlined text-[16px]">calculate</span>
                  3. Calculated Estimates
                </div>
                <div className="mt-2 text-xs text-[#9296A3] space-y-1">
                  <div>Hourly: <strong className="text-white">${costEstimate ? costEstimate.current_hourly_total.toFixed(4) : '0.00'}</strong></div>
                  <div>Monthly (730h): <strong className="text-white">${costEstimate ? costEstimate.estimated_monthly_total.toFixed(2) : '0.00'}</strong></div>
                  <div>Potential Savings: <strong className="text-emerald-400">${costEstimate ? costEstimate.estimated_monthly_savings.toFixed(2) : '0.00'}</strong></div>
                  <div className="text-[10px] text-zinc-500 mt-2">Calculated projections (not actual invoice).</div>
                </div>
              </div>

              {/* Column 4: AWS Billing Data */}
              <div className="bg-[#0a0b0e] p-4 rounded-lg border border-[#272a33]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  4. AWS Billing Data
                </div>
                <div className="mt-2 text-xs text-[#9296A3] space-y-1">
                  <div>Actual Invoices: <strong className="text-zinc-400">Not connected</strong></div>
                  <div>Cost Explorer: <strong className="text-zinc-400">Disabled</strong></div>
                  <div>Status: <span className="text-amber-400 font-bold">Safe & Isolated</span></div>
                  <div className="text-[10px] text-zinc-500 mt-2">Paid billing APIs disabled to guarantee zero cost.</div>
                </div>
              </div>
            </div>
          </div>

          {/* AWS Free Tier Transparency Card */}
          <div className="bg-[#101116] border border-[#272a33] rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[22px]">verified</span>
                <h3 className="text-sm font-bold text-white">AWS Free Tier Transparency & Policy Breakdown</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                STATUS: NOT VERIFIED
              </span>
            </div>

            <p className="text-xs text-[#9296A3] mt-2">
              InfraPulse does not infer Free Tier credit eligibility from instance type alone. Account usage information cannot be verified without billing credentials.
              To preserve strict security and zero out-of-pocket budget, we report Free Tier as <strong>"Not verified"</strong> rather than fabricating balances.
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0a0b0e] p-3 rounded border border-[#272a33]">
                <span className="text-white font-bold">1. Amazon EC2</span>
                <p className="text-[#9296A3] text-[11px] mt-1">
                  750 Hours/Month of t2.micro or t3.micro Linux instances within 12-month free tier window. t4g.small free trial applies where eligible.
                </p>
              </div>

              <div className="bg-[#0a0b0e] p-3 rounded border border-[#272a33]">
                <span className="text-white font-bold">2. Amazon EBS Storage</span>
                <p className="text-[#9296A3] text-[11px] mt-1">
                  30 GB of General Purpose (gp3/gp2) or Magnetic storage + 2,000,000 I/Os and 1 GB snapshot storage. Storage beyond 30GB incurs standard $0.08/GB-mo.
                </p>
              </div>

              <div className="bg-[#0a0b0e] p-3 rounded border border-[#272a33]">
                <span className="text-white font-bold">3. Amazon RDS Database</span>
                <p className="text-[#9296A3] text-[11px] mt-1">
                  750 Hours/Month of db.t4g.micro or db.t3.micro Single-AZ + 20 GB database storage and 20 GB automated backup storage.
                </p>
              </div>

              <div className="bg-[#0a0b0e] p-3 rounded border border-[#272a33]">
                <span className="text-white font-bold">4. Public IPv4 Addresses</span>
                <p className="text-[#9296A3] text-[11px] mt-1">
                  Effective Feb 1, 2024, all public IPv4 addresses incur $0.005/hour ($3.65/mo each). EC2 Free Tier includes 750h/mo on eligible micro instances.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e12] border-b border-[#272a33] text-[#9296A3] uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Resource Target</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#272a33]/60">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-[#9296A3]">
                    No cloud lifecycle audit logs recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#171920]/40 transition-colors">
                    <td className="py-3 px-4 text-[#9296A3]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-white">{log.action}</span>
                    </td>
                    <td className="py-3 px-4 text-white">
                      {log.user_email || log.actor?.email || 'system'}
                    </td>
                    <td className="py-3 px-4 text-[#9296A3]">
                      {log.resource_id}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[10px]">
                      {JSON.stringify(log.details || log.metadata || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DRY-RUN SAFETY & COST IMPACT MODAL */}
      {dryRunModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-cyan-400">shield_check</span>
                <h3 className="font-bold text-white text-sm">
                  Dry-Run Evaluation: {selectedAction.toUpperCase()} on '{selectedResource?.name}'
                </h3>
              </div>
              <button onClick={() => setDryRunModalOpen(false)} className="text-[#9296A3] hover:text-white">✕</button>
            </div>

            {dryRunLoading ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-[#9296A3]">Evaluating dependency graph, EC2 eligibility, active incidents & storage safety...</p>
              </div>
            ) : dryRunResult ? (
              <div className="space-y-4 text-xs">
                {/* Status Pill */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${
                  dryRunResult.safe
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}>
                  <span className="font-bold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">
                      {dryRunResult.safe ? 'check_circle' : 'cancel'}
                    </span>
                    {dryRunResult.safe ? 'SAFETY & ELIGIBILITY EVALUATION PASSED' : 'OPERATION BLOCKED BY SAFETY GUARDS'}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/40">
                    {dryRunResult.status}
                  </span>
                </div>

                {/* Hard Blockers */}
                {dryRunResult.blockers && dryRunResult.blockers.length > 0 && (
                  <div className="bg-rose-950/20 border border-rose-900/60 p-3 rounded-lg space-y-1">
                    <div className="font-bold text-rose-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">block</span>
                      Prohibitive Blockers:
                    </div>
                    <ul className="list-disc pl-5 text-rose-200 text-[11px] space-y-0.5">
                      {dryRunResult.blockers.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {dryRunResult.warnings && dryRunResult.warnings.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-900/60 p-3 rounded-lg space-y-1">
                    <div className="font-bold text-amber-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">warning</span>
                      Operational Warnings:
                    </div>
                    <ul className="list-disc pl-5 text-amber-200 text-[11px] space-y-0.5">
                      {dryRunResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Phase 23E: Granular Cost Impact Preview */}
                {dryRunResult.costImpact && (
                  <div className="bg-[#0a0b0e] p-3 rounded-lg border border-[#272a33] space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-white">
                      <span>Cost Impact Preview ({selectedAction.toUpperCase()}):</span>
                      <span className="text-amber-400 text-[10px]">ap-south-1 rates</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {selectedAction === 'stop' ? (
                        <>
                          <div className="bg-[#101116] p-2 rounded border border-[#272a33]">
                            <span className="text-[#9296A3] block text-[10px]">Compute Savings:</span>
                            <span className="text-emerald-400 font-bold text-sm">+${dryRunResult.costImpact.monthlyComputeSavings}/mo</span>
                          </div>
                          <div className="bg-[#101116] p-2 rounded border border-[#272a33]">
                            <span className="text-[#9296A3] block text-[10px]">Ongoing Storage & IP:</span>
                            <span className="text-amber-400 font-bold text-sm">${dryRunResult.costImpact.ongoingTotalMonthly}/mo</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bg-[#101116] p-2 rounded border border-[#272a33]">
                            <span className="text-[#9296A3] block text-[10px]">Hourly Compute:</span>
                            <span className="text-white font-bold text-sm">${dryRunResult.costImpact.hourlyCompute.toFixed(4)}/hr</span>
                          </div>
                          <div className="bg-[#101116] p-2 rounded border border-[#272a33]">
                            <span className="text-[#9296A3] block text-[10px]">Projected Compute (730h):</span>
                            <span className="text-white font-bold text-sm">${dryRunResult.costImpact.expectedMonthlyComputeCost}/mo</span>
                          </div>
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 italic mt-1">
                      {dryRunResult.costImpact.costDisclosure}
                    </p>
                  </div>
                )}

                {/* Safety Checklist */}
                {dryRunResult.safetyChecks && (
                  <div className="bg-[#030407] p-3 rounded border border-[#272a33] space-y-1.5">
                    <div className="text-[11px] font-bold text-[#9296A3]">Pre-Execution Verification Checklist:</div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <span className="material-symbols-outlined text-[14px]">check</span>
                        Relational DB Health Probe
                      </div>
                      <div className="flex items-center gap-1 text-emerald-400">
                        <span className="material-symbols-outlined text-[14px]">check</span>
                        Persistent Storage Retention
                      </div>
                      <div className={`flex items-center gap-1 ${dryRunResult.safetyChecks.dependencyGraphSafe ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {dryRunResult.safetyChecks.dependencyGraphSafe ? 'check' : 'close'}
                        </span>
                        Downstream Workloads Check
                      </div>
                      <div className={`flex items-center gap-1 ${dryRunResult.safetyChecks.killSwitchPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {dryRunResult.safetyChecks.killSwitchPassed ? 'check' : 'close'}
                        </span>
                        Global Kill Switch Check
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 flex justify-end gap-2 border-t border-[#272a33]">
                  <button
                    onClick={() => setDryRunModalOpen(false)}
                    className="px-4 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white"
                  >
                    Close Preview
                  </button>

                  {dryRunResult.safe && user?.role !== 'viewer' && (
                    <button
                      onClick={handleSubmitRequest}
                      disabled={submittingRequest}
                      className="px-4 py-1.5 rounded bg-[#1558C9] text-white font-bold hover:bg-[#124ab0] disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {submittingRequest ? 'Submitting Request...' : 'Submit Lifecycle Request'}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KUBERNETES REPLICA SCALING MODAL */}
      {scaleModalOpen && scaleTargetResource && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-blue-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">tune</span>
                <span>Scale Kubernetes Replicas</span>
              </div>
              <button onClick={() => setScaleModalOpen(false)} className="text-[#9296A3] hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#030407] p-3 rounded border border-[#272a33] space-y-1">
                <div>Workload: <strong className="text-white">{scaleTargetResource.name}</strong></div>
                <div>Namespace: <strong className="text-blue-400">{scaleTargetResource.metadata?.namespace || 'infrapulse'}</strong></div>
                <div>Current Replicas: <strong className="text-cyan-400">{scaleTargetResource.metadata?.replicas || 1}</strong></div>
                <div>Workload Type: <strong className="text-zinc-300">{scaleTargetResource.resource_type === 'k8s_statefulset' ? 'StatefulSet' : 'Deployment'}</strong></div>
              </div>

              <div>
                <label className="block text-[#9296A3] mb-1 font-bold">Target Replica Count (0 to 5):</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="5"
                    value={targetReplicas}
                    onChange={(e) => setTargetReplicas(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500"
                  />
                  <span className="text-lg font-bold text-white w-8 text-center">{targetReplicas}</span>
                </div>
                <div className="flex justify-between text-[10px] text-[#9296A3] mt-1">
                  <span>0 (Scaled down / Suspended)</span>
                  <span>1 (Single Pod)</span>
                  <span>5 (Max)</span>
                </div>
              </div>

              {scaleTargetResource.resource_type === 'k8s_statefulset' && (
                <div className="p-3 bg-amber-950/40 border border-amber-900 rounded text-amber-200 text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    StatefulSet Safety Authorization:
                  </div>
                  <p>StatefulSets maintain persistent network identities and storage bindings. Scaling requires explicit confirmation.</p>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowStatefulSetScale}
                      onChange={(e) => setAllowStatefulSetScale(e.target.checked)}
                      className="rounded bg-[#030407] border-[#272a33] text-blue-500"
                    />
                    <span className="text-white font-bold">Allow StatefulSet replica scaling</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setScaleModalOpen(false)}
                className="px-4 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmScaleDryRun}
                className="px-4 py-1.5 rounded bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
              >
                Proceed to Dry-Run Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EXPLICIT CONFIRMATION MODAL FOR LIVE AWS, DOCKER & K8S MUTATIONS */}
      {confirmModalOpen && confirmOperation && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-amber-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 border-b border-[#272a33] pb-3 text-amber-400">
              <span className="material-symbols-outlined text-[24px]">warning</span>
              <h3 className="font-bold text-white text-sm">
                EXPLICIT CONFIRMATION: Execute Live Infrastructure Mutation
              </h3>
            </div>

            <div className="space-y-3 text-xs text-[#9296A3]">
              <p className="text-white">
                You are about to execute an authorized mutation on live infrastructure:
              </p>

              <div className="bg-[#030407] p-3 rounded border border-[#272a33] space-y-1 font-mono text-[11px]">
                <div>Action: <strong className="text-white uppercase">{confirmOperation.action}</strong></div>
                <div>Resource ID: <strong className="text-cyan-400">{confirmOperation.resource_id}</strong></div>
                <div>Target Name: <strong className="text-white">{confirmOperation.resource_name}</strong></div>
                <div>Provider: <strong className="text-white uppercase">{confirmOperation.provider || 'cloud'}</strong></div>
                <div>Approved By: <strong className="text-white">{confirmOperation.approved_by}</strong></div>
              </div>

              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-[11px]">
                <strong>Warning:</strong> Live lifecycle mutations directly affect running hardware or containers. Persistent volumes and PVCs will remain intact, but active network connections may be terminated.
              </div>

              <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={explicitConfirmationChecked}
                  onChange={(e) => setExplicitConfirmationChecked(e.target.checked)}
                  className="rounded bg-[#030407] border-[#272a33] text-[#1558C9] focus:ring-0"
                />
                <span className="text-white text-xs font-bold">
                  I explicitly confirm this live infrastructure lifecycle mutation.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setConfirmModalOpen(false)}
                disabled={executingOperation}
                className="px-4 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Abort
              </button>
              <button
                onClick={() => executeApprovedOperation(confirmOperation.id, true)}
                disabled={!explicitConfirmationChecked || executingOperation}
                className="px-4 py-1.5 rounded bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-40 flex items-center gap-1.5"
              >
                {executingOperation ? 'Executing Mutation...' : 'Execute Live Mutation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: DRIFT DETAIL MODAL */}
      {driftDetailModalOpen && selectedDrift && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[24px]">difference</span>
                <div>
                  <h3 className="font-bold text-white text-base">Infrastructure Drift Analysis</h3>
                  <div className="text-xs text-[#9296A3] font-mono">{selectedDrift.id} • {selectedDrift.resource_name || selectedDrift.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setDriftDetailModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Severity & Evidence Banner */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    selectedDrift.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    selectedDrift.severity === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    selectedDrift.severity === 'medium' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {selectedDrift.severity} Severity
                  </span>
                  <span className="text-xs text-white font-medium capitalize">
                    {selectedDrift.drift_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[11px] text-[#9296A3]">
                  Observed {selectedDrift.observation_count || 1} time(s) • Last: {new Date(selectedDrift.last_observed_at || selectedDrift.first_detected_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-zinc-300">
                <strong className="text-white">Explanation: </strong>
                {selectedDrift.severity_reason || 'Configuration diverges from registered active baseline.'}
              </div>
            </div>

            {/* Changed Fields Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Delta Field Comparison</h4>
              <div className="border border-[#272a33] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#171920] text-[#9296A3]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Diff Type</th>
                      <th className="py-2 px-3">Expected (Baseline)</th>
                      <th className="py-2 px-3">Actual (Runtime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272a33]/60 font-mono">
                    {(Array.isArray(selectedDrift.changed_fields) ? selectedDrift.changed_fields : JSON.parse(selectedDrift.changed_fields || '[]')).map((field, idx) => (
                      <tr key={idx} className="hover:bg-[#171920]/40">
                        <td className="py-2 px-3 text-cyan-400">{field.field || field}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            field.diffType === 'ADDED' ? 'bg-emerald-950 text-emerald-300' :
                            field.diffType === 'REMOVED' ? 'bg-rose-950 text-rose-300' :
                            'bg-amber-950 text-amber-300'
                          }`}>
                            {field.diffType || 'MODIFIED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 max-w-[200px] truncate">
                          {typeof field.expected === 'object' ? JSON.stringify(field.expected) : String(field.expected ?? 'null')}
                        </td>
                        <td className="py-2 px-3 text-rose-400 max-w-[200px] truncate">
                          {typeof field.actual === 'object' ? JSON.stringify(field.actual) : String(field.actual ?? 'null')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dependency Impact Analysis */}
            <div className="p-3 bg-[#0a0b0e] border border-[#272a33] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-cyan-400">hub</span>
                Dependency & Blast Radius Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DIRECT WORKLOAD</span>
                  <strong className="text-white font-mono">{selectedDrift.resource_name || selectedDrift.resource_id}</strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">DOWNSTREAM CALLERS</span>
                  <strong className="text-amber-400">
                    {(selectedDrift.dependency_impact?.downstreamCallers || []).length > 0
                      ? selectedDrift.dependency_impact.downstreamCallers.join(', ')
                      : 'None detected'}
                  </strong>
                </div>
                <div className="bg-[#101116] p-2.5 rounded border border-[#272a33]">
                  <span className="text-[#9296A3] block text-[10px]">CRITICAL INFRASTRUCTURE</span>
                  <strong className={selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'text-rose-400' : 'text-emerald-400'}>
                    {selectedDrift.dependency_impact?.criticalInfrastructureInvolved ? 'Flagged (Protected)' : 'Standard Workload'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
              <div className="flex items-center gap-2">
                {selectedDrift.status !== 'acknowledged' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-300 hover:text-white"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedDrift.status !== 'ignored' && (
                  <button
                    onClick={() => handleAcknowledgeDrift(selectedDrift.id, 'ignored')}
                    className="px-3 py-1.5 rounded text-xs bg-[#171920] border border-[#272a33] text-zinc-400 hover:text-rose-300"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDriftDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {selectedDrift.status !== 'reconciled' && user?.role !== 'viewer' && (
                  <button
                    onClick={() => {
                      setDriftDetailModalOpen(false);
                      handleOpenReconciliation(selectedDrift);
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">published_with_changes</span>
                    Plan Reconciliation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 23G: RECONCILIATION PREVIEW MODAL */}
      {reconciliationModalOpen && reconciliationPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[24px]">published_with_changes</span>
                <div>
                  <h3 className="font-bold text-white text-base">Governed Reconciliation Preview</h3>
                  <div className="text-xs text-[#9296A3] font-mono">Plan: {reconciliationPlan.id} • Target: {reconciliationPlan.resource_id}</div>
                </div>
              </div>
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Safety & Execution Assessment */}
            <div className={`p-3.5 rounded-lg border ${
              reconciliationPlan.is_executable
                ? 'bg-blue-950/20 border-blue-800/40'
                : 'bg-amber-950/30 border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">
                    {reconciliationPlan.is_executable ? 'verified_user' : 'report'}
                  </span>
                  Execution Safety Status: {reconciliationPlan.is_executable ? 'Governed Automated Runbook' : 'Manual Intervention Required'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {reconciliationPlan.approval_model || 'two-person'}
                </span>
              </div>
              <p className="text-xs text-[#9296A3] mt-2">
                {reconciliationPlan.safety_assessment?.notes ||
                 'All proposed state changes must pass through multi-person approval before mutation execution.'}
              </p>
            </div>

            {/* Proposed Steps */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Proposed Actions</h4>
              <div className="space-y-2">
                {(Array.isArray(reconciliationPlan.proposed_actions) ? reconciliationPlan.proposed_actions : []).map((act, idx) => (
                  <div key={idx} className="bg-[#0a0b0e] p-3 rounded border border-[#272a33] space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{act.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900">
                        Target State: {act.targetState || act.targetReplicas !== undefined ? `${act.targetReplicas} replicas` : 'Reconciled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9296A3]">Target Resource: {act.resourceId}</div>
                    {act.details && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-1">
                        {act.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Warnings */}
            {(reconciliationPlan.safety_assessment?.warnings || []).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-900 rounded text-amber-200 text-xs space-y-1">
                <strong className="block font-bold">Safety Guardrails & Risk Warnings:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {reconciliationPlan.safety_assessment.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Non-executable reason notice */}
            {!reconciliationPlan.is_executable && (
              <div className="p-3 bg-rose-950/30 border border-rose-900 rounded text-rose-200 text-xs">
                <strong>Policy Block:</strong> Automatic reconciliation is disabled for this drift type to prevent data loss or service disruption. Follow the recommended manual runbook.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
              <button
                onClick={() => setReconciliationModalOpen(false)}
                className="px-4 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              {reconciliationPlan.is_executable && (
                <button
                  onClick={handleSubmitReconciliation}
                  disabled={submittingReconciliation}
                  className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  {submittingReconciliation ? 'Submitting...' : 'Submit for Governed Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudLifecyclePage;
