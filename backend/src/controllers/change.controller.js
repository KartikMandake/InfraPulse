import * as changeIntelligenceService from '../services/changeIntelligence.service.js';
import * as deploymentRegressionService from '../services/deploymentRegression.service.js';
import * as deploymentHistoryService from '../services/deploymentHistory.service.js';
import { ApiError } from '../utils/ApiError.js';

export async function listChanges(req, res, next) {
  try {
    const filters = {
      serviceId: req.query.serviceId,
      environment: req.query.environment,
      status: req.query.status,
      tenantId: req.query.tenantId || req.user?.tenantId,
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0
    };
    const result = await changeIntelligenceService.listChanges(filters);
    res.json({ success: true, count: result.items.length, total: result.total, data: result.items });
  } catch (error) {
    next(error);
  }
}

export async function getChangeById(req, res, next) {
  try {
    const result = await changeIntelligenceService.getChangeDetails(req.params.changeId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createChange(req, res, next) {
  try {
    const result = await changeIntelligenceService.registerChangeEvent(req.body, req.user);
    res.status(result.idempotent ? 200 : 201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function assessProposedChange(req, res, next) {
  try {
    const result = await changeIntelligenceService.assessProposedChange(req.body, req.user);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getChangeAssessment(req, res, next) {
  try {
    const details = await changeIntelligenceService.getChangeDetails(req.params.changeId);
    res.json({ success: true, data: details.assessment });
  } catch (error) {
    next(error);
  }
}

export async function getChangeBlastRadius(req, res, next) {
  try {
    const blastRadius = await changeIntelligenceService.getBlastRadiusForChange(req.params.changeId);
    res.json({ success: true, data: blastRadius });
  } catch (error) {
    next(error);
  }
}

export async function getChangeRegressions(req, res, next) {
  try {
    const regressions = await deploymentRegressionService.getRegressionsForChange(req.params.changeId);
    res.json({ success: true, count: regressions.length, data: regressions });
  } catch (error) {
    next(error);
  }
}

export async function evaluateChangeRegression(req, res, next) {
  try {
    const result = await deploymentRegressionService.evaluateDeploymentRegressions(req.params.changeId, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getServiceChangeHistory(req, res, next) {
  try {
    const history = await deploymentHistoryService.getServiceChangeHistory(req.params.serviceId);
    res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    next(error);
  }
}

export async function getChangeIntelligenceOverview(req, res, next) {
  try {
    const analytics = await deploymentHistoryService.getHistoricalChangeAnalytics();
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
}

export async function handleDeploymentWebhook(req, res, next) {
  try {
    // 1. Authenticate webhook request
    const authHeader = req.headers['authorization'] || '';
    const tokenHeader = req.headers['x-infrapulse-token'] || '';
    const configuredSecret = process.env.DEPLOYMENT_WEBHOOK_SECRET || 'infrapulse-webhook-secret-token';

    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const providedToken = tokenHeader || bearerToken;

    if (!providedToken || providedToken !== configuredSecret) {
      throw ApiError.unauthorized('Invalid or missing deployment webhook secret token.');
    }

    // 2. Validate payload
    const { serviceId, service_id, newVersion, new_version } = req.body;
    const targetService = serviceId || service_id;
    const targetVersion = newVersion || new_version;

    if (!targetService || !targetVersion) {
      throw ApiError.badRequest('Webhook payload requires serviceId and newVersion.');
    }

    // 3. Extract idempotency key
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey || req.body.idempotency_key;

    // 4. Register change event
    const eventData = {
      ...req.body,
      serviceId: targetService,
      newVersion: targetVersion,
      idempotencyKey,
      actor: req.body.actor || 'External CI/CD Webhook'
    };

    const result = await changeIntelligenceService.registerChangeEvent(eventData, {
      id: 'webhook-ci-cd',
      email: 'webhook@infrapulse.io',
      role: 'responder'
    });

    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      message: result.idempotent ? 'Deployment already recorded (idempotent duplicate).' : 'Deployment recorded and assessed successfully.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

