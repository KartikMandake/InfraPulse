import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';

import { OverviewIncidentPage } from './pages/OverviewIncidentPage';
import { SystemOverviewPage } from './pages/SystemOverviewPage';
import { ServicesTopologyPage } from './pages/ServicesTopologyPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { IncidentManagementPage } from './pages/IncidentManagementPage';
import { IncidentInvestigationPage } from './pages/IncidentInvestigationPage';
import { AlertsCenterPage } from './pages/AlertsCenterPage';
import { TelemetryExplorerPage } from './pages/TelemetryExplorerPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { SLOsPage } from './pages/SLOsPage';
import { RunbooksPage } from './pages/RunbooksPage';
import { FaultInjectionLabPage } from './pages/FaultInjectionLabPage';
import { ReportsPostmortemsPage } from './pages/ReportsPostmortemsPage';
import { OperationalIntelligencePage } from './pages/OperationalIntelligencePage.jsx';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { TeamSettingsPage } from './pages/TeamSettingsPage';
import { AuthOnboardingPage } from './pages/AuthOnboardingPage';

export const App = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
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
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="team" element={<TeamSettingsPage />} />
              <Route path="auth" element={<AuthOnboardingPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
};

export default App;

