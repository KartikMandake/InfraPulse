// ==============================================================================
// InfraPulse - Governed Infrastructure Remediation Routes
// Phase 23J: RBAC-Protected Remediation Intelligence & Controlled Execution
// ==============================================================================

import { Router } from 'express';
import { remediationController } from '../controllers/remediation.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// 1. Recommendations
router.post('/incidents/:id/recommendations', requireAuth, remediationController.generateRecommendations);
router.get('/recommendations', requireAuth, remediationController.listRecommendations);
router.get('/recommendations/:id', requireAuth, remediationController.getRecommendationById);

// 2. Dry-Run Execution Preview (Safe, available to all authorized users)
router.post('/plans/:id/dry-run', requireAuth, remediationController.dryRun);

// 3. Approval Workflow (Responder / Admin)
router.post('/plans/:id/request-approval', requireAuth, requireRole('responder', 'admin'), remediationController.requestApproval);
router.post('/approvals/:id/approve', requireAuth, requireRole('responder', 'admin'), remediationController.approvePlan);
router.post('/approvals/:id/reject', requireAuth, requireRole('responder', 'admin'), remediationController.rejectPlan);

// 4. Execution Workflow (Responder / Admin)
router.post('/plans/:id/execute', requireAuth, requireRole('responder', 'admin'), remediationController.executePlan);
router.get('/executions', requireAuth, remediationController.listExecutions);
router.get('/executions/:id', requireAuth, remediationController.getExecutionById);

// 5. Policy Rules (Viewable by users; Admin to create/modify)
router.get('/policies', requireAuth, remediationController.listPolicies);
router.post('/policies', requireAuth, requireRole('admin'), remediationController.createPolicy);

export default router;

