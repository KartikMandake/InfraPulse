import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { EmptyState } from '../components/common/EmptyState';

export const FaultInjectionLabPage = () => {
  const { services, addToast } = useApp();
  const navigate = useNavigate();

  // Scenarios & form controls
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [targetServiceId, setTargetServiceId] = useState('payment-service');
  const [severity, setSeverity] = useState('critical');
  const [faultType, setFaultType] = useState('latency_spike');

  // Simulation state
  const [activeSimulation, setActiveSimulation] = useState(null);
  const [investigationResult, setInvestigationResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Cumulative benchmarks from this session's runs
  const [sessionBenchmarks, setSessionBenchmarks] = useState({
    runs: 0,
    top1Hits: 0,
    top3Hits: 0,
    totalDurationMs: 0
  });

  // Load scenarios on mount
  useEffect(() => {
    async function loadScenarios() {
      try {
        const res = await api.getFaultScenarios();
        if (res.success && res.data) {
          setScenarios(res.data);
          if (res.data.length > 0) {
            setSelectedScenarioId(res.data[0].id);
            setTargetServiceId(res.data[0].targetServiceId);
            setSeverity(res.data[0].defaultSeverity || 'critical');
            setFaultType(res.data[0].faultType || 'latency_spike');
          }
        }
      } catch (err) {
        console.error('Failed to load fault scenarios from backend:', err);
        setErrorMsg('Unable to connect to backend Fault Lab API. Ensure backend server is running on port 5000.');
      }
    }
    loadScenarios();
  }, []);

  // When a predefined scenario is picked from the catalog
  const handleSelectScenario = (sc) => {
    setSelectedScenarioId(sc.id);
    setTargetServiceId(sc.targetServiceId);
    setSeverity(sc.defaultSeverity || 'critical');
    setFaultType(sc.faultType);
  };

  // 1. Launch a Fault Simulation
  const handleStartSimulation = async () => {
    setIsSimulating(true);
    setErrorMsg(null);
    setInvestigationResult(null);

    try {
      const res = await api.createFaultSimulation({
        scenarioId: selectedScenarioId,
        targetServiceId,
        faultType,
        severity
      });

      if (res.success && res.data) {
        setActiveSimulation(res.data);
        addToast({
          type: 'warning',
          title: `Simulated Fault Injected [${res.data.faultType}]`,
          description: `Target ${res.data.targetServiceName} degraded. ${res.data.expectedDownstreamAffected.length} downstream caller(s) impacted.`
        });
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start fault simulation');
      addToast({
        type: 'error',
        title: 'Simulation Error',
        description: err.message
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // 2. Run Backend RCA Engine Investigation against the Simulated Telemetry
  const handleRunInvestigation = async () => {
    if (!activeSimulation) return;
    setIsInvestigating(true);
    setErrorMsg(null);

    try {
      const res = await api.investigateFaultSimulation(activeSimulation.simulationId);
      if (res.success && res.data) {
        setInvestigationResult(res.data);

        // Update benchmark tracker
        const evalData = res.data.evaluation;
        setSessionBenchmarks(prev => ({
          runs: prev.runs + 1,
          top1Hits: prev.top1Hits + (evalData.top1Accuracy ? 1 : 0),
          top3Hits: prev.top3Hits + (evalData.top3Accuracy ? 1 : 0),
          totalDurationMs: prev.totalDurationMs + evalData.investigationDurationMs
        }));

        addToast({
          type: evalData.top1Accuracy ? 'success' : 'info',
          title: `RCA Evaluation: ${evalData.status}`,
          description: `Top-1 Match: ${evalData.top1Accuracy ? 'Yes' : 'No'} (${evalData.investigationDurationMs}ms)`
        });
      }
    } catch (err) {
      setErrorMsg(err.message || 'Investigation run failed');
      addToast({
        type: 'error',
        title: 'Investigation Error',
        description: err.message
      });
    } finally {
      setIsInvestigating(false);
    }
  };

  // 3. Reset/Abort the Active Simulation
  const handleResetSimulation = async () => {
    if (!activeSimulation) return;
    setIsResetting(true);

    try {
      await api.resetFaultSimulation(activeSimulation.simulationId);
      setActiveSimulation(null);
      setInvestigationResult(null);
      addToast({
        type: 'info',
        title: 'Simulation Reset',
        description: 'Isolated test environment cleared. Ready for new scenario.'
      });
    } catch (err) {
      console.warn('Reset error (already cleaned):', err.message);
      setActiveSimulation(null);
      setInvestigationResult(null);
    } finally {
      setIsResetting(false);
    }
  };

  const top1Rate = sessionBenchmarks.runs > 0 
    ? Math.round((sessionBenchmarks.top1Hits / sessionBenchmarks.runs) * 100) 
    : 100;
  const top3Rate = sessionBenchmarks.runs > 0 
    ? Math.round((sessionBenchmarks.top3Hits / sessionBenchmarks.runs) * 100) 
    : 100;
  const avgDuration = sessionBenchmarks.runs > 0 
    ? Math.round(sessionBenchmarks.totalDurationMs / sessionBenchmarks.runs) 
    : 4;

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#d4ff24]">
            <span className="material-symbols-outlined text-[20px]">science</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-semibold tracking-tight">Fault Injection Lab & RCA Benchmark</h1>
              <span className="px-2 py-0.5 rounded bg-[#171920] border border-[#d4ff24] text-[#d4ff24] text-[10px] font-bold">
                PHASE 3 CONTROLLED BENCHMARK
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Inject deterministic fault scenarios into isolated mock telemetry, propagate downstream cascades, and validate backend RCA attribution accuracy.
            </p>
          </div>
        </div>

        {activeSimulation && (
          <button
            onClick={handleResetSimulation}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#93000a] text-[#ffdad6] text-xs font-bold hover:bg-[#b00010] transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">restart_alt</span>
            <span>{isResetting ? 'Resetting...' : 'Reset Simulation'}</span>
          </button>
        )}
      </div>

      {/* Error alert notice */}
      {errorMsg && (
        <div className="p-3 bg-[#93000a]/30 border border-[#ff5364]/60 rounded-xl text-xs text-[#ffdad6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-white hover:underline">Dismiss</button>
        </div>
      )}

      {/* Session Benchmark Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Top-1 Attribution Accuracy</div>
          <div className="text-2xl font-bold text-white my-1">{top1Rate}%</div>
          <div className="text-[10px] text-[#50d890]">{sessionBenchmarks.top1Hits} / {sessionBenchmarks.runs || 1} correct top-rank isolates</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Top-3 Candidate Accuracy</div>
          <div className="text-2xl font-bold text-[#d4ff24] my-1">{top3Rate}%</div>
          <div className="text-[10px] text-[#9296A3]">{sessionBenchmarks.top3Hits} / {sessionBenchmarks.runs || 1} in candidate rank</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Mean RCA Latency</div>
          <div className="text-2xl font-bold text-white my-1">{avgDuration}ms</div>
          <div className="text-[10px] text-[#50d890]">Deterministic heuristic execution</div>
        </div>

        <div className="p-3 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#9296A3]">Controlled Experiments</div>
          <div className="text-2xl font-bold text-white my-1">{sessionBenchmarks.runs}</div>
          <div className="text-[10px] text-[#b1c5ff]">Isolated in-memory test passes</div>
        </div>
      </div>

      {/* Control Panel & Active Simulation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Scenario Configurator (5 cols) */}
        <div className="lg:col-span-5 bg-[#101116] border border-[#272a33] rounded-xl p-4 flex flex-col gap-3 shadow-md text-xs">
          <h2 className="text-sm font-bold text-white uppercase pb-1 border-b border-[#272a33] flex items-center justify-between">
            <span>Experiment Parameters</span>
            <span className="text-[10px] text-[#9296A3] font-normal">Controlled Input</span>
          </h2>

          <div className="space-y-1">
            <label className="text-[#9296A3]">Predefined Scenario Preset</label>
            <select
              value={selectedScenarioId}
              onChange={(e) => {
                const sc = scenarios.find(s => s.id === e.target.value);
                if (sc) handleSelectScenario(sc);
                else setSelectedScenarioId(e.target.value);
              }}
              className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
            >
              {scenarios.map(sc => (
                <option key={sc.id} value={sc.id}>{sc.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[#9296A3]">Target Service</label>
              <select
                value={targetServiceId}
                onChange={(e) => setTargetServiceId(e.target.value)}
                className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.namespace})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[#9296A3]">Severity Tier</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
              >
                <option value="low">Low (0.5x)</option>
                <option value="medium">Medium (1.0x)</option>
                <option value="high">High (1.75x)</option>
                <option value="critical">Critical (2.5x)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[#9296A3]">Fault Archetype</label>
            <select
              value={faultType}
              onChange={(e) => setFaultType(e.target.value)}
              className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
            >
              <option value="latency_spike">Latency Spike</option>
              <option value="http_5xx_surge">Elevated HTTP 5xx Error Rate</option>
              <option value="service_unavailable">Service Unavailable (CrashLoop)</option>
              <option value="database_slowdown">Database Slowdown / Lockup</option>
              <option value="dependency_timeout">Dependency Client Timeout</option>
            </select>
          </div>

          <div className="pt-2 border-t border-[#272a33] flex items-center justify-between gap-2">
            <button
              onClick={handleStartSimulation}
              disabled={isSimulating}
              className="flex-1 py-2 rounded bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-all flex items-center justify-center gap-1.5 shadow disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-[16px] ${isSimulating ? 'animate-spin' : ''}`}>
                play_arrow
              </span>
              <span>{isSimulating ? 'Simulating Fault...' : 'Inject Fault Scenario'}</span>
            </button>
          </div>
        </div>

        {/* Live Simulation & Cascade Inspector (7 cols) */}
        <div className="lg:col-span-7 bg-[#101116] border border-[#272a33] rounded-xl p-4 flex flex-col gap-3 shadow-md text-xs">
          <h2 className="text-sm font-bold text-white uppercase pb-1 border-b border-[#272a33] flex items-center justify-between">
            <span>Simulation State & Telemetry Deltas</span>
            {activeSimulation && (
              <span className="text-[10px] text-[#50d890] font-bold">ACTIVE SIMULATION</span>
            )}
          </h2>

          {!activeSimulation ? (
            <EmptyState
              icon="science"
              title="No Active Fault Simulation"
              description="Select an archetype or preset scenario on the left, then click 'Inject Fault Scenario' to run an isolated benchmark."
            />
          ) : (
            <div className="space-y-3">
              {/* Target service delta card */}
              <div className="p-3 bg-[#030407] border border-[#ff5364]/50 rounded-lg flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#ff5364] animate-pulse" />
                    <span className="font-bold text-white text-sm">{activeSimulation.targetServiceName}</span>
                    <span className="px-1.5 py-0.2 rounded bg-[#93000a] text-[#ffdad6] text-[10px] font-bold uppercase">
                      INJECTED ROOT CAUSE
                    </span>
                  </div>
                  <span className="text-[10px] text-[#9296A3]">{activeSimulation.faultType}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[#272a33] text-[11px]">
                  <div>
                    <span className="text-[#9296A3] block text-[10px]">Baseline P99</span>
                    <span className="text-white font-bold">{activeSimulation.baselineMetrics.targetBaselineLatency}ms</span>
                  </div>
                  <div>
                    <span className="text-[#9296A3] block text-[10px]">Simulated P99</span>
                    <span className="text-[#ff5364] font-bold">{activeSimulation.baselineMetrics.simulatedLatency}ms</span>
                  </div>
                  <div>
                    <span className="text-[#9296A3] block text-[10px]">Baseline Error</span>
                    <span className="text-white font-bold">{activeSimulation.baselineMetrics.targetBaselineErrorRate}%</span>
                  </div>
                  <div>
                    <span className="text-[#9296A3] block text-[10px]">Simulated Error</span>
                    <span className="text-[#ff5364] font-bold">{activeSimulation.baselineMetrics.simulatedErrorRate}%</span>
                  </div>
                </div>
              </div>

              {/* Cascade downstream callers */}
              <div>
                <span className="text-[10px] uppercase text-[#9296A3] mb-1.5 block">
                  Topological Downstream Propagation ({activeSimulation.propagatedServices.length} callers impacted):
                </span>
                {activeSimulation.propagatedServices.length === 0 ? (
                  <div className="p-2.5 rounded bg-[#030407] border border-[#272a33] text-[#9296A3] text-[11px]">
                    No upstream callers directly depend on this service. Cascade confined to target.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeSimulation.propagatedServices.map(prop => (
                      <div key={prop.serviceId} className="p-2 rounded bg-[#030407] border border-[#ffb547]/40 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[15px] text-[#ffb547]">arrow_downward</span>
                          <span className="font-semibold text-white">{prop.serviceName}</span>
                          <span className="text-[10px] text-[#9296A3]">(Downstream caller)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-white">P99: <strong className="text-[#ffb547]">{prop.latencyP99}ms</strong></span>
                          <span className="text-white">Errors: <strong className="text-[#ffb547]">{prop.errorRate}%</strong></span>
                          <span className="px-1.5 py-0.2 rounded bg-[#ffb547]/20 text-[#ffb547] text-[10px] font-bold uppercase">{prop.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action trigger RCA button */}
              <div className="pt-2 border-t border-[#272a33] flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#9296A3]">
                  Ready to test RCA engine on this simulated anomaly dataset.
                </span>
                <button
                  onClick={handleRunInvestigation}
                  disabled={isInvestigating}
                  className="px-4 py-2 rounded bg-[#1558C9] text-white font-bold hover:bg-[#124ab0] transition-colors flex items-center gap-1.5 disabled:opacity-60"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isInvestigating ? 'animate-spin' : ''}`}>
                    troubleshoot
                  </span>
                  <span>{isInvestigating ? 'Running RCA Engine...' : 'Run RCA Engine on Simulation'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Investigation Results & Benchmark Evaluation Section */}
      {investigationResult && (
        <div className="p-4 bg-[#101116] border border-[#272a33] rounded-xl shadow-md flex flex-col gap-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#272a33] pb-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                investigationResult.evaluation.status === 'PASSED' ? 'bg-[#50d890]/20 text-[#50d890] border border-[#50d890]/40' :
                investigationResult.evaluation.status === 'PARTIAL' ? 'bg-[#ffb547]/20 text-[#ffb547]' : 'bg-[#93000a] text-[#ffdad6]'
              }`}>
                BENCHMARK EVALUATION: {investigationResult.evaluation.status}
              </span>
              <h3 className="text-sm font-bold text-white">Automated Attribution Verdict</h3>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#9296A3]">
              <span>RCA Latency: <strong className="text-white">{investigationResult.evaluation.investigationDurationMs}ms</strong></span>
              <span>•</span>
              <span>False Positives: <strong className="text-white">{investigationResult.evaluation.falsePositiveCount}</strong></span>
            </div>
          </div>

          {/* Verdict Summary Box */}
          <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <span className="text-[10px] text-[#9296A3] uppercase block">Injected Root Cause (Ground Truth)</span>
              <span className="text-white font-bold text-sm">{investigationResult.evaluation.expectedRootCauseServiceId}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#9296A3] uppercase block">RCA Top-1 Ranked Candidate</span>
              <span className={`font-bold text-sm ${investigationResult.evaluation.top1Accuracy ? 'text-[#50d890]' : 'text-[#ff5364]'}`}>
                {investigationResult.evaluation.topRankedCandidateId} (Score: {investigationResult.evaluation.topRankedCandidateScore})
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#9296A3] uppercase block">Validation Result</span>
              <span className={`font-bold text-sm ${investigationResult.evaluation.top1Accuracy ? 'text-[#50d890]' : 'text-[#ff5364]'}`}>
                {investigationResult.evaluation.top1Accuracy ? '✓ Top-1 Exact Match' : investigationResult.evaluation.top3Accuracy ? '✓ In Top-3 Candidates' : '✗ Missed Attribution'}
              </span>
            </div>
          </div>

          {/* Ranked Hypotheses list from backend RCA */}
          <div className="space-y-2 mt-1">
            <h4 className="font-bold text-white uppercase text-[11px]">
              Engine Hypotheses Rank ({investigationResult.hypotheses.length} evaluated):
            </h4>
            {investigationResult.hypotheses.map(hyp => {
              const isGroundTruth = hyp.candidateServiceId === investigationResult.evaluation.expectedRootCauseServiceId;
              return (
                <div
                  key={hyp.candidateServiceId}
                  className={`p-3 rounded-lg border flex flex-col gap-2 ${
                    isGroundTruth ? 'bg-[#171920] border-[#d4ff24]' : 'bg-[#030407] border-[#272a33]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        hyp.rank === 1 ? 'bg-[#d4ff24] text-[#030407]' : 'bg-[#22252e] text-[#9296A3]'
                      }`}>
                        #{hyp.rank}
                      </span>
                      <span className="font-bold text-white text-sm">{hyp.candidateServiceName}</span>
                      {isGroundTruth && (
                        <span className="px-1.5 py-0.2 rounded bg-[#d4ff24]/20 text-[#d4ff24] text-[10px] font-bold">
                          GROUND TRUTH TARGET
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#9296A3] text-[10px]">Score:</span>
                      <span className="text-base font-bold text-white">{hyp.score}</span>
                      <span className="text-[#5A5E6B] text-[10px]">/ 100</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#9296A3] leading-relaxed">
                    {hyp.summary}
                  </p>

                  {/* Supporting evidence chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {hyp.supportingEvidence?.map(ev => (
                      <span
                        key={ev.id}
                        className="px-2 py-0.5 rounded bg-[#101116] border border-[#272a33] text-[10px] text-[#b1c5ff]"
                      >
                        {ev.title} {ev.metricValue ? `(${ev.metricValue})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Catalog of Predefined Benchmark Scenarios */}
      <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md flex flex-col gap-2 text-xs">
        <h3 className="font-bold text-white uppercase pb-1 border-b border-[#272a33]">
          Predefined Benchmark Catalog ({scenarios.length} scenarios)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
          {scenarios.map(sc => (
            <div
              key={sc.id}
              onClick={() => handleSelectScenario(sc)}
              className={`p-3 rounded-lg border cursor-pointer flex flex-col justify-between gap-2 transition-colors ${
                selectedScenarioId === sc.id ? 'bg-[#171920] border-[#d4ff24]' : 'bg-[#030407] border-[#272a33] hover:border-[#3A3E4D]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-[#d4ff24] font-bold">{sc.faultType}</span>
                  <span className="text-[#9296A3] uppercase text-[10px]">{sc.defaultSeverity}</span>
                </div>
                <div className="font-bold text-white text-xs">{sc.title}</div>
                <p className="text-[11px] text-[#9296A3] mt-1">{sc.description}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#272a33] text-[10px] text-[#9296A3]">
                <span>Target: <strong className="text-white">{sc.targetServiceId}</strong></span>
                <span className="text-[#50d890]">Ground Truth</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
