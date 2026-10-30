import { useApp } from '../context/AppContext.jsx';

export const useServices = () => {
  const { services, getServiceById } = useApp();
  return {
    services,
    getServiceById,
    healthyCount: services.filter(s => s.status === 'nominal').length,
    degradedCount: services.filter(s => s.status === 'degraded').length,
    criticalCount: services.filter(s => s.status === 'critical').length,
    totalCount: services.length
  };
};

export const useIncidents = () => {
  const { incidents, getIncidentById, resolveIncident, mitigateIncident, createManualIncident } = useApp();
  return {
    incidents,
    getIncidentById,
    resolveIncident,
    mitigateIncident,
    createManualIncident,
    activeIncidents: incidents.filter(i => i.status !== 'resolved'),
    criticalIncidents: incidents.filter(i => i.severity === 'SEV-1'),
    resolvedIncidents: incidents.filter(i => i.status === 'resolved')
  };
};

export const useAlerts = () => {
  const { alerts, acknowledgeAlert, silenceAlert } = useApp();
  return {
    alerts,
    acknowledgeAlert,
    silenceAlert,
    firingCount: alerts.filter(a => a.state === 'firing').length,
    acknowledgedCount: alerts.filter(a => a.state === 'acknowledged').length,
    silencedCount: alerts.filter(a => a.state === 'silenced').length
  };
};

export const useDeployments = () => {
  const { deployments, rollbackCanary } = useApp();
  return {
    deployments,
    rollbackCanary,
    activeCanaries: deployments.filter(d => d.environment === 'canary' && d.status !== 'rolled_back')
  };
};

export const useRunbooks = () => {
  const { runbooks, executeRunbookStep, resetRunbook } = useApp();
  return {
    runbooks,
    executeRunbookStep,
    resetRunbook
  };
};

export const useChaos = () => {
  const { chaosExperiments, startChaosExperiment, abortChaosExperiment } = useApp();
  return {
    chaosExperiments,
    startChaosExperiment,
    abortChaosExperiment
  };
};

