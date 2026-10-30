import * as telemetryService from '../integrations/telemetry/telemetry.service.js';

export async function getTelemetry(req, res, next) {
  try {
    const { service, traceId } = req.query;
    const [tracesResult, logsResult] = await Promise.all([
      telemetryService.getTraces(traceId, service),
      telemetryService.getLogs(null, service)
    ]);

    res.json({
      success: true,
      data: {
        mode: telemetryService.getTelemetryMode(),
        logs: logsResult.logs || [],
        traces: tracesResult.traces || [],
        totalLogs: logsResult.totalLogs || (logsResult.logs ? logsResult.logs.length : 0),
        totalTraces: tracesResult.totalTraces || (tracesResult.traces ? tracesResult.traces.length : 0)
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getStatus(req, res, next) {
  try {
    const status = await telemetryService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
}

export async function setMode(req, res, next) {
  try {
    const { mode } = req.body || {};
    const updated = telemetryService.setTelemetryMode(mode);
    res.json({
      success: true,
      data: { mode: updated }
    });
  } catch (error) {
    next(error);
  }
}

export async function getMetrics(req, res, next) {
  try {
    const { query } = req.query;
    const result = await telemetryService.getMetrics(query);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getTraces(req, res, next) {
  try {
    const { traceId, service } = req.query;
    const result = await telemetryService.getTraces(traceId, service);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getLogs(req, res, next) {
  try {
    const { query, service } = req.query;
    const result = await telemetryService.getLogs(query, service);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}
