import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api.js';
import {useAuth} from './AuthContext.jsx';
import { 
  INITIAL_SERVICES, INITIAL_INCIDENTS, INITIAL_ALERTS, 
  INITIAL_DEPLOYMENTS, INITIAL_SLOS, INITIAL_RUNBOOKS, 
  INITIAL_CHAOS_EXPERIMENTS, INITIAL_POSTMORTEMS, INITIAL_INTEGRATIONS,
  INITIAL_TELEMETRY_LOGS 
} from '../data/mockData.js';

const AppContext = createContext(undefined);

export const AppProvider = ({ children }) => {
  const {user}=useAuth();
  const [services, setServices] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [slos, setSlos] = useState(INITIAL_SLOS);
  const [runbooks, setRunbooks] = useState(INITIAL_RUNBOOKS);
  const [chaosExperiments, setChaosExperiments] = useState(INITIAL_CHAOS_EXPERIMENTS);
  const [postmortems, setPostmortems] = useState(INITIAL_POSTMORTEMS);
  const [integrations, setIntegrations] = useState(INITIAL_INTEGRATIONS);
  const [telemetryLogs, setTelemetryLogs] = useState(INITIAL_TELEMETRY_LOGS);

  const [cluster, setCluster] = useState('prod-k8s-mesh');
  const [environment, setEnvironment] = useState('Production');
  const [region, setRegion] = useState('prod-us-east-1');
  const [timeRange, setTimeRange] = useState('15m');
  
  const [isAiHypothesisOpen, setIsAiHypothesisOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendError,setBackendError]=useState(null);

  // Initial load from backend API
  useEffect(() => {
    let active=true;
    async function loadBackendData() {
      if(!user){setServices([]);setIncidents([]);setAlerts([]);setDeployments([]);setBackendConnected(false);setBackendError(null);return;}
      try {
        setServices([]);setIncidents([]);setAlerts([]);setDeployments([]);setBackendConnected(false);
        const [srvRes, incRes, altRes, depRes, telRes] = await Promise.allSettled([
          api.getServices(),
          api.getIncidents(),
          api.getAlerts(),
          api.getDeployments(),
          api.getTelemetry()
        ]);
        if(!active)return;
        const rejected=[srvRes,incRes,altRes,depRes,telRes].find(result=>result.status==='rejected');
        setBackendError(rejected?'Some live data could not be loaded. Retry when the API is available.':null);

        if (srvRes.status === 'fulfilled' && srvRes.value?.data) {
          setServices(srvRes.value.data);
          setBackendConnected(true);
        }
        if (incRes.status === 'fulfilled' && incRes.value?.data) {
          setIncidents(incRes.value.data);
        }
        if (altRes.status === 'fulfilled' && altRes.value?.data) {
          setAlerts(altRes.value.data);
        }
        if (depRes.status === 'fulfilled' && depRes.value?.data) {
          setDeployments(depRes.value.data);
        }
        if (telRes.status === 'fulfilled' && telRes.value?.data?.logs) {
          setTelemetryLogs(telRes.value.data.logs);
        }
      } catch (e) {
        console.warn('[InfraPulse App] Backend initialization fallback to mock seed:', e.message);
      }
    }

    loadBackendData();
    return ()=>{active=false;};
  }, [user?.id]);

  // Global ⌘K Shortcut Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addToast = (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast = { id, ...toast };
    setToasts(prev => [...prev.slice(-4), newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const getServiceById = (id) => services.find(s => s.id === id);
  const getIncidentById = (id) => incidents.find(i => i.id === id);

  const resolveIncident = async (incidentId) => {
    setIncidents(prev => prev.map(i => {
      if (i.id === incidentId) {
        return {
          ...i,
          status: 'resolved',
          sloBreached: false,
          dropRatePercent: 0.0,
          timeline: [
            ...i.timeline,
            { time: new Date().toISOString().substring(11, 19) + ' UTC', title: 'Incident Resolved', description: 'Remediation completed and verified.', source: 'engineer_action', isKeyMilestone: true }
          ]
        };
      }
      return i;
    }));

    try {
      await api.updateIncident(incidentId, { status: 'resolved', sloBreached: false, dropRatePercent: 0.0 });
    } catch (e) {
      console.warn('Backend update deferred:', e.message);
    }

    addToast({
      type: 'success',
      title: `Incident ${incidentId} Resolved`,
      description: 'Traffic restored to nominal operating parameters.'
    });
  };

  const mitigateIncident = async (incidentId) => {
    setIncidents(prev => prev.map(i => {
      if (i.id === incidentId) {
        return {
          ...i,
          status: 'mitigating',
          dropRatePercent: 0.25,
          timeline: [
            ...i.timeline,
            { time: new Date().toISOString().substring(11, 19) + ' UTC', title: 'Mitigation Applied', description: 'Canary drained and pool limit expanded.', source: 'engineer_action' }
          ]
        };
      }
      return i;
    }));

    try {
      await api.updateIncident(incidentId, { status: 'mitigating', dropRatePercent: 0.25 });
    } catch (e) {
      console.warn('Backend update deferred:', e.message);
    }

    addToast({
      type: 'info',
      title: `Incident ${incidentId} Mitigating`,
      description: 'Mitigation controls applied. Monitoring burn rate stabilization.'
    });
  };

  const createManualIncident = async (incidentData) => {
    let created = null;
    try {
      const res = await api.createIncident(incidentData);
      if (res?.data) created = res.data;
    } catch (e) {
      console.warn('Backend creation fallback:', e.message);
    }

    if (!created) {
      created = {
        id: incidentData.id || `INC-${Math.floor(1000 + Math.random() * 9000)}`,
        title: incidentData.title || 'Untitled Incident',
        summary: incidentData.summary || 'Incident declared manually.',
        severity: incidentData.severity || 'SEV-2',
        status: incidentData.status || 'investigating',
        serviceId: incidentData.serviceId || 'payment-service',
        serviceName: incidentData.serviceName || 'payment-service',
        lead: 'On-Call SRE',
        leadRole: 'Incident Commander',
        channel: `#inc-${Math.floor(1000 + Math.random() * 9000)}`,
        startedAt: new Date().toISOString().substring(11, 19) + ' UTC',
        durationMinutes: 1,
        dropRatePercent: 0.5,
        estimatedCostPerMin: 1200,
        sloBreached: true,
        sloCurrent: 98.5,
        sloTarget: 99.9,
        aiConfidencePercent: 75,
        aiHypothesis: 'Telemetry signals under evaluation.',
        aiRemediationRecommendation: 'Monitor metrics and verify health.',
        timeline: [
          { time: new Date().toISOString().substring(11, 19) + ' UTC', title: 'Incident Declared', description: 'Manual incident declaration.', source: 'engineer_action' }
        ]
      };
    }

    setIncidents(prev => [created, ...prev]);
    addToast({
      type: 'warning',
      title: `Incident ${created.id} Declared`,
      description: `Active triage channel opened for ${created.serviceName}.`
    });
  };

  const rollbackCanary = async (deploymentId) => {
    setDeployments(prev => prev.map(d => {
      if (d.id === deploymentId) {
        return {
          ...d,
          status: 'rolled_back',
          canaryTrafficPercent: 0,
          p99CanaryVsStable: { canary: d.p99CanaryVsStable.stable, stable: d.p99CanaryVsStable.stable },
          errorRateCanaryVsStable: { canary: 0.01, stable: 0.01 }
        };
      }
      return d;
    }));

    setServices(prev => prev.map(s => {
      if (s.id === 'payment-service') {
        return {
          ...s,
          status: 'nominal',
          latencyP99: 26,
          errorRate: 0.02,
          pods: s.pods.map(p => p.id === 'pod-pay-canary' ? { ...p, status: 'Terminating' } : p)
        };
      }
      return s;
    }));

    try {
      await api.updateDeployment(deploymentId, { status: 'rolled_back', canaryTrafficPercent: 0 });
      await api.updateService('payment-service', { status: 'nominal', latencyP99: 26, errorRate: 0.02 });
    } catch (e) {
      console.warn('Backend rollback sync deferred:', e.message);
    }

    addToast({
      type: 'success',
      title: 'Canary Rollback Executed',
      description: 'Traffic shifted 100% to stable-9c12. Pod canary-88a2 terminating.'
    });
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      const res = await api.acknowledgeAlert(alertId);
      if (res?.data) {
        setAlerts(prev => prev.map(a => a.id === alertId ? res.data : a));
      } else {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, state: 'acknowledged', status: 'acknowledged' } : a));
      }
      addToast({
        type: 'info',
        title: `Alert ${alertId} Acknowledged`,
        description: 'Assigned to current triage responder.'
      });
    } catch (e) {
      console.warn('Backend alert ack fallback:', e.message);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, state: 'acknowledged', status: 'acknowledged' } : a));
      addToast({
        type: 'info',
        title: `Alert ${alertId} Acknowledged (Local)`,
        description: 'Assigned to current triage responder.'
      });
    }
  };

  const resolveAlert = async (alertId) => {
    try {
      const res = await api.resolveAlert(alertId);
      if (res?.data) {
        setAlerts(prev => prev.map(a => a.id === alertId ? res.data : a));
      } else {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, state: 'resolved', status: 'resolved' } : a));
      }
      addToast({
        type: 'success',
        title: `Alert ${alertId} Resolved`,
        description: 'Threshold returned within bounds.'
      });
    } catch (e) {
      console.warn('Backend alert resolve fallback:', e.message);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, state: 'resolved', status: 'resolved' } : a));
      addToast({
        type: 'success',
        title: `Alert ${alertId} Resolved (Local)`,
        description: 'Threshold returned within bounds.'
      });
    }
  };

  const evaluateAlerts = async (payload = { mode: 'mock' }) => {
    try {
      const res = await api.evaluateAlerts(payload);
      if (res?.alerts) {
        setAlerts(res.alerts);
      }
      const incRes = await api.getIncidents();
      if (incRes?.data) {
        setIncidents(incRes.data);
      }
      addToast({
        type: 'success',
        title: 'Alert Evaluation Completed',
        description: `Evaluated ${res?.report?.rulesEvaluated || 0} rules: ${res?.report?.alertsCreated?.length || 0} created, ${res?.report?.alertsDeduplicated?.length || 0} deduplicated.`
      });
      return res?.report;
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Alert Evaluation Failed',
        description: e.message
      });
      throw e;
    }
  };

  const silenceAlert = async (alertId, duration = '2h remaining') => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, state: 'silenced', silenceDuration: duration } : a));
    try {
      await api.updateAlert(alertId, { state: 'silenced', silenceDuration: duration });
    } catch (e) {
      console.warn('Backend alert silence deferred:', e.message);
    }
    addToast({
      type: 'info',
      title: `Alert ${alertId} Silenced`,
      description: `Suppressed for ${duration}.`
    });
  };

  const executeRunbookStep = (runbookId, stepId) => {
    setRunbooks(prev => prev.map(rb => {
      if (rb.id !== runbookId) return rb;
      return {
        ...rb,
        steps: rb.steps.map(st => {
          if (st.id === stepId) {
            return {
              ...st,
              status: 'success',
              output: `[Execution OK] Command "${st.command}" completed cleanly (exit: 0, 312ms).`
            };
          }
          return st;
        })
      };
    }));
    addToast({
      type: 'success',
      title: `Step ${stepId} Executed`,
      description: `Runbook ${runbookId} command dispatched.`
    });
  };

  const resetRunbook = (runbookId) => {
    setRunbooks(prev => prev.map(rb => {
      if (rb.id !== runbookId) return rb;
      return {
        ...rb,
        steps: rb.steps.map(st => ({ ...st, status: 'idle', output: undefined }))
      };
    }));
    addToast({
      type: 'info',
      title: `Runbook ${runbookId} Reset`,
      description: 'All steps restored to idle state.'
    });
  };

  const startChaosExperiment = (experimentId) => {
    setChaosExperiments(prev => prev.map(exp => exp.id === experimentId ? { ...exp, status: 'active', elapsedSeconds: 1 } : exp));
    const exp = chaosExperiments.find(e => e.id === experimentId);
    if (exp?.targetServiceId) {
      setServices(prev => prev.map(s => {
        if (s.id === exp.targetServiceId) {
          return { ...s, status: 'critical', latencyP99: 450, errorRate: 5.2 };
        }
        return s;
      }));
    }
    addToast({
      type: 'warning',
      title: `Chaos Active: ${experimentId}`,
      description: `Injecting synthetic failure into ${exp?.targetService}.`
    });
  };

  const abortChaosExperiment = (experimentId) => {
    setChaosExperiments(prev => prev.map(exp => exp.id === experimentId ? { ...exp, status: 'aborted' } : exp));
    const exp = chaosExperiments.find(e => e.id === experimentId);
    if (exp?.targetServiceId) {
      setServices(prev => prev.map(s => {
        if (s.id === exp.targetServiceId) {
          return { ...s, status: 'nominal', latencyP99: s.latencyBaseline, errorRate: 0.02 };
        }
        return s;
      }));
    }
    addToast({
      type: 'info',
      title: `Chaos Aborted: ${experimentId}`,
      description: 'Failure injection stopped. Pod metrics returning to baseline.'
    });
  };

  const rerunAiInvestigation = async (incidentId) => {
    try {
      const res = await api.runInvestigation(incidentId);
      if (res?.data?.hypotheses) {
        const top = res.data.hypotheses[0];
        setIncidents(prev => prev.map(inc => {
          if (inc.id === incidentId) {
            return {
              ...inc,
              aiConfidencePercent: Math.round(top?.score || 96),
              aiHypothesis: top?.summary || inc.aiHypothesis,
              durationMinutes: inc.durationMinutes + 1
            };
          }
          return inc;
        }));
      }
    } catch (e) {
      console.warn('Backend investigation run fallback:', e.message);
    }

    addToast({
      type: 'success',
      title: 'RCA Investigation Refreshed',
      description: 'Backend RCA engine re-evaluated causal graph.'
    });
  };

  const resetAllDemoData = () => {
    setServices(INITIAL_SERVICES);
    setIncidents(INITIAL_INCIDENTS);
    setAlerts(INITIAL_ALERTS);
    setDeployments(INITIAL_DEPLOYMENTS);
    setSlos(INITIAL_SLOS);
    setRunbooks(INITIAL_RUNBOOKS);
    setChaosExperiments(INITIAL_CHAOS_EXPERIMENTS);
    addToast({
      type: 'info',
      title: 'Demo State Reset',
      description: 'All services and telemetry restored to initial mock baseline.'
    });
  };

  const value = {
    services,
    incidents,
    alerts,
    deployments,
    slos,
    runbooks,
    chaosExperiments,
    postmortems,
    integrations,
    telemetryLogs,
    cluster,
    setCluster,
    environment,
    setEnvironment,
    region,
    setRegion,
    timeRange,
    setTimeRange,
    isAiHypothesisOpen,
    setIsAiHypothesisOpen,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    searchQuery,
    setSearchQuery,
    toasts,
    addToast,
    removeToast,
    backendConnected,
    backendError,
    getServiceById,
    getIncidentById,
    resolveIncident,
    mitigateIncident,
    createManualIncident,
    rollbackCanary,
    acknowledgeAlert,
    resolveAlert,
    evaluateAlerts,
    silenceAlert,
    executeRunbookStep,
    resetRunbook,
    startChaosExperiment,
    abortChaosExperiment,
    rerunAiInvestigation,
    resetAllDemoData
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

