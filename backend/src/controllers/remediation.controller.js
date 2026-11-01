// ==============================================================================
// InfraPulse - Governed Remediation Controller
// Phase 23J: API Endpoints for Recommendations, Approvals & Executions
// ==============================================================================

import { remediationRepository } from '../repositories/remediation.repository.js';
import { remediationRecommendationService } from '../services/remediation/remediationRecommendation.service.js';
import { remediationApprovalService } from '../services/remediation/remediationApproval.service.js';
import { remediationExecutionService } from '../services/remediation/remediationExecution.service.js';
import { remediationPolicyService } from '../services/remediation/remediationPolicy.service.js';

export const remediationController = {
  // 1. Generate Recommendations from Incident RCA
  async generateRecommendations(req, res, next) {
    try {
      const incidentId = req.params.id;
      const tenantId = req.user?.tenantId || 'default_tenant';
      const result = await remediationRecommendationService.generateRecommendationsForIncident({
        incidentId,
        tenantId,
        user: req.user
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // 2. List Recommendations
  async listRecommendations(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { incidentId, environment, status, limit } = req.query;
      const list = await remediationRepository.listRecommendations(tenantId, {
        incidentId,
        environment,
        status,
        limit
      });
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  },

  // 3. Get Recommendation by ID
  async getRecommendationById(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const rec = await remediationRepository.getRecommendationById(req.params.id, tenantId);
      if (!rec) return res.status(404).json({ success: false, message: 'Recommendation not found.' });

      const plan = await remediationRepository.getPlanByRecommendationId(rec.id, tenantId);
      const approval = plan ? await remediationRepository.getApprovalByPlanId(plan.id, tenantId) : null;

      res.json({ success: true, data: { ...rec, plan, approval } });
    } catch (err) {
      next(err);
    }
  },

  // 4. Dry-Run Execution Preview
  async dryRun(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const preview = await remediationExecutionService.dryRunExecution({
        planId: req.params.id,
        user: req.user,
        tenantId
      });
      res.json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  },

  // 5. Request Approval
  async requestApproval(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { ttlMinutes } = req.body || {};
      const approval = await remediationApprovalService.requestApproval({
        planId: req.params.id,
        user: req.user,
        tenantId,
        ttlMinutes
      });
      res.status(201).json({ success: true, data: approval });
    } catch (err) {
      next(err);
    }
  },

  // 6. Approve Plan
  async approvePlan(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { planHash } = req.body || {};
      const updated = await remediationApprovalService.approvePlan({
        approvalId: req.params.id,
        user: req.user,
        planHash,
        tenantId
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  // 7. Reject Plan
  async rejectPlan(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { reason } = req.body || {};
      const updated = await remediationApprovalService.rejectPlan({
        approvalId: req.params.id,
        user: req.user,
        reason,
        tenantId
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  // 8. Execute Remediation Plan
  async executePlan(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { approvalId, idempotencyKey, explicitConfirmation } = req.body || {};
      const result = await remediationExecutionService.executePlan({
        planId: req.params.id,
        approvalId,
        user: req.user,
        idempotencyKey,
        explicitConfirmation: explicitConfirmation === true,
        tenantId
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // 9. List Executions
  async listExecutions(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { environment, status, resourceId, limit } = req.query;
      const list = await remediationRepository.listExecutions(tenantId, {
        environment,
        status,
        resourceId,
        limit
      });
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  },

  // 10. Get Execution Details with Verification & Audit Events
  async getExecutionById(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const exec = await remediationRepository.getExecutionById(req.params.id, tenantId);
      if (!exec) return res.status(404).json({ success: false, message: 'Execution not found.' });

      const events = await remediationRepository.listExecutionEvents(exec.id, tenantId);
      res.json({ success: true, data: { ...exec, events } });
    } catch (err) {
      next(err);
    }
  },

  // 11. Policies
  async listPolicies(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { environment, provider } = req.query;
      const policies = await remediationRepository.listPolicyRules(tenantId, { environment, provider });
      res.json({ success: true, data: policies });
    } catch (err) {
      next(err);
    }
  },

  async createPolicy(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const policy = await remediationRepository.createPolicyRule({
        ...req.body,
        tenantId
      });
      res.status(201).json({ success: true, data: policy });
    } catch (err) {
      next(err);
    }
  }
};

