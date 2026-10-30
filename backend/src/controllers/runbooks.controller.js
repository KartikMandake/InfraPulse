import * as runbookService from '../services/runbook.service.js';
import * as executionService from '../services/runbookExecution.service.js';

export async function listRunbooks(req, res, next) {
  try {
    const { riskLevel, executionMode, serviceId, incidentType } = req.query;
    const runbooks = await runbookService.getRunbooksCatalog({
      riskLevel,
      executionMode,
      serviceId,
      incidentType,
      enabled: true
    });
    res.json({ success: true, count: runbooks.length, data: runbooks });
  } catch (err) {
    next(err);
  }
}

export async function getRunbookById(req, res, next) {
  try {
    const runbook = await runbookService.getRunbookDetails(req.params.runbookId);
    res.json({ success: true, data: runbook });
  } catch (err) {
    next(err);
  }
}

export async function createRunbook(req, res, next) {
  try {
    const created = await runbookService.createCustomRunbook(req.body, req.user);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

export async function updateRunbook(req, res, next) {
  try {
    const updated = await runbookService.updateRunbook(req.params.runbookId, req.body, req.user);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function getIncidentRunbooks(req, res, next) {
  try {
    const result = await runbookService.getCompatibleRunbooksForIncident(req.params.incidentId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function dryRunIncidentRunbook(req, res, next) {
  try {
    const plan = await executionService.generateDryRunPlan({
      incidentId: req.params.incidentId,
      runbookId: req.params.runbookId,
      targetServiceId: req.body?.targetServiceId,
      user: req.user
    });
    res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

export async function createIncidentExecution(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const execution = await executionService.createExecutionPlan({
      incidentId: req.params.incidentId,
      runbookId: req.params.runbookId,
      targetServiceId: req.body?.targetServiceId,
      idempotencyKey,
      user: req.user
    });
    res.status(201).json({ success: true, data: execution });
  } catch (err) {
    next(err);
  }
}

export async function listIncidentExecutions(req, res, next) {
  try {
    const list = await executionService.listIncidentExecutions(req.params.incidentId);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    next(err);
  }
}

