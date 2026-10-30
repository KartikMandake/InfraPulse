import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { config } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import auditRoutes from './routes/audit.routes.js';
import servicesRoutes from './routes/services.routes.js';
import incidentsRoutes from './routes/incidents.routes.js';
import alertsRoutes from './routes/alerts.routes.js';
import alertRulesRoutes from './routes/alertRules.routes.js';
import telemetryRoutes from './routes/telemetry.routes.js';
import deploymentsRoutes from './routes/deployments.routes.js';
import investigationRoutes from './routes/investigation.routes.js';
import faultLabRoutes from './routes/faultLab.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import notificationSettingsRoutes from './routes/notificationSettings.routes.js';
import assistantRoutes from './routes/assistant.routes.js';
import runbooksRoutes from './routes/runbooks.routes.js';
import runbookExecutionsRoutes from './routes/runbookExecutions.routes.js';
import sloRoutes from './routes/slo.routes.js';
import reliabilityRoutes from './routes/reliability.routes.js';
import changeRoutes from './routes/change.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import eventsRoutes from './routes/events.routes.js';
import operationalIntelligenceRoutes from './routes/operationalIntelligence.routes.js';
import { authenticate } from './middleware/authenticate.js';
import { csrfProtection } from './middleware/csrf.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Middleware
app.use(requestLogger);
app.use(cors({
  origin: [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(authenticate);
app.use(csrfProtection);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/alert-rules', alertRulesRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/deployments', deploymentsRoutes);
app.use('/api/investigation', investigationRoutes);
app.use('/api/fault-lab', faultLabRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/notification-settings', notificationSettingsRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/runbooks', runbooksRoutes);
app.use('/api/runbook-executions', runbookExecutionsRoutes);
app.use('/api/slos', sloRoutes);
app.use('/api/reliability', reliabilityRoutes);
app.use('/api/changes', changeRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/operations/intelligence', operationalIntelligenceRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
