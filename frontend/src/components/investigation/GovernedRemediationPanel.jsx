import React, { useState, useEffect } from 'react';
import api from '../../services/api.js';

export const GovernedRemediationPanel = ({ incidentId, incident, addToast }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [selectedPlanPreview, setSelectedPlanPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [explicitConfirmationMap, setExplicitConfirmationMap] = useState({});

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const res = await api.getRemediationRecommendations({ incidentId });
      if (res?.data) {
        setRecommendations(res.data);
      }
    } catch (err) {
      console.warn('[RemediationPanel] Error fetching recommendations:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (incidentId) {
      fetchRecommendations();
    }
  }, [incidentId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateRemediationRecommendations(incidentId);
      if (res?.data?.recommendations) {
        setRecommendations(res.data.recommendations);
        if (addToast) addToast('Generated governed remediation recommendations from RCA findings.', 'success');
      } else {
        if (addToast) addToast(res?.data?.message || 'No actionable recommendation generated.', 'info');
      }
    } catch (err) {
      if (addToast) addToast(`Failed to generate recommendations: ${err.message}`, 'error');
    } finally {
      setGenerating(false);
      fetchRecommendations();
    }
  };

  const handleDryRun = async (planId) => {
    setPreviewLoading(true);
    try {
      const res = await api.dryRunRemediationPlan(planId);
      if (res?.data) {
        setSelectedPlanPreview(res.data);
      }
    } catch (err) {
      if (addToast) addToast(`Dry-run failed: ${err.message}`, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRequestApproval = async (planId) => {
    setActionInProgress(planId);
    try {
      await api.requestRemediationApproval(planId, { ttlMinutes: 60 });
      if (addToast) addToast('Approval requested. Pending multi-party review.', 'success');
      fetchRecommendations();
    } catch (err) {
      if (addToast) addToast(`Failed to request approval: ${err.message}`, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApprove = async (approvalId, planHash) => {
    setActionInProgress(approvalId);
    try {
      await api.approveRemediationPlan(approvalId, { planHash });
      if (addToast) addToast('Remediation plan approved.', 'success');
      fetchRecommendations();
    } catch (err) {
      if (addToast) addToast(`Approval failed: ${err.message}`, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleExecute = async (planId) => {
    if (!explicitConfirmationMap[planId]) {
      if (addToast) addToast('Please check the confirmation box before executing.', 'warning');
      return;
    }

    setActionInProgress(planId);
    try {
      const res = await api.executeRemediationPlan(planId, { explicitConfirmation: true });
      if (res?.data?.success) {
        if (addToast) addToast(`Remediation executed. Verification: ${res.data.verification?.outcome || 'SUCCESSFUL'}`, 'success');
      } else {
        if (addToast) addToast(`Remediation completed with warnings: ${res?.data?.verification?.outcome || 'FAILED'}`, 'warning');
      }
      fetchRecommendations();
    } catch (err) {
      if (addToast) addToast(`Execution failed: ${err.message}`, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const getRiskBadge = (level) => {
    switch (level?.toUpperCase()) {
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#14532d]/40 text-[#4ade80] border border-[#22c55e]/40">LOW RISK</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#713f12]/40 text-[#facc15] border border-[#eab308]/40">MEDIUM RISK</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#7c2d12]/40 text-[#fb923c] border border-[#f97316]/40">HIGH RISK (2-PERSON)</span>;
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#7f1d1d]/40 text-[#f87171] border border-[#ef4444]/40">CRITICAL (BLOCKED)</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1f2937] text-gray-300">UNKNOWN</span>;
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#14532d]/40 text-[#4ade80] border border-[#22c55e]/40">COMPLETED</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1e3a8a]/40 text-[#60a5fa] border border-[#3b82f6]/40">APPROVED</span>;
      case 'PENDING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#713f12]/40 text-[#facc15] border border-[#eab308]/40">PENDING APPROVAL</span>;
      case 'BLOCKED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#7f1d1d]/40 text-[#f87171] border border-[#ef4444]/40">BLOCKED</span>;
      case 'FAILED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#7f1d1d]/40 text-[#f87171] border border-[#ef4444]/40">FAILED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1f2937] text-gray-300">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Trigger */}
      <div className="bg-[#101116] border border-[#272a33] p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#d4ff24]">build_circle</span>
            <h2 className="text-sm font-bold text-white">Governed Infrastructure Remediation</h2>
          </div>
          <p className="text-xs text-[#9296A3] mt-1 max-w-2xl leading-relaxed">
            Evidence-backed remediation actions derived deterministically from RCA findings. Mutations strictly enforce RBAC, 2-person approval, and non-destructive rollbacks.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-3.5 py-2 rounded-lg bg-[#d4ff24] hover:bg-[#bceb1a] text-[#030407] font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[16px] ${generating ? 'animate-spin' : ''}`}>
            auto_fix_high
          </span>
          <span>{generating ? 'Evaluating RCA...' : 'Evaluate & Generate Recommendations'}</span>
        </button>
      </div>

      {/* Recommendations List */}
      {loading ? (
        <div className="p-8 text-center text-xs text-[#9296A3] bg-[#101116] border border-[#272a33] rounded-xl">
          Loading remediation recommendations...
        </div>
      ) : recommendations.length === 0 ? (
        <div className="p-8 text-center bg-[#101116] border border-[#272a33] rounded-xl space-y-2">
          <span className="material-symbols-outlined text-[32px] text-[#5A5E6B]">security</span>
          <p className="text-sm font-bold text-white">No Active Remediation Recommendations</p>
          <p className="text-xs text-[#9296A3] max-w-md mx-auto">
            Click "Evaluate & Generate Recommendations" to translate verified RCA findings into safe, policy-checked remediation proposals.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => {
            const planId = rec.planId || rec.id;
            const isConfirmed = Boolean(explicitConfirmationMap[planId]);

            return (
              <div
                key={rec.id}
                className="bg-[#101116] border border-[#272a33] rounded-xl p-4 space-y-3 shadow-sm hover:border-[#3A3E4D] transition-colors"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#272a33] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[#d4ff24] text-[20px]">
                      {rec.proposed_action?.includes('RESTART') ? 'restart_alt' : (rec.proposed_action?.includes('START') ? 'play_arrow' : 'settings_suggest')}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{rec.proposed_action || rec.proposedAction}</span>
                        {getRiskBadge(rec.risk_level || rec.riskLevel)}
                        {getStatusBadge(rec.status)}
                      </div>
                      <div className="text-[11px] text-[#9296A3] mt-0.5">
                        Target Resource: <strong className="text-white font-mono">{rec.resource_id || rec.resourceId}</strong> • Environment: <strong className="text-white">{rec.environment}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleDryRun(planId)}
                      disabled={previewLoading}
                      className="px-2.5 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e] text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">preview</span>
                      <span>Dry-Run</span>
                    </button>

                    {rec.status === 'PENDING' && (
                      <button
                        onClick={() => handleRequestApproval(planId)}
                        disabled={actionInProgress === planId}
                        className="px-2.5 py-1.5 rounded bg-[#1558c9] hover:bg-[#124cb0] text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">how_to_reg</span>
                        <span>Request Approval</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Body Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 bg-[#030407] border border-[#272a33] rounded-lg space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#9296A3]">Detected Problem</span>
                    <p className="text-white leading-relaxed">{rec.detected_problem || rec.detectedProblem}</p>
                  </div>

                  <div className="p-2.5 bg-[#030407] border border-[#272a33] rounded-lg space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#9296A3]">Expected Outcome</span>
                    <p className="text-white leading-relaxed">{rec.expected_outcome || rec.expectedOutcome}</p>
                  </div>
                </div>

                {/* Risk Rationale & Blast Radius */}
                <div className="p-2.5 bg-[#171920] border border-[#272a33] rounded-lg text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#9296A3]">Operational Risk Score: <strong className="text-white font-mono">{rec.risk_score || rec.riskScore}/100</strong></span>
                    <span className="text-[#9296A3]">Confidence: <strong className="text-[#d4ff24] font-mono">{Math.round((rec.confidence_score || rec.confidenceScore || 0.85) * 100)}%</strong></span>
                  </div>
                  <p className="text-[#9296A3] leading-relaxed text-[11px]">{rec.risk_rationale || rec.riskRationale}</p>
                </div>

                {/* Execution Confirmation Box for Approved Actions */}
                {rec.status === 'APPROVED' && (
                  <div className="p-3 bg-[#1e293b]/40 border border-[#3b82f6]/40 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-white">
                      <input
                        type="checkbox"
                        checked={isConfirmed}
                        onChange={(e) => setExplicitConfirmationMap({ ...explicitConfirmationMap, [planId]: e.target.checked })}
                        className="rounded border-[#272a33] text-[#d4ff24] focus:ring-0"
                      />
                      <span>I confirm pre-conditions are verified and authorize controlled infrastructure mutation.</span>
                    </label>

                    <button
                      onClick={() => handleExecute(planId)}
                      disabled={!isConfirmed || actionInProgress === planId}
                      className="px-3 py-1.5 rounded bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[15px]">play_circle</span>
                      <span>Execute Remediation</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dry Run Preview Modal */}
      {selectedPlanPreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#d4ff24] text-[22px]">preview</span>
                <h3 className="font-bold text-white text-base">Execution Dry-Run Preview</h3>
              </div>
              <button
                onClick={() => setSelectedPlanPreview(null)}
                className="text-[#9296A3] hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#9296A3] uppercase block">Action</span>
                  <span className="font-bold text-white">{selectedPlanPreview.action}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#9296A3] uppercase block">Status</span>
                  <span className="font-bold text-[#4ade80]">{selectedPlanPreview.status}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#9296A3] uppercase block">Current State</span>
                  <span className="font-mono text-white">{selectedPlanPreview.targetResource?.currentState}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#9296A3] uppercase block">Intended State</span>
                  <span className="font-mono text-[#d4ff24]">{selectedPlanPreview.intendedState}</span>
                </div>
              </div>

              <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-[#9296A3] uppercase">Blast Radius & Downstream Callers</span>
                <p className="text-white">
                  Affected callers: {selectedPlanPreview.blastRadius?.downstreamCallersCount || 0} active service(s)
                </p>
                <p className="text-[11px] text-[#9296A3]">
                  Persistent Storage: {selectedPlanPreview.blastRadius?.persistentStorageProtected ? 'Retained & Protected' : 'N/A'}
                </p>
              </div>

              <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-[#9296A3] uppercase">Rollback & Compensating Strategy</span>
                <p className="text-white">
                  Reversible: <strong className="text-[#d4ff24]">{selectedPlanPreview.rollbackPlan?.isReversible ? 'Yes' : 'Compensating Action Only'}</strong>
                </p>
                <p className="text-[11px] text-[#9296A3]">
                  {selectedPlanPreview.rollbackPlan?.compensatingProcedure}
                </p>
              </div>
            </div>

            <div className="border-t border-[#272a33] pt-3 flex justify-end">
              <button
                onClick={() => setSelectedPlanPreview(null)}
                className="px-4 py-1.5 rounded bg-[#272a33] hover:bg-[#323642] text-white text-xs font-bold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GovernedRemediationPanel;

