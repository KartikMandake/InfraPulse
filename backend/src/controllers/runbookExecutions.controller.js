import * as executionService from '../services/runbookExecution.service.js';
import * as approvalService from '../services/approval.service.js';

export async function getExecutionById(req, res, next) {
  try {
    const details = await executionService.getExecutionDetails(req.params.executionId);
    res.json({ success: true, data: details });
  } catch (err) {
    next(err);
  }
}

export async function requestApproval(req, res, next) {
  try {
    const result = await approvalService.requestApproval({
      executionId: req.params.executionId,
      user: req.user
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function approveExecution(req, res, next) {
  try {
    const { approvalNotes, twoFactorConfirmed } = req.body || {};
    const result = await approvalService.approveExecution({
      executionId: req.params.executionId,
      user: req.user,
      approvalNotes,
      twoFactorConfirmed: Boolean(twoFactorConfirmed)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function rejectExecution(req, res, next) {
  try {
    const { rejectionReason } = req.body || {};
    const result = await approvalService.rejectExecution({
      executionId: req.params.executionId,
      user: req.user,
      rejectionReason: rejectionReason || 'Rejected by operator'
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function executeRunbook(req, res, next) {
  try {
    const result = await executionService.executeRunbook({
      executionId: req.params.executionId,
      user: req.user
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function cancelExecution(req, res, next) {
  try {
    const { reason } = req.body || {};
    const result = await executionService.cancelExecution({
      executionId: req.params.executionId,
      user: req.user,
      reason
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getExecutionLogs(req, res, next) {
  try {
    const details = await executionService.getExecutionDetails(req.params.executionId);
    res.json({
      success: true,
      executionId: details.id,
      status: details.status,
      actionLogs: details.logs || [],
      steps: details.steps || []
    });
  } catch (err) {
    next(err);
  }
}

