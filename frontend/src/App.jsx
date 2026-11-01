import React,{lazy,Suspense} from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';

const OverviewIncidentPage=lazy(()=>import('./pages/OverviewIncidentPage').then(module=>({default:module.OverviewIncidentPage})));
const SystemOverviewPage=lazy(()=>import('./pages/SystemOverviewPage').then(module=>({default:module.SystemOverviewPage})));
const ServicesTopologyPage=lazy(()=>import('./pages/ServicesTopologyPage').then(module=>({default:module.ServicesTopologyPage})));
const ServiceDetailPage=lazy(()=>import('./pages/ServiceDetailPage').then(module=>({default:module.ServiceDetailPage})));
const IncidentManagementPage=lazy(()=>import('./pages/IncidentManagementPage').then(module=>({default:module.IncidentManagementPage})));
const IncidentInvestigationPage=lazy(()=>import('./pages/IncidentInvestigationPage').then(module=>({default:module.IncidentInvestigationPage})));
const AlertsCenterPage=lazy(()=>import('./pages/AlertsCenterPage').then(module=>({default:module.AlertsCenterPage})));
const TelemetryExplorerPage=lazy(()=>import('./pages/TelemetryExplorerPage').then(module=>({default:module.TelemetryExplorerPage})));
const DeploymentsPage=lazy(()=>import('./pages/DeploymentsPage').then(module=>({default:module.DeploymentsPage})));
const SLOsPage=lazy(()=>import('./pages/SLOsPage').then(module=>({default:module.SLOsPage})));
const RunbooksPage=lazy(()=>import('./pages/RunbooksPage').then(module=>({default:module.RunbooksPage})));
const FaultInjectionLabPage=lazy(()=>import('./pages/FaultInjectionLabPage').then(module=>({default:module.FaultInjectionLabPage})));
const ReportsPostmortemsPage=lazy(()=>import('./pages/ReportsPostmortemsPage').then(module=>({default:module.ReportsPostmortemsPage})));
const OperationalIntelligencePage=lazy(()=>import('./pages/OperationalIntelligencePage.jsx').then(module=>({default:module.OperationalIntelligencePage})));
const CloudLifecyclePage=lazy(()=>import('./pages/CloudLifecyclePage.jsx').then(module=>({default:module.CloudLifecyclePage})));
const SREIntelligencePage=lazy(()=>import('./pages/SREIntelligencePage.jsx').then(module=>({default:module.SREIntelligencePage})));
const SelfMonitoringPage=lazy(()=>import('./pages/SelfMonitoringPage.jsx').then(module=>({default:module.SelfMonitoringPage})));
const IntegrationsPage=lazy(()=>import('./pages/IntegrationsPage').then(module=>({default:module.IntegrationsPage})));
const TeamSettingsPage=lazy(()=>import('./pages/TeamSettingsPage').then(module=>({default:module.TeamSettingsPage})));
const AuthOnboardingPage=lazy(()=>import('./pages/AuthOnboardingPage').then(module=>({default:module.AuthOnboardingPage})));

export const App = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Suspense fallback={<div role="status" className="p-6 text-slate-300">Loading page…</div>}>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<OverviewIncidentPage />} />
              <Route path="system-overview" element={<SystemOverviewPage />} />
              <Route path="services" element={<ServicesTopologyPage />} />
              <Route path="services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="incidents" element={<IncidentManagementPage />} />
              <Route path="incidents/:incidentId" element={<IncidentInvestigationPage />} />
              <Route path="alerts" element={<AlertsCenterPage />} />
              <Route path="telemetry" element={<TelemetryExplorerPage />} />
              <Route path="deployments" element={<DeploymentsPage />} />
              <Route path="slos" element={<SLOsPage />} />
              <Route path="runbooks" element={<RunbooksPage />} />
              <Route path="fault-injection" element={<FaultInjectionLabPage />} />
              <Route path="reports" element={<ReportsPostmortemsPage />} />
              <Route path="operations" element={<OperationalIntelligencePage />} />
              <Route path="cloud-lifecycle" element={<CloudLifecyclePage />} />
              <Route path="sre-intelligence" element={<SREIntelligencePage />} />
              <Route path="self-monitoring" element={<SelfMonitoringPage />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="team" element={<TeamSettingsPage />} />
              <Route path="auth" element={<AuthOnboardingPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
};

export default App;

