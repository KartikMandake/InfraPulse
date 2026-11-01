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
import cloudLifecycleRoutes from './routes/cloudLifecycle.routes.js';
import remediationRoutes from './routes/remediation.routes.js';
import sreIntelligenceRoutes from './routes/sreIntelligence.routes.js';
import selfMonitoringRoutes from './routes/selfMonitoring.routes.js';
import { getMetrics } from './controllers/selfMonitoring.controller.js';
import { authenticate } from './middleware/authenticate.js';
import {tenantBoundary} from './security/tenantContext.js';
import { csrfProtection } from './middleware/csrf.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import {securityHeaders,requireHttps,createAuthRateLimiter,createGeneralApiRateLimiter} from './middleware/productionSecurity.js';

const app = express();
app.disable('x-powered-by');

// Trust proxy for reverse proxies / load balancers
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy === 'true' ? true : (isNaN(Number(config.trustProxy)) ? config.trustProxy : Number(config.trustProxy)));
}

// Middleware
app.use(requestLogger);
app.use(securityHeaders);
app.use(requireHttps(config));
if(config.productionLike){
  app.use(createAuthRateLimiter());
  app.use('/api', createGeneralApiRateLimiter());
}
app.use(cors({
  origin: config.corsOrigins,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: config.requestBodyLimit || '2mb',verify:(req,res,buffer)=>{req.rawBody=buffer.toString('utf8');} }));
// Ingestion tokens authenticate integrations, not user sessions. The dedicated
// integration handlers verify credentials and establish a trusted tenant context.
const externalIngestion=/^\/api\/integrations\/(?:otlp\/v1\/(?:metrics|traces|logs)|webhooks\/(?:github|grafana)|deployments\/webhook)\/?$/;
const selfMonitoringMetrics=/^(?:\/metrics|\/api\/self-monitoring\/metrics)\/?$/;
app.use((req,res,next)=>(externalIngestion.test(req.path)||selfMonitoringMetrics.test(req.path))?next():authenticate(req,res,next));
app.use(csrfProtection);
app.use((req,res,next)=>{
  const publicPath=/^\/api\/(?:health\/(?:live|ready)|auth\/(?:login|register|me)|self-monitoring\/(?:metrics|overview|alerts|slos))\/?$/;
  if(!req.path.startsWith('/api/')||publicPath.test(req.path)||externalIngestion.test(req.path)||selfMonitoringMetrics.test(req.path))return next();
  return tenantBoundary(req,res,next);
});

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
app.use('/api/cloud', cloudLifecycleRoutes);
app.use('/api/remediation', remediationRoutes);
app.use('/api/sre-intelligence', sreIntelligenceRoutes);
app.get('/metrics', getMetrics);
app.use('/api/self-monitoring', selfMonitoringRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
