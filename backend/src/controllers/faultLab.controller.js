import * as faultLabService from '../services/faultLab.service.js';

export function getScenarios(req, res, next) {
  try {
    const scenarios = faultLabService.listScenarios();
    res.json({
      success: true,
      data: scenarios
    });
  } catch (err) {
    next(err);
  }
}

export function createSimulation(req, res, next) {
  try {
    const simulation = faultLabService.createSimulation(req.body);
    res.status(201).json({
      success: true,
      data: simulation
    });
  } catch (err) {
    next(err);
  }
}

export function getSimulation(req, res, next) {
  try {
    const { simulationId } = req.params;
    const simulation = faultLabService.getSimulation(simulationId);
    res.json({
      success: true,
      data: simulation
    });
  } catch (err) {
    next(err);
  }
}

export function investigateSimulation(req, res, next) {
  try {
    const { simulationId } = req.params;
    const { weights } = req.body || {};
    const result = faultLabService.investigateSimulation(simulationId, weights);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export function resetSimulation(req, res, next) {
  try {
    const { simulationId } = req.params;
    const result = faultLabService.resetSimulation(simulationId);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

