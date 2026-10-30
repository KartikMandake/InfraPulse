import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import api from '../services/api.js';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { AiAssistantPanel } from '../components/investigation/AiAssistantPanel.jsx';

export const IncidentInvestigationPage = () => {
  const { incidentId } = useParams();
  const { 
    incidents, 
    rollbackCanary, 
    resolveIncident, 
    addToast 
  } = useApp();
  const navigate = useNavigate();

  // Navigation tab state: 'rca', 'investigation_graph', 'sequence_analysis'
  const [activeView, setActiveView] = useState('rca');

  const [investigationData, setInvestigationData] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [unifiedTimeline, setUnifiedTimeline] = useState(null);
  const [investigationGraph, setInvestigationGraph] = useState(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState(null);
  const [selectedGraphEdge, setSelectedGraphEdge] = useState(null);
  const [graphFilterService, setGraphFilterService] = useState('all');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSpan, setSelectedSpan] = useState(null);
  const [expandedHypothesisId, setExpandedHypothesisId] = useState(null);
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState(null);
  const [timelineFilterType, setTimelineFilterType] = useState('all');
  const [incidentDeliveries, setIncidentDeliveries] = useState([]);

  // Resolved incident target
  const targetIncidentId = incidentId || 'INC-4921';
  const localIncident = incidents.find(i => i.id === targetIncidentId) || incidents[0];

  // Fetch investigation report, unified timeline, graph, and notification deliveries
  const loadInvestigation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [invRes, timeRes, notifRes, uniTimeRes, graphRes] = await Promise.allSettled([
        api.getInvestigation(targetIncidentId),
        api.getIncidentTimeline(targetIncidentId),
        api.getNotifications({ incidentId: targetIncidentId }),
        api.getIncidentUnifiedTimeline(targetIncidentId),
        api.getIncidentInvestigationGraph(targetIncidentId)
      ]);

      if (invRes.status === 'fulfilled' && invRes.value?.data) {
        setInvestigationData(invRes.value.data);
        if (invRes.value.data.hypotheses && invRes.value.data.hypotheses.length > 0) {
          setExpandedHypothesisId(invRes.value.data.hypotheses[0].candidateServiceId);
        }
        if (invRes.value.data.correlatedTraces && invRes.value.data.correlatedTraces.length > 0) {
          setSelectedSpan(invRes.value.data.correlatedTraces[0]);
        }
      } else if (invRes.status === 'rejected') {
        throw invRes.reason;
      }

      if (timeRes.status === 'fulfilled' && timeRes.value?.data) {
        setTimelineData(timeRes.value.data);
      }

      if (notifRes.status === 'fulfilled' && notifRes.value?.data) {
        setIncidentDeliveries(notifRes.value.data);
      }

      if (uniTimeRes.status === 'fulfilled' && uniTimeRes.value?.data) {
        setUnifiedTimeline(uniTimeRes.value.data);
      }

      if (graphRes.status === 'fulfilled' && graphRes.value?.data) {
        setInvestigationGraph(graphRes.value.data);
      }
    } catch (err) {
      console.error('[Investigation Fetch Error]:', err);
      setError(err.message || 'Failed to communicate with RCA Engine on backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvestigation();
  }, [targetIncidentId]);

  // Execute fresh analysis on the backend via POST /api/incidents/:incidentId/investigation/run
  const handleRerun = async () => {
    setIsRefreshing(true);
    try {
      const [res, timeRes, uniTimeRes, graphRes] = await Promise.allSettled([
        api.runInvestigation(targetIncidentId),
        api.getIncidentTimeline(targetIncidentId),
        api.getIncidentUnifiedTimeline(targetIncidentId),
        api.getIncidentInvestigationGraph(targetIncidentId)
      ]);

      if (res.status === 'fulfilled' && res.value?.data) {
        setInvestigationData(res.value.data);
        if (res.value.data.hypotheses && res.value.data.hypotheses.length > 0) {
          setExpandedHypothesisId(res.value.data.hypotheses[0].candidateServiceId);
        }
      }
      if (timeRes.status === 'fulfilled' && timeRes.value?.data) {
        setTimelineData(timeRes.value.data);
      }
      if (uniTimeRes.status === 'fulfilled' && uniTimeRes.value?.data) {
        setUnifiedTimeline(uniTimeRes.value.data);
      }
      if (graphRes.status === 'fulfilled' && graphRes.value?.data) {
        setInvestigationGraph(graphRes.value.data);
      }

      addToast({
        type: 'success',
        title: 'Unified Correlation & RCA Refreshed',
        description: 'Evaluated cross-source events, dependency graph, and hypotheses.'
      });
    } catch (err) {
      console.error('[Rerun Error]:', err);
      addToast({
        type: 'error',
        title: 'Investigation Run Failed',
        description: err.message
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!localIncident && !isLoading && !investigationData) {
    return (
      <div className="py-12">
        <EmptyState
          icon="emergency"
          title="Incident Not Found"
          description={`Incident "${targetIncidentId}" could not be located in active or archived records.`}
          actionText="Back to Incidents Center"
          onAction={() => navigate('/incidents')}
        />
      </div>
    );
  }

  const activeIncident = investigationData?.incident || localIncident;
  const hypotheses = investigationData?.hypotheses || [];
  const traces = investigationData?.correlatedTraces || [];
  
  // Choose canonical timeline events if available, otherwise fallback
  const timelineEvents = unifiedTimeline?.timeline || timelineData?.events || [];

  // Filter unified timeline events
  const filteredEvents = timelineEvents.filter(evt => {
    if (timelineFilterType !== 'all') {
      const type = evt.eventType || evt.type;
      if (type !== timelineFilterType && evt.phase !== timelineFilterType) return false;
    }
    return true;
  });

  const selectedEvent = timelineEvents.find(e => (e.eventId || e.id) === selectedTimelineEventId);
  const topologyCorrelation = timelineData?.topologyCorrelation;

  // Filter graph nodes
  const graphNodes = (investigationGraph?.nodes || []).filter(n => {
    if (graphFilterService !== 'all' && n.serviceId && n.serviceId !== graphFilterService) return false;
    return true;
  });

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => navigate('/incidents')}
            className="flex items-center gap-1 text-[#9296A3] hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            <span>All Incidents</span>
          </button>
          <span className="text-[#5A5E6B]">/</span>
          <span className="text-[#ff5364] font-bold">{activeIncident.id}</span>
          <span className="text-[#5A5E6B]">/</span>
          <button
            onClick={() => navigate(`/services/${activeIncident.serviceId}`)}
            className="text-[#b1c5ff] hover:underline"
          >
            {activeIncident.serviceName}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/runbooks')}
            className="px-3 py-1.5 rounded bg-[#171920] border border-[#d4ff24]/40 text-[#d4ff24] text-xs font-bold hover:bg-[#171920]/80 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-[15px]">terminal</span>
            <span>Runbook Orchestration</span>
          </button>

          <button
            onClick={handleRerun}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded bg-[#1558C9] hover:bg-[#1558C9]/80 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[15px] ${isRefreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{isRefreshing ? 'Correlating...' : 'Re-Run Unified Correlation'}</span>
          </button>
        </div>
      </div>

      {/* Incident Header Hero Card */}
      <div className="p-4 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5 text-xs">
              <span className="text-[#ff5364] font-bold">{activeIncident.id}</span>
              <span className="text-[#5A5E6B]">•</span>
              <span className="text-[#9296A3]">{activeIncident.serviceName}</span>
              <span className="text-[#5A5E6B]">•</span>
              <span className="text-[#d4ff24] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff24]"></span>
                {hypotheses.length > 0 
                  ? `Deterministic RCA confidence: ${hypotheses[0].score}%` 
                  : 'Awaiting telemetry evaluation'}
              </span>
            </div>

            <h1 className="text-xl font-bold text-white tracking-tight">{activeIncident.title}</h1>
            <p className="text-xs text-[#9296A3] mt-2 leading-relaxed max-w-4xl">{activeIncident.summary}</p>

            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-[#9296A3]">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-[#5A5E6B]">person</span>
                <span>Commander: <strong className="text-white">{activeIncident.lead}</strong> ({activeIncident.leadRole})</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-[#5A5E6B]">forum</span>
                <span>Room: <strong className="text-[#b1c5ff] hover:underline cursor-pointer">{activeIncident.channel}</strong></span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-[#5A5E6B]">schedule</span>
                <span>Declared: <strong className="text-white">{activeIncident.startedAt}</strong></span>
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={() => navigate('/reports')}
              className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e] text-xs flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">description</span>
              <span>Export Postmortem Draft</span>
            </button>
            <span className="text-[10px] text-[#5A5E6B]">REST: /api/incidents/{activeIncident.id}/investigation-graph</span>
          </div>
        </div>
      </div>

      {/* View Switcher Sub-Tabs */}
      <div className="flex items-center gap-1 bg-[#101116] border border-[#272a33] rounded-xl p-1 overflow-x-auto text-xs">
        {[
          { id: 'rca', label: 'Deterministic Root-Cause Analysis', icon: 'psychology' },
          { id: 'investigation_graph', label: 'Unified Investigation Graph', icon: 'hub' },
          { id: 'sequence_analysis', label: 'Causal Sequence & Propagation', icon: 'route' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
              activeView === tab.id
                ? 'bg-[#1558c9] text-white shadow-sm'
                : 'text-[#9296A3] hover:text-white hover:bg-[#171920]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* VIEW 1: Deterministic RCA (Original Left Column + AI Assistant) */}
      {activeView === 'rca' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Left Column: Ranked Candidates (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="bg-[#101116] border border-[#272a33] p-4 rounded-xl shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-[#272a33] pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-[#d4ff24]">psychology</span>
                  <h3 className="text-sm font-bold text-white">Ranked Root-Cause Hypotheses</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#9296A3]">
                    {hypotheses.length} Candidate{hypotheses.length === 1 ? '' : 's'} Evaluated
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#171920] border border-[#272a33] text-[10px] text-[#d4ff24] font-bold">
                    Authoritative Deterministic Engine
                  </span>
                </div>
              </div>

              {/* Candidates List */}
              <div className="space-y-3 mt-1">
                {hypotheses.map(hypo => {
                  const isExpanded = expandedHypothesisId === hypo.candidateServiceId;
                  const isTopRanked = hypo.rank === 1;

                  return (
                    <div
                      key={hypo.candidateServiceId}
                      className={`rounded-xl border transition-all ${
                        isTopRanked
                          ? 'bg-[#171920] border-[#d4ff24]/80 shadow-[0_0_12px_rgba(212,255,36,0.12)]'
                          : 'bg-[#101116] border-[#272a33] hover:border-[#3A3E4D]'
                      }`}
                    >
                      <div className="p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isTopRanked ? 'bg-[#d4ff24] text-[#030407]' : 'bg-[#272a33] text-white'
                            }`}>
                              #{hypo.rank}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-white">{hypo.candidateServiceName}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#030407] text-[#9296A3] border border-[#272a33]">
                                  {hypo.causalRole}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] uppercase text-[#9296A3] font-mono">Attribution Score</div>
                            <div className={`text-xl font-bold font-mono ${isTopRanked ? 'text-[#d4ff24]' : 'text-white'}`}>
                              {hypo.score}<span className="text-xs text-[#9296A3] font-normal">/100</span>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-[#e2e2e9] leading-relaxed bg-[#030407] p-2.5 rounded border border-[#272a33]">
                          {hypo.summary}
                        </p>

                        <div className="flex items-center justify-between pt-1 border-t border-[#272a33]">
                          <button
                            onClick={() => setExpandedHypothesisId(isExpanded ? null : hypo.candidateServiceId)}
                            className="text-xs text-[#b1c5ff] hover:underline flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                            <span>
                              {isExpanded ? 'Hide' : 'Inspect'} Evidence ({hypo.supportingEvidence?.length || 0} signals)
                            </span>
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 bg-[#030407] border-t border-[#272a33] rounded-b-xl space-y-1.5 text-xs">
                          {(hypo.supportingEvidence || []).map(ev => (
                            <div key={ev.id} className="p-2 rounded bg-[#101116] border border-[#272a33] flex items-center justify-between text-xs">
                              <div>
                                <strong className="text-white">{ev.title}</strong>
                                <p className="text-[11px] text-[#9296A3]">{ev.description}</p>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[#171920] text-[#d4ff24] font-mono">
                                {ev.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Assistant */}
            <AiAssistantPanel
              incidentId={targetIncidentId}
              topHypothesis={hypotheses[0] || null}
              onSelectEvidence={(evId) => {
                addToast({
                  type: 'info',
                  title: 'Evidence Referenced',
                  description: `Evidence #${evId} identified in candidate attribution.`
                });
              }}
            />
          </div>

          {/* Right Column: Unified Interactive Event Timeline (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="bg-[#101116] border border-[#272a33] p-3 rounded-xl shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between pb-2 border-b border-[#272a33]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#d4ff24]">timeline</span>
                  <h3 className="text-xs font-bold text-white uppercase">Unified Event Timeline</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#171920] text-[#d4ff24] font-mono">
                  {filteredEvents.length} Events
                </span>
              </div>

              {/* Event Filter Pills */}
              <div className="flex flex-wrap items-center gap-1 text-[10px] pb-1 border-b border-[#272a33]">
                {['all', 'pre_incident_signal', 'deployment_change', 'alert_generation', 'incident_declaration', 'runbook_execution'].map(ft => (
                  <button
                    key={ft}
                    onClick={() => setTimelineFilterType(ft)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      timelineFilterType === ft 
                        ? 'bg-[#1558C9] text-white font-bold' 
                        : 'bg-[#030407] text-[#9296A3] border border-[#272a33] hover:text-white'
                    }`}
                  >
                    {ft === 'all' ? 'All' : ft.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Timeline Stream */}
              <div className="space-y-2 mt-1 max-h-[540px] overflow-y-auto pr-1">
                {filteredEvents.map((evt) => {
                  const evtId = evt.eventId || evt.id;
                  const isSelected = selectedTimelineEventId === evtId;

                  return (
                    <div
                      key={evtId}
                      onClick={() => setSelectedTimelineEventId(isSelected ? null : evtId)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-[#171920] border-[#d4ff24] shadow-[0_0_10px_rgba(212,255,36,0.15)] ring-1 ring-[#d4ff24]'
                          : 'bg-[#030407] border-[#272a33] hover:border-[#3A3E4D]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            evt.severity === 'critical' ? 'bg-[#ff5364]' :
                            (evt.eventType || evt.type) === 'deployment_change' ? 'bg-[#d4ff24]' :
                            evt.severity === 'high' ? 'bg-[#ffb547]' : 'bg-[#50d890]'
                          }`} />
                          <span className="font-bold text-white truncate max-w-[200px]">{evt.title}</span>
                        </div>
                        <span className="text-[10px] text-[#5A5E6B] font-mono shrink-0">
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : evt.time}
                        </span>
                      </div>

                      <p className="text-[10px] text-[#9296A3] leading-relaxed line-clamp-2">
                        {evt.summary || evt.description}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[9px] text-[#5A5E6B] pt-1 border-t border-[#272a33]/60">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#b1c5ff] font-semibold">{evt.serviceName}</span>
                          <span>•</span>
                          <span className="capitalize">{evt.eventType || evt.type}</span>
                        </div>
                        <span className={`px-1.5 py-0.2 rounded font-bold ${
                          evt.telemetryMode === 'live' ? 'bg-[#50d890]/20 text-[#50d890]' : 'bg-[#171920] text-[#9296A3]'
                        }`}>
                          {evt.telemetryMode === 'live' ? 'LIVE' : 'SIMULATED'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Event Detail */}
              {selectedEvent && (
                <div className="p-3 bg-[#030407] border border-[#d4ff24] rounded-lg mt-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between border-b border-[#272a33] pb-1">
                    <span className="text-[10px] font-bold text-[#d4ff24] uppercase">Event Details</span>
                    <button onClick={() => setSelectedTimelineEventId(null)} className="text-[#9296A3] hover:text-white">✕</button>
                  </div>
                  <div className="font-bold text-white">{selectedEvent.title}</div>
                  <p className="text-[11px] text-[#e2e2e9] leading-relaxed">{selectedEvent.summary || selectedEvent.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Unified Investigation Graph */}
      {activeView === 'investigation_graph' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#272a33] pb-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1558C9] text-[18px]">hub</span>
                Multi-Modal Investigation Graph
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Unified topological and correlation graph connecting services, deployments, alerts, metric anomalies, and RCA hypotheses.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <select
                value={graphFilterService}
                onChange={(e) => setGraphFilterService(e.target.value)}
                className="bg-[#171920] border border-[#272a33] rounded-lg px-2.5 py-1 text-white text-xs"
              >
                <option value="all">All Services</option>
                <option value="payment-service">payment-service (Core Target)</option>
                <option value="checkout-api">checkout-api (Downstream)</option>
                <option value="auth-gateway-v2">auth-gateway-v2 (Edge)</option>
              </select>
            </div>
          </div>

          {/* Graph KPI Summary */}
          {investigationGraph?.correlationSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                <div className="text-[10px] text-[#9296A3] uppercase">Correlated Nodes</div>
                <div className="text-xl font-bold text-white mt-1">{investigationGraph.nodesCount} Nodes</div>
                <div className="text-[10px] text-[#50d890]">Across 5 source systems</div>
              </div>

              <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                <div className="text-[10px] text-[#9296A3] uppercase">Correlation Edges</div>
                <div className="text-xl font-bold text-[#b1c5ff] mt-1">{investigationGraph.edgesCount} Edges</div>
                <div className="text-[10px] text-[#9296A3]">Topology + Telemetry</div>
              </div>

              <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                <div className="text-[10px] text-[#9296A3] uppercase">Earliest Signal</div>
                <div className="text-sm font-bold text-[#d4ff24] mt-1 truncate">
                  {investigationGraph.correlationSummary.earliestObservedSignal?.title || 'Canary Deploy'}
                </div>
                <div className="text-[10px] text-[#5A5E6B]">
                  {investigationGraph.correlationSummary.earliestObservedSignal?.timestamp
                    ? new Date(investigationGraph.correlationSummary.earliestObservedSignal.timestamp).toLocaleTimeString()
                    : 'N/A'}
                </div>
              </div>

              <div className="p-3 bg-[#171920] border border-[#272a33] rounded-lg">
                <div className="text-[10px] text-[#9296A3] uppercase">Correlation Confidence</div>
                <div className="text-xl font-bold text-[#50d890] mt-1">HIGH</div>
                <div className="text-[10px] text-[#5A5E6B]">Trace & Topology Verified</div>
              </div>
            </div>
          )}

          {/* Graph Visualization Container */}
          <div className="p-4 bg-[#030407] border border-[#272a33] rounded-xl space-y-4">
            <div className="text-xs font-bold text-white uppercase flex items-center justify-between border-b border-[#272a33] pb-2">
              <span>Graph Node Map ({graphNodes.length} Active Nodes)</span>
              <div className="flex items-center gap-3 text-[10px] text-[#9296A3]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1558C9]"></span> Service</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ff5364]"></span> Incident</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d4ff24]"></span> Deployment</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ffb547]"></span> Alert / Anomaly</span>
              </div>
            </div>

            {/* Interactive Nodes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
              {graphNodes.map(node => {
                const isSelected = selectedGraphNode?.id === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => {
                      setSelectedGraphNode(isSelected ? null : node);
                      setSelectedGraphEdge(null);
                    }}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#171920] border-[#d4ff24] ring-1 ring-[#d4ff24]'
                        : 'bg-[#101116] border-[#272a33] hover:border-[#3A3E4D]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                        node.category === 'service' ? 'bg-[#1558C9]/30 text-[#b1c5ff]' :
                        node.category === 'incident' ? 'bg-[#ff5364]/20 text-[#ff5364]' :
                        node.category === 'deployment_change' ? 'bg-[#d4ff24]/20 text-[#d4ff24]' : 'bg-[#e2a03f]/20 text-[#e2a03f]'
                      }`}>
                        {node.category.replace('_', ' ')}
                      </span>
                      <span className="text-[#5A5E6B] font-mono text-[9px]">{node.id.slice(0, 10)}</span>
                    </div>
                    <div className="font-bold text-white truncate text-xs">{node.label}</div>
                    <div className="text-[10px] text-[#9296A3] mt-1 truncate">
                      {node.serviceId || 'System'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Node / Edge Details Panel */}
            {selectedGraphNode && (
              <div className="p-3 bg-[#101116] border border-[#d4ff24] rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-[#272a33] pb-1">
                  <span className="text-[10px] font-bold text-[#d4ff24] uppercase">Selected Graph Entity</span>
                  <button onClick={() => setSelectedGraphNode(null)} className="text-[#9296A3] hover:text-white">✕</button>
                </div>
                <div className="font-bold text-white text-sm">{selectedGraphNode.label}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-[#9296A3] pt-1">
                  <div>Category: <strong className="text-white">{selectedGraphNode.category}</strong></div>
                  <div>Service: <strong className="text-[#b1c5ff]">{selectedGraphNode.serviceId || 'Global'}</strong></div>
                  <div>Severity: <strong className="text-[#ff5364]">{selectedGraphNode.severity}</strong></div>
                  <div>Telemetry: <strong className="text-[#d4ff24]">{selectedGraphNode.telemetryMode}</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: Causal Sequence Analysis */}
      {activeView === 'sequence_analysis' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md space-y-4">
          <div className="border-b border-[#272a33] pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-[#d4ff24] text-[18px]">route</span>
                Causal Sequence & Incident Propagation
              </h2>
              <p className="text-[11px] text-[#9296A3] mt-1">
                Objective chronological timeline identifying earliest observed signal, cross-service failure propagation, and recovery checkpoints.
              </p>
            </div>
          </div>

          {unifiedTimeline?.sequenceAnalysis && (
            <div className="space-y-4 text-xs">
              {/* Earliest Observed Signal Card */}
              {unifiedTimeline.sequenceAnalysis.earliestObservedSignal && (
                <div className="p-4 bg-[#171920] border border-[#d4ff24]/60 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#d4ff24]">Earliest Observed Anomaly Signal</span>
                    <div className="text-base font-bold text-white mt-1">
                      {unifiedTimeline.sequenceAnalysis.earliestObservedSignal.title}
                    </div>
                    <div className="text-xs text-[#9296A3] mt-0.5">
                      Service: <strong className="text-white">{unifiedTimeline.sequenceAnalysis.earliestObservedSignal.serviceId}</strong> • Timestamp: {new Date(unifiedTimeline.sequenceAnalysis.earliestObservedSignal.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded bg-[#d4ff24]/20 border border-[#d4ff24]/40 text-[#d4ff24] font-bold text-xs uppercase">
                    Root Trigger Candidate
                  </span>
                </div>
              )}

              {/* Propagation Sequence */}
              <div className="p-4 bg-[#030407] border border-[#272a33] rounded-xl space-y-3">
                <div className="text-xs font-bold text-white uppercase flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#ff5364]">east</span>
                  Observed Service Propagation Order
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {unifiedTimeline.sequenceAnalysis.potentialPropagationSequence?.map((svcId, idx) => (
                    <React.Fragment key={svcId}>
                      <div className="px-3 py-2 rounded-lg bg-[#101116] border border-[#272a33] text-center">
                        <span className="text-[9px] text-[#9296A3] uppercase block">Step #{idx + 1}</span>
                        <span className="font-bold text-white text-xs">{svcId}</span>
                      </div>
                      {idx < unifiedTimeline.sequenceAnalysis.potentialPropagationSequence.length - 1 && (
                        <span className="material-symbols-outlined text-[#ff5364] text-lg">arrow_forward</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IncidentInvestigationPage;
