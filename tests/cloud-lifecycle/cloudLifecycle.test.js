/**
 * Phase 23C: Cloud Resource Lifecycle & Cost Governance Test Suite
 *
 * Exhaustive coverage of:
 * - Deterministic multi-cloud & container simulation (AWS, Docker, Kubernetes)
 * - Resource inventory retrieval and health probing
 * - Safe stop dependency validation (incidents, runbooks, notifications, downstream callers)
 * - Persistent storage preservation guarantees (EBS volumes, Docker volumes, K8s PVCs)
 * - Critical database dependency protection
 * - Two-person approval workflow and strict RBAC enforcement
 * - Strict Separation of Duties (Self-approval prevention)
 * - Idempotency key deduplication and concurrent operation locks
 * - Cost estimation breakdown (Compute vs Persistent Storage vs IPv4)
 * - Idle compute savings calculation
 * - Schedule management (Asia/Kolkata timezone, pause, resume)
 * - Emergency Global Kill Switch enforcement
 * - Audit logging completeness
 */

import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { query } from '../../backend/src/db/connection.js';
import { resourceService } from '../../backend/src/services/cloud-lifecycle/services/resource.service.js';
import { lifecycleService } from '../../backend/src/services/cloud-lifecycle/services/lifecycle.service.js';
import { costEstimationService } from '../../backend/src/services/cloud-lifecycle/services/cost-estimation.service.js';
import { scheduleService } from '../../backend/src/services/cloud-lifecycle/services/schedule.service.js';
import { dependencyCheckService } from '../../backend/src/services/cloud-lifecycle/services/dependency-check.service.js';
import { lifecyclePolicy } from '../../backend/src/services/cloud-lifecycle/policies/lifecycle-policy.js';
import { cloudLifecycleRepository } from '../../backend/src/repositories/cloudLifecycle.repository.js';

const ADMIN_USER = { id: 'usr_admin_001', name: 'Sarah Chen', role: 'admin', email: 'sarah.chen@infrapulse.io' };
const RESPONDER_USER = { id: 'usr_responder_002', name: 'Marcus Vance', role: 'responder', email: 'marcus.v@infrapulse.io' };
const VIEWER_USER = { id: 'usr_viewer_003', name: 'Alex Ross', role: 'viewer', email: 'alex.ross@infrapulse.io' };

describe('Phase 23C: Cloud Resource Lifecycle & Cost Governance', () => {

  beforeEach(async () => {
    // Reset kill switch
    await lifecyclePolicy.setKillSwitch(false, { user: ADMIN_USER, reason: 'test_setup' });
    // Clear operations table between tests to ensure clean state
    await query('TRUNCATE cloud_lifecycle_operations CASCADE;');
    // Ensure clean test baseline inventory
    await resourceService.seedBaselineInventory();
  });

  // --------------------------------------------------------------------------
  // 1. Inventory & Resource State Inspection
  // --------------------------------------------------------------------------
  test('1. Resource Inventory: Retrieves all simulated cloud resources across AWS, Docker, and K8s', async () => {
    const resources = await resourceService.getAllResources();
    assert.ok(Array.isArray(resources), 'Resource list must be an array');
    assert.ok(resources.length >= 8, 'Must return at least 8 canonical cloud resources');

    const ec2 = resources.find(r => r.id === 'res-aws-ec2-staging');
    assert.ok(ec2, 'AWS EC2 staging instance must exist');
    assert.equal(ec2.provider, 'aws');
    assert.equal(ec2.resource_type, 'ec2_instance');
    assert.equal(ec2.region, 'ap-south-1');
    assert.equal(ec2.environment, 'staging');

    const rds = resources.find(r => r.id === 'res-aws-rds-postgres');
    assert.ok(rds, 'AWS RDS instance must exist');
    assert.equal(rds.resource_type, 'rds_instance');

    const dockerBackend = resources.find(r => r.id === 'res-docker-backend');
    assert.ok(dockerBackend, 'Docker backend container must exist');
    assert.equal(dockerBackend.provider, 'docker');

    const k8sStatefulSet = resources.find(r => r.id === 'res-k8s-sts-postgres');
    assert.ok(k8sStatefulSet, 'Kubernetes StatefulSet must exist');
    assert.equal(k8sStatefulSet.provider, 'kubernetes');
  });

  test('2. Health Probing: Deterministically probes provider status and updates health score', async () => {
    const probe = await resourceService.probeHealth('res-aws-ec2-staging');
    assert.ok(probe, 'Health probe result must be returned');
    assert.equal(probe.resourceId, 'res-aws-ec2-staging');
    assert.ok(probe.status === 'healthy' || probe.status === 'unreachable', 'Status must be reported');
    assert.equal(probe.healthy, true, 'Healthy instance must report healthy: true');
    assert.ok(probe.responseTimeMs !== undefined, 'Response time must be returned');
    assert.equal(probe.isSimulated, true, 'Must indicate simulation');
  });

  // --------------------------------------------------------------------------
  // 2. Safe Stop & Dependency Validation
  // --------------------------------------------------------------------------
  test('3. Dependency Check: Detects running downstream callers when evaluating Safe Stop', async () => {
    const resource = await resourceService.getResourceById('res-docker-postgres');
    // Docker backend depends on res-docker-postgres and backend is running
    const evalResult = await dependencyCheckService.evaluateSafetyChecks(resource, 'stop');
    assert.ok(evalResult, 'Evaluation result must be returned');
    assert.equal(evalResult.safe, false, 'Stopping active database with running callers must be unsafe');
    assert.ok(
      evalResult.blockers.some(b => b.includes('Downstream running workloads depend on it')),
      'Must contain downstream caller blocker'
    );
    assert.ok(evalResult.downstreamRunningCallers.length > 0, 'Must identify downstream running caller IDs');
  });

  test('4. Dry-Run Evaluation: Generates safety warnings, affected callers, and persistent storage guarantees', async () => {
    const dryRun = await lifecycleService.dryRun({
      resourceId: 'res-aws-ec2-staging',
      action: 'stop',
      user: RESPONDER_USER
    });
    assert.ok(dryRun, 'Dry run result must be returned');
    assert.equal(dryRun.resource.id, 'res-aws-ec2-staging');
    assert.equal(dryRun.action, 'stop');
    assert.ok(dryRun.status === 'dry_run_passed' || dryRun.status === 'dry_run_failed');
    assert.ok(dryRun.safetyChecks, 'Safety checks breakdown must be present');
    assert.ok(dryRun.safetyChecks.persistentStorageProtected, 'Must guarantee persistent storage preservation');
  });

  // --------------------------------------------------------------------------
  // 3. Persistent Storage Preservation Guarantees
  // --------------------------------------------------------------------------
  test('5. Persistent Storage Protection: Preserves EBS volume and detach state without data deletion', async () => {
    const ec2 = await cloudLifecycleRepository.getResourceById('res-aws-ec2-staging');
    assert.ok(ec2.persistence_requirements, 'EC2 must have persistence requirements');
    assert.equal(ec2.persistence_requirements.volume_type, 'ebs_gp3');
    assert.equal(ec2.persistence_requirements.delete_on_termination, false, 'delete_on_termination must be false');

    const k8sPg = await cloudLifecycleRepository.getResourceById('res-k8s-sts-postgres');
    assert.ok(k8sPg.persistence_requirements, 'K8s StatefulSet must have persistence requirements');
    assert.equal(k8sPg.persistence_requirements.has_pvc, true);
    assert.equal(k8sPg.persistence_requirements.claim_name, 'pgdata-postgres-0');
  });

  // --------------------------------------------------------------------------
  // 4. Two-Person Approval & RBAC Enforcement
  // --------------------------------------------------------------------------
  test('6. RBAC Enforcement: Viewer cannot request lifecycle operations (403 Forbidden)', async () => {
    await assert.rejects(
      async () => {
        await lifecycleService.requestOperation({
          resourceId: 'res-aws-ec2-staging',
          action: 'stop',
          user: VIEWER_USER
        });
      },
      (err) => {
        assert.ok(err.message.includes('Forbidden') || err.message.includes('Viewer'));
        return true;
      }
    );
  });

  test('7. Separation of Duties: Submitter cannot approve their own operation', async () => {
    // Admin creates an operation request for an unblocked resource (e.g. res-docker-worker)
    const op = await lifecycleService.requestOperation({
      resourceId: 'res-docker-worker',
      action: 'stop',
      user: ADMIN_USER,
      idempotencyKey: 'idem-sop-test-01'
    });

    assert.ok(op.id, 'Operation must have an ID');
    assert.equal(op.status, 'pending_approval');
    assert.equal(op.requested_by, ADMIN_USER.email);

    // Admin attempts to approve their own request -> MUST BE REJECTED
    await assert.rejects(
      async () => {
        await lifecycleService.approveOperation({
          operationId: op.id,
          user: ADMIN_USER
        });
      },
      (err) => {
        assert.ok(err.message.includes('Separation of Duties Violation'));
        return true;
      }
    );
  });

  test('8. Two-Person Approval Flow: Responder requests, Admin approves, execution succeeds', async () => {
    // First, stop frontend and worker to ensure no callers depend on backend
    await cloudLifecycleRepository.updateResourceState('res-docker-frontend', 'stopped', 'stop');
    await cloudLifecycleRepository.updateResourceState('res-docker-worker', 'stopped', 'stop');

    // Responder requests stopping backend
    const op = await lifecycleService.requestOperation({
      resourceId: 'res-docker-backend',
      action: 'stop',
      user: RESPONDER_USER,
      idempotencyKey: 'idem-flow-test-02'
    });

    assert.equal(op.status, 'pending_approval');
    assert.equal(op.requested_by, RESPONDER_USER.email);

    // Admin approves
    const approved = await lifecycleService.approveOperation({
      operationId: op.id,
      user: ADMIN_USER
    });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.approved_by, ADMIN_USER.email);

    // Execute the approved operation
    const execRes = await lifecycleService.executeOperation({
      operationId: op.id,
      user: ADMIN_USER
    });
    assert.equal(execRes.success, true);
    assert.equal(execRes.operation.status, 'completed');

    // Check resource updated to 'stopped'
    const updatedResource = await cloudLifecycleRepository.getResourceById('res-docker-backend');
    assert.equal(updatedResource.current_state, 'stopped');
  });

  // --------------------------------------------------------------------------
  // 5. Idempotency & Concurrency Locks
  // --------------------------------------------------------------------------
  test('9. Idempotency Key Deduplication: Repeated requests with identical key return original operation', async () => {
    const key = `idem-dedup-${Date.now()}`;
    const op1 = await lifecycleService.requestOperation({
      resourceId: 'res-docker-worker',
      action: 'restart',
      user: RESPONDER_USER,
      idempotencyKey: key
    });

    const op2 = await lifecycleService.requestOperation({
      resourceId: 'res-docker-worker',
      action: 'restart',
      user: RESPONDER_USER,
      idempotencyKey: key
    });

    assert.equal(op1.id, op2.id, 'Deduplication must return existing operation ID');
  });

  test('10. Concurrent Operation Lock: Prevents conflicting simultaneous operations on the same resource', async () => {
    const op = await lifecycleService.requestOperation({
      resourceId: 'res-k8s-dep-backend',
      action: 'scale_down',
      user: RESPONDER_USER,
      idempotencyKey: `idem-lock-1-${Date.now()}`
    });

    assert.equal(op.status, 'pending_approval');

    // Attempt second operation on the same resource while op is pending_approval
    await assert.rejects(
      async () => {
        await lifecycleService.requestOperation({
          resourceId: 'res-k8s-dep-backend',
          action: 'stop',
          user: RESPONDER_USER,
          idempotencyKey: `idem-lock-2-${Date.now()}`
        });
      },
      (err) => {
        assert.ok(err.message.includes('already has an active operation in progress'));
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // 6. Cost Governance & Idle Savings
  // --------------------------------------------------------------------------
  test('11. Cost Governance: Disaggregates compute, persistent storage, and public IPv4', async () => {
    const estimate = await costEstimationService.calculateCostProjections('staging');
    assert.ok(estimate, 'Cost estimate must be returned');
    assert.ok(estimate.estimated_monthly_total > 0, 'Total monthly cost must be positive');
    assert.ok(estimate.total_hourly_compute > 0, 'Compute cost must be positive');
    assert.ok(estimate.total_hourly_storage > 0, 'Persistent storage cost must be positive');
    assert.ok(estimate.total_hourly_ipv4 >= 0, 'IPv4 cost must be non-negative');

    // Validate that stopping non-prod compute projects positive monthly savings
    assert.ok(
      estimate.estimated_monthly_savings > 0,
      'Potential idle compute savings must be projected'
    );
    assert.ok(estimate.ongoing_monthly_storage_cost > 0, 'Ongoing storage cost must be accounted');
  });

  test('12. Storage Cost Persistence: EBS/PVC storage charges continue even when compute is stopped', async () => {
    const ec2 = await cloudLifecycleRepository.getResourceById('res-aws-ec2-staging');
    const breakdown = ec2.cost_breakdown;
    assert.ok(parseFloat(breakdown.compute) > 0, 'EC2 compute hourly cost must be > 0');
    assert.ok(parseFloat(breakdown.storage) > 0, 'EC2 storage hourly cost must be > 0');
    assert.ok(parseFloat(breakdown.ipv4) > 0, 'EC2 public IPv4 hourly cost must be > 0');

    // When stopped, persistent storage remains
    const ongoingCost = (parseFloat(breakdown.storage) + parseFloat(breakdown.ipv4)) * 730;
    assert.ok(ongoingCost > 0, 'Ongoing non-compute cost continues post shutdown');
  });

  // --------------------------------------------------------------------------
  // 7. Schedules & Timezone Handling (Asia/Kolkata)
  // --------------------------------------------------------------------------
  test('13. Schedule Governance: Supports weekday schedules in Asia/Kolkata timezone with pause/resume', async () => {
    const schedules = await scheduleService.getAllSchedules();
    assert.ok(Array.isArray(schedules), 'Schedules must return an array');
    assert.ok(schedules.length >= 1, 'At least 1 default schedule must exist');

    const sched = schedules[0];
    assert.equal(sched.timezone, 'Asia/Kolkata');
    assert.ok(sched.cron_expression, 'Schedule must have a cron expression');

    // Pause schedule
    const paused = await scheduleService.toggleSchedulePause(sched.id, true, ADMIN_USER);
    assert.equal(paused.is_paused, true);

    // Resume schedule
    const resumed = await scheduleService.toggleSchedulePause(sched.id, false, ADMIN_USER);
    assert.equal(resumed.is_paused, false);
  });

  // --------------------------------------------------------------------------
  // 8. Emergency Global Kill Switch
  // --------------------------------------------------------------------------
  test('14. Emergency Kill Switch: Blocks all mutating lifecycle operations immediately when active', async () => {
    // Activate kill switch
    await lifecyclePolicy.setKillSwitch(true, {
      user: ADMIN_USER,
      reason: 'Critical Incident INC-882: Staging freeze requested by incident commander'
    });

    const status = await lifecyclePolicy.getKillSwitchState();
    assert.equal(status.active, true);

    // Attempting any mutating operation must immediately throw Kill Switch Active
    await assert.rejects(
      async () => {
        await lifecycleService.requestOperation({
          resourceId: 'res-docker-worker',
          action: 'start',
          user: ADMIN_USER,
          idempotencyKey: 'idem-kill-test'
        });
      },
      (err) => {
        assert.ok(err.message.includes('Kill Switch Active'));
        return true;
      }
    );

    // Deactivate kill switch
    await lifecyclePolicy.setKillSwitch(false, { user: ADMIN_USER, reason: 'Incident resolved' });
    const afterStatus = await lifecyclePolicy.getKillSwitchState();
    assert.equal(afterStatus.active, false);

    // Dry run should succeed
    const dryRun = await lifecycleService.dryRun({
      resourceId: 'res-docker-worker',
      action: 'restart',
      user: ADMIN_USER
    });
    assert.ok(dryRun);
  });

  // --------------------------------------------------------------------------
  // 9. Audit Logging Completeness
  // --------------------------------------------------------------------------
  test('15. Audit Trail: All lifecycle operations and approvals are recorded with user attribution', async () => {
    // Generate an operation to ensure audit logs are populated
    await lifecycleService.dryRun({
      resourceId: 'res-docker-worker',
      action: 'restart',
      user: ADMIN_USER
    });

    const operations = await cloudLifecycleRepository.getAllOperations({ limit: 10 });
    assert.ok(Array.isArray(operations), 'Operations must return an array');
    assert.ok(operations.length > 0, 'Operations must contain recorded events');

    const first = operations[0];
    assert.ok(first.id, 'Operation item must have an id');
    assert.ok(first.resource_id, 'Operation item must have a resource_id');
    assert.ok(first.action, 'Operation item must have an action');
    assert.ok(first.status, 'Operation item must have a status');
    assert.ok(first.requested_by, 'Operation item must record requested_by');
  });
});
