// ==============================================================================
// InfraPulse - Cloud Lifecycle API Controller
// Handles HTTP request lifecycle, RBAC enforcement, and response formatting
// ==============================================================================

import { resourceService } from '../services/cloud-lifecycle/services/resource.service.js';
import { lifecycleService } from '../services/cloud-lifecycle/services/lifecycle.service.js';
import { costEstimationService } from '../services/cloud-lifecycle/services/cost-estimation.service.js';
import { scheduleService } from '../services/cloud-lifecycle/services/schedule.service.js';
import { lifecyclePolicy } from '../services/cloud-lifecycle/policies/lifecycle-policy.js';
import { awsDiscoveryService } from '../services/cloud-lifecycle/services/awsDiscovery.service.js';
import { ec2EligibilityService } from '../services/cloud-lifecycle/services/ec2Eligibility.service.js';
import { workloadEligibilityService } from '../services/cloud-lifecycle/services/workloadEligibility.service.js';
import { DockerLifecycleProvider } from '../services/cloud-lifecycle/providers/dockerLifecycle.provider.js';
import { KubernetesLifecycleProvider } from '../services/cloud-lifecycle/providers/kubernetesLifecycle.provider.js';
import { snapshotService } from '../services/cloud-lifecycle/services/snapshot.service.js';
import { baselineService } from '../services/cloud-lifecycle/services/baseline.service.js';
import { driftDetectionService } from '../services/cloud-lifecycle/services/driftDetection.service.js';
import { driftReconciliationService } from '../services/cloud-lifecycle/services/driftReconciliation.service.js';
import { driftGovernanceRepository } from '../repositories/driftGovernance.repository.js';
import { cloudLifecycleRepository } from '../repositories/cloudLifecycle.repository.js';
import { query } from '../db/connection.js';

export const cloudLifecycleController = {
  // Resources
  async listResources(req, res, next) {
    try {
      const { provider, environment, currentState } = req.query;
      const resources = await resourceService.getAllResources({ provider, environment, currentState });
      res.json({ success: true, count: resources.length, data: resources });
    } catch (err) {
      next(err);
    }
  },

  async getResource(req, res, next) {
    try {
      const resource = await resourceService.getResourceById(req.params.id);
      res.json({ success: true, data: resource });
    } catch (err) {
      next(err);
    }
  },

  async probeResourceHealth(req, res, next) {
    try {
      const result = await resourceService.probeHealth(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // Cost estimates
  async getCostEstimate(req, res, next) {
    try {
      const environment = req.query.environment || 'staging';
      const estimate = await costEstimationService.calculateCostProjections(environment);
      res.json({ success: true, data: estimate });
    } catch (err) {
      next(err);
    }
  },

  // Operations
  async listOperations(req, res, next) {
    try {
      const { resourceId, status, limit } = req.query;
      const ops = await cloudLifecycleRepository.getAllOperations({ resourceId, status, limit });
      res.json({ success: true, count: ops.length, data: ops });
    } catch (err) {
      next(err);
    }
  },

  async dryRunOperation(req, res, next) {
    try {
      const { resourceId, action, targetReplicas, allowStatefulSetScale, exceptionalAuthorization } = req.body;
      if (!resourceId || !action) {
        return res.status(400).json({ success: false, message: 'resourceId and action are required.' });
      }

      const result = await lifecycleService.dryRun({
        resourceId,
        action,
        user: req.user,
        targetReplicas,
        allowStatefulSetScale,
        exceptionalAuthorization
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async requestOperation(req, res, next) {
    try {
      const { resourceId, action, idempotencyKey, dryRunId, targetReplicas, allowStatefulSetScale, exceptionalAuthorization, reason } = req.body;
      if (!resourceId || !action) {
        return res.status(400).json({ success: false, message: 'resourceId and action are required.' });
      }

      const operation = await lifecycleService.requestOperation({
        resourceId,
        action,
        idempotencyKey,
        dryRunId,
        user: req.user,
        targetReplicas,
        allowStatefulSetScale,
        exceptionalAuthorization,
        reason
      });
      res.status(201).json({ success: true, data: operation });
    } catch (err) {
      if (err.message.includes('Forbidden') || err.message.includes('workload safety rules')) {
        return res.status(403).json({ success: false, message: err.message });
      }
      if (err.message.includes('Kill Switch Active') || err.message.includes('already has an active operation')) {
        return res.status(409).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  async approveOperation(req, res, next) {
    try {
      const operation = await lifecycleService.approveOperation({
        operationId: req.params.id,
        user: req.user
      });
      res.json({ success: true, data: operation });
    } catch (err) {
      if (err.message.includes('Forbidden') || err.message.includes('Separation of Duties')) {
        return res.status(403).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  async executeOperation(req, res, next) {
    try {
      const { dryRunOverride, explicitConfirmation } = req.body || {};
      const result = await lifecycleService.executeOperation({
        operationId: req.params.id,
        user: req.user,
        dryRunOverride,
        explicitConfirmation: explicitConfirmation === true
      });
      res.json({ success: true, data: result });
    } catch (err) {
      if (err.message.includes('Execution Denied') || err.message.includes('Kill Switch Active') || err.message.includes('Explicit confirmation required') || err.message.includes('EC2 eligibility') || err.message.includes('workload safety rules')) {
        return res.status(403).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  async checkEc2Eligibility(req, res, next) {
    try {
      const resource = await resourceService.getResourceById(req.params.id);
      const action = req.query.action || 'stop';
      const eligibility = await ec2EligibilityService.evaluateEligibility(resource, action);
      res.json({ success: true, data: eligibility });
    } catch (err) {
      next(err);
    }
  },

  async checkWorkloadEligibility(req, res, next) {
    try {
      const resource = await resourceService.getResourceById(req.params.id);
      const action = req.query.action || 'stop';
      const targetReplicas = req.query.targetReplicas !== undefined ? parseInt(req.query.targetReplicas, 10) : undefined;
      const allowStatefulSetScale = req.query.allowStatefulSetScale === 'true';
      const exceptionalAuthorization = req.query.exceptionalAuthorization === 'true';

      const eligibility = await workloadEligibilityService.evaluateEligibility(resource, action, {
        targetReplicas,
        allowStatefulSetScale,
        exceptionalAuthorization
      });
      res.json({ success: true, data: eligibility });
    } catch (err) {
      next(err);
    }
  },

  // Docker Discovery & Health
  async listDockerContainers(req, res, next) {
    try {
      const dockerProvider = new DockerLifecycleProvider();
      const composeServices = await dockerProvider.listComposeServices('infrapulse');
      const allResources = await resourceService.getAllResources({ provider: 'docker' });
      res.json({
        success: true,
        count: allResources.length,
        data: allResources,
        composeServices
      });
    } catch (err) {
      next(err);
    }
  },

  async probeDockerContainerHealth(req, res, next) {
    try {
      const dockerProvider = new DockerLifecycleProvider();
      const health = await dockerProvider.getContainerHealth(req.params.id);
      res.json({ success: true, data: health });
    } catch (err) {
      next(err);
    }
  },

  // Kubernetes Discovery & Health
  async listKubernetesWorkloads(req, res, next) {
    try {
      const k8sProvider = new KubernetesLifecycleProvider();
      const namespaces = await k8sProvider.listNamespaces();
      const allWorkloads = await resourceService.getAllResources({ provider: 'kubernetes' });
      res.json({
        success: true,
        count: allWorkloads.length,
        data: allWorkloads,
        namespaces
      });
    } catch (err) {
      next(err);
    }
  },

  async probeKubernetesWorkloadHealth(req, res, next) {
    try {
      const { namespace, name } = req.params;
      const k8sProvider = new KubernetesLifecycleProvider();
      const health = await k8sProvider.getPodHealth(namespace, `app.kubernetes.io/name=${name}`);
      res.json({ success: true, data: health });
    } catch (err) {
      next(err);
    }
  },

  async cancelOperation(req, res, next) {
    try {
      const { reason } = req.body;
      const operation = await lifecycleService.cancelOperation({
        operationId: req.params.id,
        user: req.user,
        reason
      });
      res.json({ success: true, data: operation });
    } catch (err) {
      next(err);
    }
  },

  // Schedules
  async listSchedules(req, res, next) {
    try {
      const schedules = await scheduleService.getAllSchedules();
      res.json({ success: true, count: schedules.length, data: schedules });
    } catch (err) {
      next(err);
    }
  },

  async createSchedule(req, res, next) {
    try {
      if (req.user?.role === 'viewer') {
        return res.status(403).json({ success: false, message: 'Viewers cannot create schedules.' });
      }
      const schedule = await scheduleService.createSchedule(req.body, req.user);
      res.status(201).json({ success: true, data: schedule });
    } catch (err) {
      next(err);
    }
  },

  async updateSchedule(req, res, next) {
    try {
      if (req.user?.role === 'viewer') {
        return res.status(403).json({ success: false, message: 'Viewers cannot update schedules.' });
      }
      const { is_paused, enabled, days_of_week, time_of_day } = req.body;
      let schedule;
      if (is_paused !== undefined) {
        schedule = await scheduleService.toggleSchedulePause(req.params.id, is_paused, req.user);
      } else {
        schedule = await scheduleService.updateSchedule(req.params.id, { enabled, days_of_week, time_of_day }, req.user);
      }
      res.json({ success: true, data: schedule });
    } catch (err) {
      next(err);
    }
  },

  // Kill Switch
  async getKillSwitch(req, res, next) {
    try {
      const state = await lifecyclePolicy.getKillSwitchState();
      res.json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  },

  async toggleKillSwitch(req, res, next) {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden: Only Administrators can toggle the cloud kill switch.' });
      }
      const { enabled, reason } = req.body;
      const state = await lifecyclePolicy.setKillSwitch(enabled, { user: req.user, reason });
      res.json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  },

  // Audit
  async getAuditTrail(req, res, next) {
    try {
      const limit = parseInt(req.query.limit || '50', 10);
      const auditRes = await query(
        `SELECT * FROM audit_logs
         WHERE action LIKE 'CLOUD_%'
           ORDER BY created_at DESC
         LIMIT $1;`,
        [limit]
      );
      res.json({ success: true, count: auditRes.rows.length, data: auditRes.rows });
    } catch (err) {
      next(err);
    }
  },

  // AWS Read-Only Discovery & Free Tier
  async getAwsConnectionStatus(req, res, next) {
    try {
      const region = req.query.region || 'ap-south-1';
      const status = await awsDiscoveryService.getConnectionStatus(region);
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  },

  async discoverAwsResources(req, res, next) {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden: Only Administrators can trigger AWS discovery synchronization.' });
      }
      const region = req.body?.region || 'ap-south-1';
      const result = await awsDiscoveryService.syncAwsResources({ region, user: req.user });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getAwsFreeTierGuidelines(req, res, next) {
    try {
      const guidelines = awsDiscoveryService.getFreeTierGuidelines();
      res.json({ success: true, data: guidelines });
    } catch (err) {
      next(err);
    }
  },

  // --------------------------------------------------------------------------
  // Phase 23G: Infrastructure Drift Detection & Reconciliation
  // --------------------------------------------------------------------------

  async listDriftEvents(req, res, next) {
    try {
      const { environment, status, severity, provider, resourceId, limit } = req.query;
      const drifts = await driftGovernanceRepository.getAllDriftEvents({
        environment,
        status,
        severity,
        provider,
        resourceId,
        limit: limit ? parseInt(limit, 10) : 100
      });
      res.json({ success: true, count: drifts.length, data: drifts });
    } catch (err) {
      next(err);
    }
  },

  async getDriftStats(req, res, next) {
    try {
      const environment = req.query.environment || null;
      const stats = await driftGovernanceRepository.getDriftStatistics(environment);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  },

  async getDriftDetails(req, res, next) {
    try {
      const drift = await driftGovernanceRepository.getDriftById(req.params.id);
      if (!drift) {
        return res.status(404).json({ success: false, message: `Drift event '${req.params.id}' not found.` });
      }
      res.json({ success: true, data: drift });
    } catch (err) {
      next(err);
    }
  },

  async acknowledgeOrIgnoreDrift(req, res, next) {
    try {
      const { status, reason } = req.body;
      const updated = await driftReconciliationService.acknowledgeOrIgnoreDrift(req.params.id, {
        status,
        reason,
        user: req.user
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      if (err.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  async triggerDriftDetection(req, res, next) {
    try {
      const environment = req.body?.environment || 'staging';
      const result = await driftDetectionService.detectDriftForEnvironment(environment, {
        user: req.user
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // Snapshots
  async listSnapshots(req, res, next) {
    try {
      const environment = req.query.environment || 'staging';
      const snapshots = await driftGovernanceRepository.getLatestSnapshots(environment);
      res.json({ success: true, count: snapshots.length, data: snapshots });
    } catch (err) {
      next(err);
    }
  },

  async getResourceSnapshotHistory(req, res, next) {
    try {
      const snapshots = await driftGovernanceRepository.getResourceSnapshotHistory(req.params.resourceId);
      res.json({ success: true, count: snapshots.length, data: snapshots });
    } catch (err) {
      next(err);
    }
  },

  // Baselines
  async getActiveBaseline(req, res, next) {
    try {
      const environment = req.query.environment || 'staging';
      const baseline = await baselineService.getActiveBaseline(environment);
      res.json({ success: true, data: baseline });
    } catch (err) {
      next(err);
    }
  },

  async getBaselineHistory(req, res, next) {
    try {
      const environment = req.query.environment || 'staging';
      const history = await baselineService.getBaselineHistory(environment);
      res.json({ success: true, count: history.length, data: history });
    } catch (err) {
      next(err);
    }
  },

  async createBaseline(req, res, next) {
    try {
      const { environment, name, resourceConfigurations } = req.body;
      const baseline = await baselineService.createBaseline({
        environment,
        name,
        resourceConfigurations,
        user: req.user
      });
      res.status(201).json({ success: true, data: baseline });
    } catch (err) {
      if (err.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  async initializeBaselineFromInventory(req, res, next) {
    try {
      const { environment, name } = req.body;
      const baseline = await baselineService.initializeBaselineFromInventory({
        environment,
        name,
        user: req.user
      });
      res.status(201).json({ success: true, data: baseline });
    } catch (err) {
      if (err.message.includes('Forbidden')) {
        return res.status(403).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  // Reconciliation Plans
  async previewReconciliationPlan(req, res, next) {
    try {
      const { driftId } = req.body;
      if (!driftId) {
        return res.status(400).json({ success: false, message: 'driftId is required.' });
      }
      const plan = await driftReconciliationService.previewReconciliationPlan({
        driftId,
        user: req.user
      });
      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  },

  async submitReconciliationRequest(req, res, next) {
    try {
      const { planId, reason } = req.body;
      if (!planId) {
        return res.status(400).json({ success: false, message: 'planId is required.' });
      }
      const result = await driftReconciliationService.submitReconciliationRequest({
        planId,
        user: req.user,
        reason
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (err.message.includes('Forbidden') || err.message.includes('Separation of Duties')) {
        return res.status(403).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  async getReconciliationPlan(req, res, next) {
    try {
      const plan = await driftGovernanceRepository.getReconciliationPlanById(req.params.id);
      if (!plan) {
        return res.status(404).json({ success: false, message: `Reconciliation plan '${req.params.id}' not found.` });
      }
      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }
};

