import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';

export const SLOsPage = () => {
  const { user } = useAuth();
  const { services } = useApp();
  const navigate = useNavigate();

  const [slos, setSlos] = useState([]);
  const [reliabilityOverview, setReliabilityOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedService, setSelectedService] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSliType, setSelectedSliType] = useState('all');

  // Modal State for SLO creation
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSlo, setNewSlo] = useState({
    name: '',
    description: '',
    serviceId: services[0]?.id || 'checkout-api',
    sliType: 'availability',
    sliDefinition: '',
    targetPercent: 99.90,
    latencyThresholdMs: 150,
    rollingWindowDays: 30,
    owner: 'SRE Reliability Team'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluatingSloId, setEvaluatingSloId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  // Fetch SLOs & Reliability Overview from backend API
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [slosRes, relRes] = await Promise.all([
        api.getSlos(),
        api.getReliabilityOverview()
      ]);
      if (slosRes?.data) setSlos(slosRes.data);
      if (relRes?.data) setReliabilityOverview(relRes.data);
    } catch (err) {
      setError(err.message || 'Failed to load SLO data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered SLOs
  const filteredSlos = slos.filter(slo => {
    const matchesService = selectedService === 'all' || slo.serviceId === selectedService;
    const matchesStatus = selectedStatus === 'all' || slo.status === selectedStatus;
    const matchesType = selectedSliType === 'all' || slo.sliType === selectedSliType;
    return matchesService && matchesStatus && matchesType;
  });

  // Evaluate SLO now
  const handleEvaluate = async (sloId) => {
    setEvaluatingSloId(sloId);
    setActionMessage(null);
    try {
      await api.evaluateSlo(sloId);
      await loadData();
      setActionMessage({ type: 'success', text: `SLO evaluation re-computed successfully.` });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Evaluation failed.' });
    } finally {
      setEvaluatingSloId(null);
    }
  };

  // Create new SLO
  const handleCreateSlo = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionMessage(null);
    try {
      await api.createSlo({
        ...newSlo,
        targetPercent: Number(newSlo.targetPercent),
        latencyThresholdMs: newSlo.sliType === 'latency' ? Number(newSlo.latencyThresholdMs) : null,
        rollingWindowDays: Number(newSlo.rollingWindowDays)
      });
      setIsModalOpen(false);
      await loadData();
      setActionMessage({ type: 'success', text: `New SLO "${newSlo.name}" created and initialized.` });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create SLO.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'breached':
        return <span className="px-2 py-0.5 rounded bg-[#93000a] text-[#ffdad6] text-[10px] font-bold">BUDGET EXHAUSTED</span>;
      case 'burn_warning':
        return <span className="px-2 py-0.5 rounded bg-[#ffb547]/20 text-[#ffb547] text-[10px] font-bold border border-[#ffb547]/30">BURNING FAST</span>;
      case 'zero_traffic':
        return <span className="px-2 py-0.5 rounded bg-[#272a33] text-[#9296A3] text-[10px] font-bold">ZERO TRAFFIC</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-[#50d890]/20 text-[#50d890] text-[10px] font-bold">NOMINAL</span>;
    }
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-4 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#ffb547]">
            <span className="material-symbols-outlined text-[24px]">speed</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-bold tracking-tight">SLO & Error Budget Intelligence</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1558C9]/20 text-[#b1c5ff] border border-[#1558C9]/40">
                PHASE 15
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Deterministic error budgets, multi-window burn-rate alerts (Google SRE standard), and service reliability scores.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user?.role !== 'viewer' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[#d4ff24] text-[#030407] text-xs font-bold hover:bg-[#e1ff59] transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Define SLO</span>
            </button>
          )}
        </div>
      </div>

      {/* Action feedback */}
      {actionMessage && (
        <div className={`p-3 rounded-xl text-xs flex items-center justify-between ${
          actionMessage.type === 'success' ? 'bg-[#50d890]/15 text-[#50d890] border border-[#50d890]/30' : 'bg-[#ff5c5c]/15 text-[#ff5c5c] border border-[#ff5c5c]/30'
        }`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-white hover:underline">✕</button>
        </div>
      )}

      {/* KPI Cards / Reliability Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Platform Reliability Score</div>
          <div className="text-2xl font-bold text-[#d4ff24] my-1">
            {reliabilityOverview?.summary?.averageReliabilityScore ?? 88}/100
          </div>
          <div className="text-[10px] text-[#50d890]">Deterministic weighted attainment</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Budget Exhausted SLOs</div>
          <div className="text-2xl font-bold text-[#ff5364] my-1">
            {reliabilityOverview?.summary?.breachedSloCount ?? slos.filter(s => s.status === 'breached').length}
          </div>
          <div className="text-[10px] text-[#ff5364]">Immediate freeze recommended</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Peak Burn Rate Multiplier</div>
          <div className="text-2xl font-bold text-[#ffb547] my-1">
            {reliabilityOverview?.summary?.peakBurnRateMultiplier ?? 14.4}x
          </div>
          <div className="text-[10px] text-[#ffb547]">1h fast-burn window peak</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Evaluated Events (30d)</div>
          <div className="text-2xl font-bold text-white my-1">
            {reliabilityOverview?.summary?.totalEvaluatedRequests ?? '209.6M'}
          </div>
          <div className="text-[10px] text-[#9296A3]">
            <span className="text-[#56d3c9]">Telemetry:</span> Simulated Demo Profile
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#9296A3] font-bold">Filters:</span>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="px-2.5 py-1.5 rounded bg-[#030407] border border-[#272a33] text-xs text-white focus:outline-none"
          >
            <option value="all">All Services</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded bg-[#030407] border border-[#272a33] text-xs text-white focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="nominal">Nominal</option>
            <option value="burn_warning">Burn Warning</option>
            <option value="breached">Budget Exhausted</option>
            <option value="zero_traffic">Zero Traffic</option>
          </select>
          <select
            value={selectedSliType}
            onChange={(e) => setSelectedSliType(e.target.value)}
            className="px-2.5 py-1.5 rounded bg-[#030407] border border-[#272a33] text-xs text-white focus:outline-none"
          >
            <option value="all">All SLI Types</option>
            <option value="availability">Availability</option>
            <option value="latency">Latency</option>
            <option value="error_rate">Error Rate</option>
            <option value="throughput">Throughput</option>
          </select>
        </div>

        <span className="text-xs text-[#9296A3]">{filteredSlos.length} of {slos.length} SLOs</span>
      </div>

      {/* SLO Cards List */}
      {loading ? (
        <div className="p-8 text-center text-xs text-[#9296A3] bg-[#101116] rounded-xl border border-[#272a33]">
          Loading SLOs and error budgets...
        </div>
      ) : filteredSlos.length === 0 ? (
        <EmptyState
          icon="speed"
          title="No Matching SLOs"
          description="Adjust your filters or define a new Service Level Objective to track reliability."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredSlos.map(slo => {
            const isBreached = slo.status === 'breached';
            const remainingBudget = slo.remainingBudgetPercent ?? 100;
            const burnRate = slo.burnRateMultiplier ?? 0;

            return (
              <div
                key={slo.id}
                className={`p-4 bg-[#101116] border rounded-xl flex flex-col gap-3 shadow-sm transition-all ${
                  isBreached ? 'border-[#ff5364]/60' : 'border-[#272a33] hover:border-[#3A3E4D]'
                }`}
              >
                {/* Top Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#272a33] pb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(slo.status)}
                      <span className="text-sm font-bold text-white">{slo.name}</span>
                      <button
                        onClick={() => navigate(`/services/${slo.serviceId}`)}
                        className="text-xs text-[#b1c5ff] hover:underline"
                      >
                        ({slo.serviceName || slo.serviceId})
                      </button>
                      <span className="px-1.5 py-0.2 rounded bg-[#030407] text-[#9296A3] text-[10px] border border-[#272a33] uppercase">
                        {slo.sliType}
                      </span>
                    </div>
                    <p className="text-xs text-[#9296A3] mt-1">{slo.sliDefinition}</p>
                  </div>

                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="text-[#9296A3]">Target: <strong className="text-white">{slo.targetPercent}%</strong></span>
                    <span className={isBreached ? 'text-[#ff5364] font-bold' : 'text-[#50d890] font-bold'}>
                      Attainment: {slo.currentPercent !== null ? `${slo.currentPercent}%` : 'N/A'}
                    </span>
                    <button
                      onClick={() => handleEvaluate(slo.id)}
                      disabled={evaluatingSloId === slo.id}
                      className="px-2.5 py-1 rounded bg-[#171920] border border-[#272a33] hover:border-[#d4ff24] text-[11px] text-[#d4ff24] transition-all"
                    >
                      {evaluatingSloId === slo.id ? 'Evaluating...' : 'Evaluate'}
                    </button>
                  </div>
                </div>

                {/* Error Budget Progress Bar & Burn Rate Multipliers */}
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between text-[#9296A3]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">Remaining Error Budget:</span>
                      <span className={remainingBudget <= 0 ? 'text-[#ff5364] font-bold' : remainingBudget <= 20 ? 'text-[#ffb547]' : 'text-[#50d890]'}>
                        {remainingBudget}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span>1h Burn: <strong className={burnRate >= 14.4 ? 'text-[#ff5364]' : 'text-white'}>{burnRate}x</strong></span>
                      <span>Rolling Window: <strong>{slo.rollingWindowDays || 30} days</strong></span>
                      <span className="text-[#56d3c9] text-[10px]">[SIMULATED TELEMETRY]</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2.5 w-full bg-[#030407] rounded-full overflow-hidden border border-[#272a33]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        remainingBudget <= 0 ? 'bg-[#ff5364]' :
                        remainingBudget <= 20 ? 'bg-[#ffb547]' : 'bg-[#50d890]'
                      }`}
                      style={{ width: `${Math.max(2, Math.min(100, remainingBudget))}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Define New SLO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#101116] border border-[#272a33] rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ffb547]">speed</span>
                Define New Service Level Objective
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[#9296A3] hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateSlo} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9296A3] mb-1">SLO Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Order Checkout Latency (< 150ms)"
                  value={newSlo.name}
                  onChange={(e) => setNewSlo({ ...newSlo, name: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-[#030407] border border-[#272a33] text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9296A3] mb-1">Target Service</label>
                  <select
                    value={newSlo.serviceId}
                    onChange={(e) => setNewSlo({ ...newSlo, serviceId: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-[#030407] border border-[#272a33] text-white focus:outline-none"
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#9296A3] mb-1">SLI Type</label>
                  <select
                    value={newSlo.sliType}
                    onChange={(e) => setNewSlo({ ...newSlo, sliType: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-[#030407] border border-[#272a33] text-white focus:outline-none"
                  >
                    <option value="availability">Availability</option>
                    <option value="latency">Latency</option>
                    <option value="error_rate">Error Rate</option>
                    <option value="throughput">Throughput</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9296A3] mb-1">Target Percentage (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="50"
                    max="99.999"
                    required
                    value={newSlo.targetPercent}
                    onChange={(e) => setNewSlo({ ...newSlo, targetPercent: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-[#030407] border border-[#272a33] text-white focus:outline-none"
                  />
                </div>

                {newSlo.sliType === 'latency' && (
                  <div>
                    <label className="block text-[#9296A3] mb-1">Latency Ceiling (ms)</label>
                    <input
                      type="number"
                      required
                      value={newSlo.latencyThresholdMs}
                      onChange={(e) => setNewSlo({ ...newSlo, latencyThresholdMs: e.target.value })}
                      className="w-full px-3 py-2 rounded bg-[#030407] border border-[#272a33] text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[#9296A3] mb-1">SLI Specification</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Percentage of HTTP requests responding with 200 OK within 150ms"
                  value={newSlo.sliDefinition}
                  onChange={(e) => setNewSlo({ ...newSlo, sliDefinition: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-[#030407] border border-[#272a33] text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272a33]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded bg-[#171920] text-[#9296A3] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded bg-[#d4ff24] text-[#030407] font-bold hover:bg-[#e1ff59]"
                >
                  {isSubmitting ? 'Creating...' : 'Save & Evaluate SLO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SLOsPage;
