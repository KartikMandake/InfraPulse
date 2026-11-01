// ==============================================================================
// InfraPulse - Cloud Lifecycle & Cost Governance Routes
// Express route definitions with RBAC and authentication middleware
// ==============================================================================

import { Router } from 'express';
import { cloudLifecycleController } from '../controllers/cloudLifecycle.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// Resources (Viewers, Responders, Admins)
router.get('/resources', cloudLifecycleController.listResources);
router.get('/resources/:id', cloudLifecycleController.getResource);
router.get('/resources/:id/eligibility', requireAuth, cloudLifecycleController.checkEc2Eligibility);
router.get('/workloads/:id/eligibility', requireAuth, cloudLifecycleController.checkWorkloadEligibility);
router.post('/resources/:id/health', requireAuth, cloudLifecycleController.probeResourceHealth);

// Governed Docker Lifecycle (Phase 23F)
router.get('/docker/containers', requireAuth, cloudLifecycleController.listDockerContainers);
router.get('/docker/containers/:id/health', requireAuth, cloudLifecycleController.probeDockerContainerHealth);

// Governed Kubernetes Lifecycle (Phase 23F)
router.get('/kubernetes/workloads', requireAuth, cloudLifecycleController.listKubernetesWorkloads);
router.get('/kubernetes/workloads/:namespace/:name/health', requireAuth, cloudLifecycleController.probeKubernetesWorkloadHealth);

// Cost Estimates
router.get('/costs/estimate', cloudLifecycleController.getCostEstimate);

// Operations & Dry-Runs
router.get('/operations', cloudLifecycleController.listOperations);
router.post('/operations/dry-run', requireAuth, cloudLifecycleController.dryRunOperation);
router.post('/operations', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.requestOperation);
router.post('/operations/:id/approve', requireAuth, requireRole('admin'), cloudLifecycleController.approveOperation);
router.post('/operations/:id/execute', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.executeOperation);
router.post('/operations/:id/cancel', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.cancelOperation);

// Schedules
router.get('/schedules', cloudLifecycleController.listSchedules);
router.post('/schedules', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.createSchedule);
router.patch('/schedules/:id', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.updateSchedule);

// Kill Switch (Admin only for mutating toggle, readable by authenticated users)
router.get('/kill-switch', cloudLifecycleController.getKillSwitch);
router.post('/kill-switch', requireAuth, requireRole('admin'), cloudLifecycleController.toggleKillSwitch);

// Audit Trail
router.get('/audit', requireAuth, requireRole('admin'), cloudLifecycleController.getAuditTrail);

// AWS Read-Only Discovery (Admin triggers sync, authenticated users view status & guidelines)
router.get('/aws/status', requireAuth, cloudLifecycleController.getAwsConnectionStatus);
router.post('/aws/discover', requireAuth, requireRole('admin'), cloudLifecycleController.discoverAwsResources);
router.get('/aws/free-tier', requireAuth, cloudLifecycleController.getAwsFreeTierGuidelines);

// Infrastructure Drift Detection & Reconciliation (Phase 23G)
router.get('/drifts', requireAuth, cloudLifecycleController.listDriftEvents);
router.get('/drifts/stats', requireAuth, cloudLifecycleController.getDriftStats);
router.get('/drifts/:id', requireAuth, cloudLifecycleController.getDriftDetails);
router.patch('/drifts/:id', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.acknowledgeOrIgnoreDrift);
router.post('/drifts/detect', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.triggerDriftDetection);

router.get('/snapshots', requireAuth, cloudLifecycleController.listSnapshots);
router.get('/snapshots/:resourceId', requireAuth, cloudLifecycleController.getResourceSnapshotHistory);

router.get('/baselines/active', requireAuth, cloudLifecycleController.getActiveBaseline);
router.get('/baselines/history', requireAuth, cloudLifecycleController.getBaselineHistory);
router.post('/baselines', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.createBaseline);
router.post('/baselines/init-inventory', requireAuth, requireRole('admin'), cloudLifecycleController.initializeBaselineFromInventory);

router.post('/reconciliations/preview', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.previewReconciliationPlan);
router.post('/reconciliations/submit', requireAuth, requireRole('responder', 'admin'), cloudLifecycleController.submitReconciliationRequest);
router.get('/reconciliations/:id', requireAuth, cloudLifecycleController.getReconciliationPlan);

export default router;

