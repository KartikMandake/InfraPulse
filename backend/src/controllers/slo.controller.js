import * as sloService from '../services/slo.service.js';

export async function listSlos(req, res, next) {
  try {
    const { serviceId, enabled, sliType } = req.query;
    const slos = await sloService.listSlos({
      serviceId,
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
      sliType
    });
    res.json({ success: true, count: slos.length, data: slos });
  } catch (err) {
    next(err);
  }
}

export async function getSloById(req, res, next) {
  try {
    const slo = await sloService.getSloById(req.params.sloId);
    res.json({ success: true, data: slo });
  } catch (err) {
    next(err);
  }
}

export async function createSlo(req, res, next) {
  try {
    const created = await sloService.createSlo(req.body, req.user);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

export async function updateSlo(req, res, next) {
  try {
    const updated = await sloService.updateSlo(req.params.sloId, req.body, req.user);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteSlo(req, res, next) {
  try {
    const result = await sloService.deleteSlo(req.params.sloId, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function evaluateSlo(req, res, next) {
  try {
    const evaluation = await sloService.evaluateSlo(req.params.sloId, req.body || {});
    res.json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
}

export async function getErrorBudget(req, res, next) {
  try {
    const budget = await sloService.getErrorBudget(req.params.sloId);
    res.json({ success: true, data: budget });
  } catch (err) {
    next(err);
  }
}

export async function getBurnRate(req, res, next) {
  try {
    const burnRate = await sloService.getBurnRate(req.params.sloId);
    res.json({ success: true, data: burnRate });
  } catch (err) {
    next(err);
  }
}

