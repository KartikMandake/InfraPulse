import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';

export const RunbooksPage = () => {
  const { user } = useAuth();
  const { incidents } = useApp();
  const navigate = useNavigate();

  const [runbooks, setRunbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedMode, setSelectedMode] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all');

  // Selected Runbook
  const [selectedRunbookId, setSelectedRunbookId] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState(incidents[0]?.id || 'INC-4921');

  // Active Runner State
  const [activeTab, setActiveTab] = useState('steps'); // 'steps' | 'dryrun' | 'execution'
  const [dryRunPlan, setDryRunPlan] = useState(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [activeExecution, setActiveExecution] = useState(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [twoFactorConfirmed, setTwoFactorConfirmed] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Fetch runbooks catalog from backend API
  useEffect(() => {
    let isMounted = true;
    async function fetchCatalog() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getRunbooks();
        if (isMounted && res.data) {
          setRunbooks(res.data);
          if (res.data.length > 0 && !selectedRunbookId) {
            setSelectedRunbookId(res.data[0].id);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load runbooks catalog.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchCatalog();
    return () => { isMounted = false; };
  }, []);

  const currentRunbook = runbooks.find(r => r.id === selectedRunbookId) || runbooks[0] || null;

  // Filtered runbooks
  const filteredRunbooks = runbooks.filter(rb => {
    const matchesSearch = !search ||
      rb.title.toLowerCase().includes(search.toLowerCase()) ||
      rb.id.toLowerCase().includes(search.toLowerCase()) ||
      rb.description.toLowerCase().includes(search.toLowerCase());
    const matchesMode = selectedMode === 'all' || rb.executionMode === selectedMode;
    const matchesRisk = selectedRisk === 'all' || rb.riskLevel === selectedRisk;
    return matchesSearch && matchesMode && matchesRisk;
  });

  // Handle dry-run plan generation
  const handleDryRun = async () => {
    if (!currentRunbook) return;
    setDryRunLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.dryRunIncidentRunbook(selectedIncidentId, currentRunbook.id);
      setDryRunPlan(res.data);
      setActiveTab('dryrun');
      setActionSuccess('Dry-run plan generated and preconditions verified successfully.');
    } catch (err) {
      setActionError(err.message || 'Failed to generate dry-run execution plan.');
    } finally {
      setDryRunLoading(false);
    }
  };

  // Handle creating execution request
  const handleCreateExecution = async () => {
    if (!currentRunbook) return;
    setExecutionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const idempotencyKey = `idem_${currentRunbook.id}_${selectedIncidentId}_${Date.now()}`;
      const res = await api.createIncidentExecution(selectedIncidentId, currentRunbook.id, {
        idempotencyKey
      });
      setActiveExecution(res.data);
      setActiveTab('dryrun');

      if (res.data.status === 'APPROVED') {
        setActionSuccess('Diagnostic runbook auto-approved per policy. Ready for execution.');
      } else {
        // Request approval
        const apprRes = await api.requestApproval(res.data.id);
        const updated = await api.getExecutionById(res.data.id);
        setActiveExecution(updated.data);
        setActionSuccess('Remediation execution request created. Awaiting approval from authorized operator.');
      }
    } catch (err) {
      setActionError(err.message || 'Failed to create execution request.');
    } finally {
      setExecutionLoading(false);
    }
  };

  // Handle Approval
  const handleApprove = async () => {
    if (!activeExecution) return;
    setExecutionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.approveExecution(activeExecution.id, {
        approvalNotes,
        twoFactorConfirmed
      });
      const updated = await api.getExecutionById(activeExecution.id);
      setActiveExecution(updated.data);
      setActionSuccess('Execution plan approved! You may now trigger controlled execution.');
    } catch (err) {
      setActionError(err.message || 'Approval failed.');
    } finally {
      setExecutionLoading(false);
    }
  };

  // Handle Rejection
  const handleReject = async () => {
    if (!activeExecution) return;
    setExecutionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.rejectExecution(activeExecution.id, {
        rejectionReason: approvalNotes || 'Rejected by operator'
      });
      const updated = await api.getExecutionById(activeExecution.id);
      setActiveExecution(updated.data);
      setActionSuccess('Execution request rejected and cancelled.');
    } catch (err) {
      setActionError(err.message || 'Rejection failed.');
    } finally {
      setExecutionLoading(false);
    }
  };

  // Handle Execution Run
  const handleExecute = async () => {
    if (!activeExecution) return;
    setExecutionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    setActiveTab('execution');
    try {
      const res = await api.executeRunbook(activeExecution.id);
      setActiveExecution(res.data);
      if (res.data.status === 'SUCCEEDED') {
        setActionSuccess('Runbook execution completed successfully with all verification checks passed.');
      } else {
        setActionError(`Execution finished with status: ${res.data.status}. ${res.data.errorMessage || ''}`);
      }
    } catch (err) {
      setActionError(err.message || 'Execution failed.');
      // Refresh execution status
      const updated = await api.getExecutionById(activeExecution.id).catch(() => null);
      if (updated?.data) setActiveExecution(updated.data);
    } finally {
      setExecutionLoading(false);
    }
  };

  const getRiskBadge = (risk) => {
    switch (risk?.toLowerCase()) {
      case 'low':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#17303b] text-[#56d3c9] border border-[#234b5c]">LOW RISK</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#3b2d17] text-[#ffb84d] border border-[#5c4723]">MEDIUM RISK</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#3b1717] text-[#ff5c5c] border border-[#5c2323]">HIGH RISK</span>;
      case 'critical':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#2e173b] text-[#d45cff] border border-[#4d235c]">CRITICAL</span>;
      default:
        return null;
    }
  };

  const getModeBadge = (mode) => {
    if (mode === 'diagnostic') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1558C9]/20 text-[#b1c5ff] border border-[#1558C9]/40">DIAGNOSTIC (READ-ONLY)</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#D4FF24]/15 text-[#D4FF24] border border-[#D4FF24]/40">REMEDIATION (SIMULATED)</span>;
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-4 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#d4ff24]">
            <span className="material-symbols-outlined text-[24px]">terminal</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-bold tracking-tight">Runbook Orchestrator & Safe Remediation</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#D4FF24]/20 text-[#D4FF24] border border-[#D4FF24]/40">
                PHASE 14
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Human-approved operational procedures, controlled simulation adapters, and immutable audit logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#9296A3]">Logged in as:</span>
          <span className="text-white font-bold">{user?.name || 'Sarah Chen'}</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#171920] text-[#b1c5ff] border border-[#272a33]">
            {user?.role || 'admin'}
          </span>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="flex items-center justify-between p-3 bg-[#1558C9]/10 border border-[#1558C9]/30 rounded-xl text-xs text-[#b1c5ff]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#56d3c9]">shield</span>
          <span>
            <strong className="text-white">Safety Enforced:</strong> All remediation actions are dispatched to allowlisted simulation adapters. No arbitrary shell execution, SQL, or unapproved mutations.
          </span>
        </div>
        <span className="text-[11px] text-[#9296A3] hidden md:inline">Deterministic RCA Integration</span>
      </div>

      {/* Alerts / Error feedback */}
      {actionError && (
        <div className="p-3 bg-[#ff5c5c]/15 border border-[#ff5c5c]/40 rounded-xl text-xs text-[#ff5c5c] flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-white hover:underline">✕</button>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-[#50d890]/15 border border-[#50d890]/40 rounded-xl text-xs text-[#50d890] flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-white hover:underline">✕</button>
        </div>
      )}

      {/* Main Grid: Catalog Sidebar (4 cols) & Inspector/Runner (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Sidebar: Catalog & Filter */}
        <div className="lg:col-span-4 bg-[#101116] border border-[#272a33] rounded-xl p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[#272a33] pb-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Runbook Catalog</span>
            <span className="text-xs text-[#9296A3]">{filteredRunbooks.length} Available</span>
          </div>

          {/* Search & Filter inputs */}
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Search runbooks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[#030407] border border-[#272a33] text-xs text-white placeholder-[#5A5E6B] focus:border-[#d4ff24] focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="px-2 py-1.5 rounded bg-[#030407] border border-[#272a33] text-xs text-[#9296A3] focus:border-[#d4ff24] focus:outline-none"
              >
                <option value="all">All Modes</option>
                <option value="diagnostic">Diagnostic</option>
                <option value="remediation">Remediation</option>
              </select>
              <select
                value={selectedRisk}
                onChange={(e) => setSelectedRisk(e.target.value)}
                className="px-2 py-1.5 rounded bg-[#030407] border border-[#272a33] text-xs text-[#9296A3] focus:border-[#d4ff24] focus:outline-none"
              >
                <option value="all">All Risks</option>
                <option value="low">Low Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="high">High Risk</option>
              </select>
            </div>
          </div>

          {/* Runbook Item Cards */}
          <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
            {loading && <div className="text-xs text-[#9296A3] p-4 text-center">Loading runbooks...</div>}
            {!loading && filteredRunbooks.length === 0 && (
              <div className="text-xs text-[#9296A3] p-4 text-center">No runbooks match your filter criteria.</div>
            )}
            {filteredRunbooks.map((rb) => {
              const isSelected = rb.id === currentRunbook?.id;
              return (
                <div
                  key={rb.id}
                  onClick={() => {
                    setSelectedRunbookId(rb.id);
                    setDryRunPlan(null);
                    setActiveExecution(null);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#171920] border-[#d4ff24] shadow-sm'
                      : 'bg-[#030407] border-[#272a33] hover:border-[#3A3E4D]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-white">{rb.id}</span>
                    <div className="flex items-center gap-1.5">
                      {getRiskBadge(rb.riskLevel)}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-white leading-snug">{rb.title}</div>
                  <div className="flex items-center justify-between text-[11px] text-[#9296A3] mt-2 pt-2 border-t border-[#171920]">
                    <span className="uppercase text-[10px] tracking-wider text-[#b1c5ff]">{rb.executionMode}</span>
                    <span className="text-[#d4ff24]">{rb.steps?.length || rb.stepCount || 3} Steps</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Section: Inspector & Execution Runner (8 cols) */}
        <div className="lg:col-span-8 bg-[#101116] border border-[#272a33] rounded-xl p-4 flex flex-col gap-4 shadow-md">
          {currentRunbook ? (
            <>
              {/* Runbook Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#272a33] pb-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded bg-[#171920] text-white font-bold border border-[#272a33]">
                      {currentRunbook.id}
                    </span>
                    <h2 className="text-base font-bold text-white">{currentRunbook.title}</h2>
                    {getModeBadge(currentRunbook.executionMode)}
                    {getRiskBadge(currentRunbook.riskLevel)}
                  </div>
                  <p className="text-xs text-[#9296A3] leading-relaxed">{currentRunbook.description}</p>
                </div>

                {/* Target Incident Selector */}
                <div className="shrink-0 flex flex-col gap-1 sm:text-right">
                  <label className="text-[10px] uppercase text-[#9296A3] font-bold">Target Incident Context</label>
                  <select
                    value={selectedIncidentId}
                    onChange={(e) => {
                      setSelectedIncidentId(e.target.value);
                      setDryRunPlan(null);
                      setActiveExecution(null);
                    }}
                    className="px-2.5 py-1 rounded bg-[#030407] border border-[#272a33] text-xs text-[#d4ff24] font-bold focus:outline-none"
                  >
                    {incidents.map(inc => (
                      <option key={inc.id} value={inc.id}>{inc.id}: {inc.serviceName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-[#272a33] pb-2 text-xs">
                <button
                  onClick={() => setActiveTab('steps')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'steps' ? 'bg-[#171920] text-[#d4ff24] border border-[#d4ff24]/30' : 'text-[#9296A3] hover:text-white'
                  }`}
                >
                  1. Steps & Procedures
                </button>
                <button
                  onClick={() => setActiveTab('dryrun')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'dryrun' ? 'bg-[#171920] text-[#d4ff24] border border-[#d4ff24]/30' : 'text-[#9296A3] hover:text-white'
                  }`}
                >
                  2. Dry-Run & Approval {activeExecution ? `(${activeExecution.status})` : ''}
                </button>
                <button
                  onClick={() => setActiveTab('execution')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'execution' ? 'bg-[#171920] text-[#d4ff24] border border-[#d4ff24]/30' : 'text-[#9296A3] hover:text-white'
                  }`}
                >
                  3. Execution Progress & Audit
                </button>
              </div>

              {/* Tab 1: Steps & Procedures */}
              {activeTab === 'steps' && (
                <div className="flex flex-col gap-4">
                  {/* Preconditions & Requirements */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-[#b1c5ff] block mb-1">Preconditions</span>
                      <ul className="list-disc list-inside space-y-1 text-[#9296A3]">
                        {(currentRunbook.preconditions || []).map((pc, idx) => (
                          <li key={idx}>{pc}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-[#b1c5ff] block mb-1">Governance & Safety</span>
                      <div className="space-y-1 text-[#9296A3]">
                        <div>Required Role: <strong className="text-white uppercase">{currentRunbook.requiredApprovalRole || 'responder'}</strong></div>
                        <div>Applicable Services: <span className="text-[#56d3c9]">{(currentRunbook.applicableServices || ['*']).join(', ')}</span></div>
                        <div>Verification: <span className="text-[#9296A3]">{currentRunbook.verificationProcedure}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Step Cards */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Ordered Execution Steps</span>
                    {(currentRunbook.steps || []).map((step) => (
                      <div key={step.stepNumber} className="p-3 rounded-lg bg-[#030407] border border-[#272a33] flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#171920] text-[#d4ff24] flex items-center justify-center font-bold text-[10px]">
                              {step.stepNumber}
                            </span>
                            <span className="font-bold text-white">{step.name}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#171920] text-[#56d3c9] border border-[#272a33]">
                            {step.adapterAction}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9296A3]">{step.description}</p>
                        <div className="bg-[#101116] p-2 rounded text-[11px] text-[#b1c5ff] border border-[#272a33] flex items-center justify-between">
                          <span>Params: {JSON.stringify(step.parameters || {})}</span>
                          {step.isRemediation && (
                            <span className="text-[10px] text-[#ffb84d] font-bold">⚠️ Remediation Action</span>
                          )}
                        </div>
                        {step.compensationAction && (
                          <div className="text-[10px] text-[#9296A3] pl-2 border-l-2 border-[#1558C9]">
                            Compensation on Failure: <span className="text-[#56d3c9]">{step.compensationAction.action}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Next Step Action Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleDryRun}
                      disabled={dryRunLoading}
                      className="px-4 py-2 rounded-lg bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-all flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                      {dryRunLoading ? 'Evaluating Preconditions...' : 'Generate Dry-Run Execution Plan →'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Dry-Run & Approval */}
              {activeTab === 'dryrun' && (
                <div className="flex flex-col gap-4">
                  {dryRunPlan ? (
                    <div className="p-4 bg-[#030407] border border-[#272a33] rounded-xl space-y-3">
                      <div className="flex items-center justify-between text-xs border-b border-[#272a33] pb-2">
                        <span className="font-bold text-white uppercase">Dry-Run Execution Plan Preview</span>
                        <span className="text-[11px] text-[#56d3c9]">Hash: {dryRunPlan.planHash?.slice(0, 16)}...</span>
                      </div>

                      {/* Precondition Evaluation Status */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-[#9296A3] uppercase">Precondition Evaluation:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(dryRunPlan.preconditionDetails || []).map((p, idx) => (
                            <div key={idx} className="p-2 rounded bg-[#101116] border border-[#272a33] text-xs flex items-center justify-between">
                              <span className="text-[#9296A3] text-[11px]">{p.precondition}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.met ? 'bg-[#50d890]/20 text-[#50d890]' : 'bg-[#ff5c5c]/20 text-[#ff5c5c]'}`}>
                                {p.met ? 'PASSED' : 'FAILED'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions Button */}
                      {!activeExecution ? (
                        <div className="flex items-center justify-between pt-3 border-t border-[#272a33]">
                          <span className="text-xs text-[#9296A3]">Preconditions evaluated. Ready to initiate execution workflow.</span>
                          <button
                            onClick={handleCreateExecution}
                            disabled={executionLoading}
                            className="px-4 py-2 rounded-lg bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-all"
                          >
                            {executionLoading ? 'Initiating...' : 'Request Execution Plan'}
                          </button>
                        </div>
                      ) : (
                        <div className="pt-3 border-t border-[#272a33] space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#9296A3]">Execution ID: <strong className="text-white">{activeExecution.id}</strong></span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              activeExecution.status === 'APPROVED' ? 'bg-[#50d890]/20 text-[#50d890]' :
                              activeExecution.status === 'PENDING_APPROVAL' ? 'bg-[#ffb84d]/20 text-[#ffb84d]' : 'bg-[#171920] text-white'
                            }`}>
                              Status: {activeExecution.status}
                            </span>
                          </div>

                          {/* Approval Request Box */}
                          {activeExecution.status === 'PENDING_APPROVAL' && (
                            <div className="p-3 bg-[#171920] border border-[#ffb84d]/40 rounded-lg space-y-2">
                              <div className="text-xs font-bold text-[#ffb84d] flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px]">lock_clock</span>
                                Remediation Approval Required (Role: {currentRunbook.requiredApprovalRole.toUpperCase()})
                              </div>
                              <p className="text-[11px] text-[#9296A3]">
                                Requested by: <strong className="text-white">{activeExecution.requestedBy}</strong>. Viewers and the original requester cannot approve their own requests (Self-Approval Prevention enforced).
                              </p>

                              {/* Self approval warning */}
                              {user?.id === activeExecution.requestedBy && (
                                <div className="text-[11px] text-[#ffb84d] p-2 bg-[#030407] rounded border border-[#ffb84d]/30">
                                  ⚠️ You are the requester of this execution. Another authorized responder or admin must review and approve it.
                                </div>
                              )}

                              <input
                                type="text"
                                placeholder="Approval review notes (optional)..."
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded bg-[#030407] border border-[#272a33] text-xs text-white focus:outline-none"
                              />

                              {currentRunbook.riskLevel === 'high' && (
                                <label className="flex items-center gap-2 text-xs text-white cursor-pointer pt-1">
                                  <input
                                    type="checkbox"
                                    checked={twoFactorConfirmed}
                                    onChange={(e) => setTwoFactorConfirmed(e.target.checked)}
                                    className="rounded border-[#272a33]"
                                  />
                                  <span>I confirm high-risk impact verification and authorize simulated execution</span>
                                </label>
                              )}

                              <div className="flex items-center gap-2 pt-2">
                                <button
                                  onClick={handleApprove}
                                  disabled={executionLoading || user?.id === activeExecution.requestedBy}
                                  className="px-3 py-1.5 rounded bg-[#50d890] text-[#030407] font-bold text-xs hover:bg-[#68e3a2] disabled:opacity-50 transition-all"
                                >
                                  Approve Remediation
                                </button>
                                <button
                                  onClick={handleReject}
                                  disabled={executionLoading}
                                  className="px-3 py-1.5 rounded bg-[#ff5c5c]/20 text-[#ff5c5c] font-bold text-xs hover:bg-[#ff5c5c]/30 border border-[#ff5c5c]/40 transition-all"
                                >
                                  Reject Request
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Trigger Execution Button */}
                          {activeExecution.status === 'APPROVED' && (
                            <div className="flex items-center justify-between pt-2">
                              <span className="text-xs text-[#50d890]">Plan approved! Proceed with controlled simulation execution.</span>
                              <button
                                onClick={handleExecute}
                                disabled={executionLoading}
                                className="px-4 py-2 rounded-lg bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-all flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
                                {executionLoading ? 'Executing...' : 'Execute Runbook Now'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-[#9296A3] bg-[#030407] border border-[#272a33] rounded-xl space-y-3">
                      <span className="material-symbols-outlined text-[36px] text-[#5A5E6B]">fact_check</span>
                      <p>Generate a dry-run plan to validate preconditions and review the execution hash before requesting approval.</p>
                      <button
                        onClick={handleDryRun}
                        disabled={dryRunLoading}
                        className="px-4 py-2 rounded-lg bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-all"
                      >
                        {dryRunLoading ? 'Evaluating...' : 'Generate Dry-Run Plan'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Execution Progress & Audit */}
              {activeTab === 'execution' && (
                <div className="flex flex-col gap-4">
                  {activeExecution ? (
                    <div className="space-y-4">
                      {/* Status header */}
                      <div className="p-3 bg-[#030407] border border-[#272a33] rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[#9296A3]">Execution ID: </span>
                          <strong className="text-white">{activeExecution.id}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                            activeExecution.status === 'SUCCEEDED' ? 'bg-[#50d890]/20 text-[#50d890] border border-[#50d890]/40' :
                            activeExecution.status === 'FAILED' ? 'bg-[#ff5c5c]/20 text-[#ff5c5c] border border-[#ff5c5c]/40' :
                            activeExecution.status === 'RUNNING' ? 'bg-[#56d3c9]/20 text-[#56d3c9] animate-pulse border border-[#56d3c9]/40' :
                            'bg-[#171920] text-[#9296A3]'
                          }`}>
                            {activeExecution.status}
                          </span>
                        </div>
                      </div>

                      {/* Per-step results */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Per-Step Execution Results</span>
                        {(activeExecution.steps || []).map((s) => (
                          <div
                            key={s.id || s.stepNumber}
                            className={`p-3 rounded-lg border flex flex-col gap-2 transition-all ${
                              s.status === 'SUCCEEDED' ? 'bg-[#030407] border-[#50d890]/40' :
                              s.status === 'FAILED' ? 'bg-[#030407] border-[#ff5c5c]/40' :
                              s.status === 'RUNNING' ? 'bg-[#171920] border-[#56d3c9]/50 animate-pulse' :
                              'bg-[#030407] border-[#272a33]'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  s.status === 'SUCCEEDED' ? 'bg-[#50d890] text-[#030407]' :
                                  s.status === 'FAILED' ? 'bg-[#ff5c5c] text-white' :
                                  'bg-[#171920] text-[#9296A3]'
                                }`}>
                                  {s.status === 'SUCCEEDED' ? '✓' : s.status === 'FAILED' ? '✕' : s.stepNumber}
                                </span>
                                <span className="font-bold text-white">{s.name}</span>
                              </div>
                              <span className="text-[10px] text-[#9296A3]">{s.adapterAction}</span>
                            </div>

                            {/* Simulated Output Output */}
                            {s.result?.details?.simulatedOutput && (
                              <div className="p-2 bg-[#101116] border border-[#272a33] rounded text-[11px] text-[#50d890]">
                                $ {s.result.details.simulatedOutput}
                              </div>
                            )}

                            {s.errorMessage && (
                              <div className="p-2 bg-[#ff5c5c]/10 border border-[#ff5c5c]/30 rounded text-[11px] text-[#ff5c5c]">
                                Error: {s.errorMessage}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Action Logs Drawer */}
                      {(activeExecution.logs || []).length > 0 && (
                        <div className="p-3 bg-[#030407] border border-[#272a33] rounded-xl space-y-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">Immutable Action History</span>
                          <div className="space-y-1 max-h-40 overflow-y-auto text-[11px]">
                            {activeExecution.logs.map((log) => (
                              <div key={log.id} className="flex items-center justify-between p-1.5 rounded bg-[#101116] text-[#9296A3]">
                                <span>{log.action} ({log.adapterType})</span>
                                <span className={log.outcome === 'success' ? 'text-[#50d890]' : 'text-[#ff5c5c]'}>
                                  {log.outcome} • {new Date(log.createdAt).toLocaleTimeString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-[#9296A3] bg-[#030407] border border-[#272a33] rounded-xl">
                      No active execution running. Generate a dry run plan and approve execution to track progress.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-[#9296A3] p-8 text-center">Select a runbook from the catalog to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RunbooksPage;
