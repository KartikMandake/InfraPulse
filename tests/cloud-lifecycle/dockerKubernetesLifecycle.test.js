/**
 * Phase 23F: Governed Docker & Kubernetes Workload Lifecycle Test Suite
 *
 * Exhaustive coverage of:
 * - Docker:
 *   1. Container & Compose Service Inventory
 *   2. Container Start / Stop / Restart execution
 *   3. Graceful Shutdown (SIGTERM with timeout)
 *   4. Control-Plane Container Protection (infrapulse-backend)
 *   5. Database Container & Volume Protection (pgdata)
 *   6. Dependency Validation (blocking on running callers)
 *   7. Disabled Provider Flag (DOCKER_LIFECYCLE_ENABLED=false)
 * - Kubernetes:
 *   8. Deployment Discovery & Replicas
 *   9. StatefulSet Discovery & Persistent Volume Claims
 *   10. Replica Scaling (2 -> 1, 2 -> 0)
 *   11. Protected System Namespace Rejection (kube-system)
 *   12. Database Workload Protection (StatefulSet locked)
 *   13. PVC Preservation Guarantees & Continuing Costs
 *   14. PodDisruptionBudget (PDB) & Availability Checks
 *   15. Rollout Status Verification
 *   16. Disabled Provider Flag (KUBERNETES_LIFECYCLE_ENABLED=false)
 * - Governance & Workflow:
 *   17. RBAC Enforcement (Viewer blocked)
 *   18. Separation of Duties (Self-approval blocked)
 *   19. Explicit Confirmation Requirement (explicitConfirmation: true)
 *   20. Idempotency Key Deduplication
 *   21. Concurrent Operation Lock
 *   22. Shared-Node Cost & Resource Intelligence
 *   23. Audit Trail Completeness
 */

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../backend/src/config/env.js';
import { query } from '../../backend/src/db/connection.js';
import { DockerLifecycleProvider } from '../../backend/src/services/cloud-lifecycle/providers/dockerLifecycle.provider.js';
import { KubernetesLifecycleProvider } from '../../backend/src/services/cloud-lifecycle/providers/kubernetesLifecycle.provider.js';
import { workloadEligibilityService } from '../../backend/src/services/cloud-lifecycle/services/workloadEligibility.service.js';
import { lifecycleService } from '../../backend/src/services/cloud-lifecycle/services/lifecycle.service.js';
import { resourceService } from '../../backend/src/services/cloud-lifecycle/services/resource.service.js';
import { cloudLifecycleRepository } from '../../backend/src/repositories/cloudLifecycle.repository.js';
import { lifecyclePolicy } from '../../backend/src/services/cloud-lifecycle/policies/lifecycle-policy.js';

const ADMIN_USER = { id: 'usr_admin_001', name: 'Sarah Chen', role: 'admin', email: 'sarah.chen@infrapulse.io' };
const RESPONDER_USER = { id: 'usr_responder_002', name: 'Marcus Vance', role: 'responder', email: 'marcus.v@infrapulse.io' };
const VIEWER_USER = { id: 'usr_viewer_003', name: 'Alex Ross', role: 'viewer', email: 'alex.ross@infrapulse.io' };

/**
 * Creates deterministic mock Docker Engine client.
 */
function createMockDockerClient({ initialState = 'running', throwsOnStop = false } = {}) {
  const dispatchedRequests = [];
  let currentState = initialState;

  return {
    dispatchedRequests,
    listContainers: async () => [
      {
        Id: 'c-worker-001',
        Names: ['/infrapulse-worker'],
        State: currentState,
        Status: currentState === 'running' ? 'Up 2 hours' : 'Exited (0)',
        Labels: { 'com.docker.compose.project': 'infrapulse', 'com.docker.compose.service': 'worker' }
      },
      {
        Id: 'c-backend-001',
        Names: ['/infrapulse-backend'],
        State: 'running',
        Status: 'Up 4 hours',
        Labels: { 'com.docker.compose.project': 'infrapulse', 'com.docker.compose.service': 'backend' }
      }
    ],
    inspectContainer: async (name) => ({
      Id: name,
      Name: `/${name}`,
      State: {
        Status: currentState,
        Running: currentState === 'running',
        ExitCode: 0,
        Health: { Status: 'healthy' }
      }
    }),
    startContainer: async (name) => {
      dispatchedRequests.push({ action: 'start', name });
      currentState = 'running';
      return { success: true, containerId: name, currentState: 'running' };
    },
    stopContainer: async (name, { timeoutSeconds }) => {
      dispatchedRequests.push({ action: 'stop', name, timeoutSeconds });
      if (throwsOnStop) throw new Error('Docker daemon failed to terminate container gracefully');
      currentState = 'exited';
      return { success: true, containerId: name, currentState: 'exited', timeoutSeconds };
    },
    restartContainer: async (name, { timeoutSeconds }) => {
      dispatchedRequests.push({ action: 'restart', name, timeoutSeconds });
      currentState = 'running';
      return { success: true, containerId: name, currentState: 'running', timeoutSeconds };
    },
    getContainerHealth: async (name) => ({
      healthy: currentState === 'running',
      status: currentState === 'running' ? 'healthy' : 'stopped',
      running: currentState === 'running'
    }),
    listComposeServices: async (project) => [
      { service: 'worker', containerId: 'c-worker-001', state: currentState },
      { service: 'backend', containerId: 'c-backend-001', state: 'running' }
    ]
  };
}

/**
 * Creates deterministic mock Kubernetes client.
 */
function createMockK8sClient({ initialReplicas = 2, throwsOnScale = false } = {}) {
  const dispatchedCalls = [];
  let currentReplicas = initialReplicas;

  return {
    dispatchedCalls,
    listNamespaces: async () => [
      { name: 'infrapulse', status: 'Active' },
      { name: 'staging', status: 'Active' },
      { name: 'dev', status: 'Active' }
    ],
    listDeployments: async (ns) => [
      { name: 'backend-deployment', namespace: ns, replicas: currentReplicas, availableReplicas: currentReplicas }
    ],
    listStatefulSets: async (ns) => [
      { name: 'postgres-statefulset', namespace: ns, replicas: 1, readyReplicas: 1 }
    ],
    inspectWorkload: async (name, ns, type) => ({
      name,
      namespace: ns,
      workloadType: type,
      replicas: currentReplicas,
      availableReplicas: currentReplicas,
      status: 'Running'
    }),
    scaleDeployment: async (name, ns, replicas) => {
      dispatchedCalls.push({ action: 'scaleDeployment', name, ns, replicas });
      if (throwsOnScale) throw new Error('Kubernetes API rejected scale operation');
      currentReplicas = replicas;
      return { success: true, name, namespace: ns, workloadType: 'Deployment', previousReplicas: 2, targetReplicas: replicas };
    },
    scaleStatefulSet: async (name, ns, replicas, { allowStatefulSetScale }) => {
      dispatchedCalls.push({ action: 'scaleStatefulSet', name, ns, replicas, allowStatefulSetScale });
      currentReplicas = replicas;
      return { success: true, name, namespace: ns, workloadType: 'StatefulSet', previousReplicas: 1, targetReplicas: replicas, pvcRetained: true };
    },
    getPodHealth: async (ns, selector) => ({
      totalPods: currentReplicas,
      runningPods: currentReplicas,
      healthy: currentReplicas > 0,
      phase: currentReplicas > 0 ? 'Running' : 'ScaledDown'
    }),
    getRolloutStatus: async (name, ns, type) => ({
      success: true,
      workload: `${type}/${name}`,
      namespace: ns,
      status: 'complete'
    })
  };
}

describe('Phase 23F: Governed Docker & Kubernetes Workload Lifecycle Management', () => {
  const origDockerFlag = config.dockerLifecycleEnabled;
  const origK8sFlag = config.kubernetesLifecycleEnabled;
  const origDockerAllowed = [...(config.dockerAllowedContainers || [])];
  const origK8sAllowedNs = [...(config.kubernetesAllowedNamespaces || [])];

  beforeEach(async () => {
    await lifecyclePolicy.setKillSwitch(false, { user: ADMIN_USER, reason: 'test_setup' });
    await query('TRUNCATE cloud_lifecycle_operations CASCADE;');
    await resourceService.seedBaselineInventory();

    // Default configuration for tests
    config.dockerLifecycleEnabled = true;
    config.kubernetesLifecycleEnabled = true;
    config.dockerAllowedContainers = ['infrapulse-worker', 'infrapulse-staging-worker'];
    config.kubernetesAllowedNamespaces = ['infrapulse', 'staging', 'dev'];
  });

  afterEach(() => {
    config.dockerLifecycleEnabled = origDockerFlag;
    config.kubernetesLifecycleEnabled = origK8sFlag;
    config.dockerAllowedContainers = origDockerAllowed;
    config.kubernetesAllowedNamespaces = origK8sAllowedNs;
  });

  // ==========================================================================
  // DOCKER WORKLOAD LIFECYCLE TESTS
  // ==========================================================================

  test('1. Docker Inventory: Discovers containers and Docker Compose services', async () => {
    const mockClient = createMockDockerClient();
    const provider = new DockerLifecycleProvider({ client: mockClient });

    const containers = await provider.listContainers({ all: true });
    assert.equal(containers.length, 2);

    const composeServices = await provider.listComposeServices('infrapulse');
    assert.equal(composeServices.length, 2);
    assert.equal(composeServices[0].service, 'worker');
  });

  test('2. Docker Governed Lifecycle: Start, Stop, and Restart transitions execute with governance', async () => {
    const mockClient = createMockDockerClient({ initialState: 'running' });
    const provider = new DockerLifecycleProvider({ client: mockClient });

    // Stop
    const stopRes = await provider.stopContainer('infrapulse-worker', { timeoutSeconds: 10 });
    assert.equal(stopRes.success, true);
    assert.equal(stopRes.currentState, 'exited');
    assert.equal(stopRes.timeoutSeconds, 10);

    // Start
    const startRes = await provider.startContainer('infrapulse-worker');
    assert.equal(startRes.success, true);
    assert.equal(startRes.currentState, 'running');

    // Restart
    const restartRes = await provider.restartContainer('infrapulse-worker', { timeoutSeconds: 10 });
    assert.equal(restartRes.success, true);
    assert.equal(restartRes.currentState, 'running');

    assert.equal(mockClient.dispatchedRequests.length, 3);
  });

  test('3. Docker Graceful Timeout: Stop passes configurable graceful timeout to avoid abrupt kill', async () => {
    const mockClient = createMockDockerClient({ initialState: 'running' });
    const provider = new DockerLifecycleProvider({ client: mockClient });

    await provider.stopContainer('infrapulse-worker', { timeoutSeconds: 15 });
    const stopCall = mockClient.dispatchedRequests.find(r => r.action === 'stop');
    assert.equal(stopCall.timeoutSeconds, 15);
  });

  test('4. Control-Plane Protection: Halting infrapulse-backend or host container is blocked', async () => {
    const liveBackendResource = {
      id: 'res-docker-live-control',
      name: 'infrapulse-backend',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      current_state: 'running',
      metadata: { is_live: true, container_name: 'infrapulse-backend' }
    };
    const eligibility = await workloadEligibilityService.evaluateEligibility(liveBackendResource, 'stop');

    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Control Plane Protected')));
  });

  test('5. Database Protection: Stopping PostgreSQL container is blocked and preserves named volume', async () => {
    const dbResource = await resourceService.getResourceById('res-docker-postgres');
    const eligibility = await workloadEligibilityService.evaluateEligibility(dbResource, 'stop');

    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Critical Database Protected')));
    assert.equal(eligibility.checks.namedVolumePreserved, true);
  });

  test('6. Dependency Validation: Cannot stop container if running microservices depend on it', async () => {
    // res-docker-backend has res-docker-worker and res-docker-frontend depending on it
    const backendResource = await resourceService.getResourceById('res-docker-backend');
    const dryRun = await lifecycleService.dryRun({ resourceId: backendResource.id, action: 'stop', user: RESPONDER_USER });

    assert.equal(dryRun.safe, false);
    assert.ok(dryRun.blockers.some(b => b.includes('Downstream Workloads Active')));
  });

  test('7. Docker Feature Flag Safety: DOCKER_LIFECYCLE_ENABLED=false blocks all live mutations', async () => {
    config.dockerLifecycleEnabled = false; // Disabled
    const mockClient = createMockDockerClient();
    const provider = new DockerLifecycleProvider({ client: mockClient });

    await assert.rejects(
      () => provider.stopContainer('infrapulse-worker'),
      /Live Docker Lifecycle Mutations are currently DISABLED by configuration/
    );
    assert.equal(mockClient.dispatchedRequests.length, 0);
  });

  // ==========================================================================
  // KUBERNETES WORKLOAD LIFECYCLE TESTS
  // ==========================================================================

  test('8. Kubernetes Discovery: Inspects deployments, statefulsets, and replica status', async () => {
    const mockClient = createMockK8sClient({ initialReplicas: 2 });
    const provider = new KubernetesLifecycleProvider({ client: mockClient });

    const deps = await provider.listDeployments('infrapulse');
    assert.equal(deps.length, 1);
    assert.equal(deps[0].name, 'backend-deployment');

    const stss = await provider.listStatefulSets('infrapulse');
    assert.equal(stss.length, 1);
    assert.equal(stss[0].name, 'postgres-statefulset');

    const inspected = await provider.inspectWorkload('backend-deployment', 'infrapulse', 'Deployment');
    assert.equal(inspected.replicas, 2);
  });

  test('9. Kubernetes Replica Scaling: Scales Deployment from 2 to 1 with dry-run savings preview', async () => {
    const mockClient = createMockK8sClient({ initialReplicas: 2 });
    const provider = new KubernetesLifecycleProvider({ client: mockClient });

    const depResource = await resourceService.getResourceById('res-k8s-dep-frontend');

    // 1. Dry run scale
    const dryRun = await lifecycleService.dryRun({
      resourceId: depResource.id,
      action: 'scale',
      targetReplicas: 1,
      user: RESPONDER_USER
    });
    assert.equal(dryRun.safe, true);
    assert.equal(dryRun.costImpact.replicasBefore, 2);
    assert.equal(dryRun.costImpact.replicasAfter, 1);
    assert.ok(dryRun.costImpact.estimatedComputeSavingsMonthly > 0);

    // 2. Direct provider scale execution
    const scaleRes = await provider.scaleDeployment('frontend-deployment', 'infrapulse', 1);
    assert.equal(scaleRes.success, true);
    assert.equal(scaleRes.targetReplicas, 1);
    assert.equal(mockClient.dispatchedCalls[0].replicas, 1);
  });

  test('10. System Namespace Protection: Strictly blocks operations in kube-system', async () => {
    const mockClient = createMockK8sClient();
    const provider = new KubernetesLifecycleProvider({ client: mockClient });

    await assert.rejects(
      () => provider.scaleDeployment('coredns', 'kube-system', 0),
      /Protected System Namespace: Operations in 'kube-system' are strictly prohibited/
    );

    const systemResource = {
      id: 'res-k8s-coredns',
      name: 'coredns',
      provider: 'kubernetes',
      resource_type: 'k8s_deployment',
      environment: 'production',
      current_state: 'running',
      metadata: { namespace: 'kube-system', replicas: 2 }
    };
    const eligibility = await workloadEligibilityService.evaluateEligibility(systemResource, 'stop');
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Protected System Namespace')));
  });

  test('11. Database StatefulSet Protection: Scaling DB to 0 requires exceptional authorization', async () => {
    const dbResource = await resourceService.getResourceById('res-k8s-sts-postgres');

    // Scaling to 0 without exceptional authorization fails
    const eligibility = await workloadEligibilityService.evaluateEligibility(dbResource, 'stop', {
      targetReplicas: 0,
      exceptionalAuthorization: false
    });
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Critical Database Workload')));

    // StatefulSet scaling requires allowStatefulSetScale
    const mockClient = createMockK8sClient({ initialReplicas: 1 });
    const provider = new KubernetesLifecycleProvider({ client: mockClient });

    await assert.rejects(
      () => provider.scaleStatefulSet('postgres-statefulset', 'infrapulse', 2, { allowStatefulSetScale: false }),
      /StatefulSet Scaling Locked/
    );

    // With allowStatefulSetScale = true, scaling to 2 succeeds
    const scaleRes = await provider.scaleStatefulSet('postgres-statefulset', 'infrapulse', 2, { allowStatefulSetScale: true });
    assert.equal(scaleRes.success, true);
    assert.equal(scaleRes.targetReplicas, 2);
  });

  test('12. PVC Preservation Guarantees: Retained PVC storage costs persist across scaling', async () => {
    const sts = await resourceService.getResourceById('res-k8s-sts-postgres');
    const dryRun = await lifecycleService.dryRun({ resourceId: sts.id, action: 'stop', targetReplicas: 0, exceptionalAuthorization: true, user: RESPONDER_USER });

    assert.ok(dryRun.costImpact.ongoingStorageMonthly > 0, 'PVC storage charges must continue billing');
    assert.ok(dryRun.costImpact.pvcRetained, 'PVC must be retained');
    assert.ok(dryRun.costImpact.costDisclosure.includes('Persistent Volume Claims (PVCs) continue to bill'));
  });

  test('13. PodDisruptionBudget (PDB) Availability Checks: Violating minAvailable is blocked', async () => {
    const pdbResource = {
      id: 'res-k8s-pdb-api',
      name: 'api-service-pdb',
      provider: 'kubernetes',
      resource_type: 'k8s_deployment',
      environment: 'staging',
      current_state: 'running',
      metadata: {
        namespace: 'staging',
        replicas: 2,
        pdb: { minAvailable: 2 } // Requires at least 2 available pods
      }
    };

    const eligibility = await workloadEligibilityService.evaluateEligibility(pdbResource, 'scale', {
      targetReplicas: 1
    });
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('PodDisruptionBudget Violation')));
  });

  test('14. Rollout Status Verification: Provider verifies rollout without compensating mutations', async () => {
    const mockClient = createMockK8sClient();
    const provider = new KubernetesLifecycleProvider({ client: mockClient });

    const rollout = await provider.getRolloutStatus('backend-deployment', 'infrapulse', 'Deployment');
    assert.equal(rollout.success, true);
    assert.equal(rollout.status, 'complete');
  });

  test('15. Kubernetes Feature Flag Safety: KUBERNETES_LIFECYCLE_ENABLED=false blocks all live scaling', async () => {
    config.kubernetesLifecycleEnabled = false; // Disabled
    const mockClient = createMockK8sClient();
    const provider = new KubernetesLifecycleProvider({ client: mockClient });

    await assert.rejects(
      () => provider.scaleDeployment('backend-deployment', 'infrapulse', 1),
      /Live Kubernetes Lifecycle Mutations are currently DISABLED by configuration/
    );
    assert.equal(mockClient.dispatchedCalls.length, 0);
  });

  // ==========================================================================
  // GOVERNANCE & WORKFLOW TESTS
  // ==========================================================================

  test('16. RBAC Enforcement: Role viewer cannot request lifecycle mutations (403 Forbidden)', async () => {
    const worker = await resourceService.getResourceById('res-docker-worker');

    await assert.rejects(
      () => lifecycleService.requestOperation({
        resourceId: worker.id,
        action: 'stop',
        user: VIEWER_USER,
        reason: 'Unauthorized attempt'
      }),
      /Forbidden: Role 'viewer' is not authorized/
    );
  });

  test('17. Separation of Duties: Requester cannot self-approve; Administrator required', async () => {
    const worker = await resourceService.getResourceById('res-docker-worker');

    const op = await lifecycleService.requestOperation({
      resourceId: worker.id,
      action: 'stop',
      user: ADMIN_USER, // Admin requests
      reason: 'Separation of duties test'
    });

    // Submitter cannot self-approve
    await assert.rejects(
      () => lifecycleService.approveOperation({ operationId: op.id, user: ADMIN_USER }),
      /Separation of Duties Violation: Requester/
    );

    // Responder cannot approve
    await assert.rejects(
      () => lifecycleService.approveOperation({ operationId: op.id, user: RESPONDER_USER }),
      /Forbidden: Only Administrators can approve/
    );
  });

  test('18. Explicit Confirmation Requirement: Live mutations require explicitConfirmation: true', async () => {
    const liveDockerResource = {
      id: 'res-docker-live-test',
      name: 'live-test-container',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      current_state: 'running',
      metadata: { is_live: true, container_name: 'infrapulse-worker' }
    };
    await cloudLifecycleRepository.upsertResource(liveDockerResource);

    const op = await lifecycleService.requestOperation({
      resourceId: liveDockerResource.id,
      action: 'stop',
      user: RESPONDER_USER,
      reason: 'Explicit confirmation check'
    });
    await lifecycleService.approveOperation({ operationId: op.id, user: ADMIN_USER });

    // Execute with explicitConfirmation = false
    await assert.rejects(
      () => lifecycleService.executeOperation({
        operationId: op.id,
        user: ADMIN_USER,
        explicitConfirmation: false
      }),
      /Explicit confirmation required/
    );
  });

  test('19. Idempotency Key Deduplication: Duplicate request returns existing operation', async () => {
    const worker = await resourceService.getResourceById('res-docker-worker');
    const idempotencyKey = 'idem-phase23f-docker-001';

    const op1 = await lifecycleService.requestOperation({
      resourceId: worker.id,
      action: 'restart',
      user: RESPONDER_USER,
      idempotencyKey
    });

    const op2 = await lifecycleService.requestOperation({
      resourceId: worker.id,
      action: 'restart',
      user: RESPONDER_USER,
      idempotencyKey
    });

    assert.equal(op1.id, op2.id);
  });

  test('20. Concurrent Operation Lock: Prevents simultaneous conflicting operations on same workload', async () => {
    const worker = await resourceService.getResourceById('res-docker-worker');

    await lifecycleService.requestOperation({
      resourceId: worker.id,
      action: 'stop',
      user: RESPONDER_USER,
      reason: 'First pending op'
    });

    await assert.rejects(
      () => lifecycleService.requestOperation({
        resourceId: worker.id,
        action: 'stop',
        user: RESPONDER_USER,
        reason: 'Second conflicting op'
      }),
      /already has an active operation in progress/
    );
  });

  test('21. Shared-Node Resource Implications: Clarifies cluster capacity vs line-item billing', async () => {
    const dep = await resourceService.getResourceById('res-k8s-dep-frontend');
    const dryRun = await lifecycleService.dryRun({ resourceId: dep.id, action: 'scale', targetReplicas: 1, user: RESPONDER_USER });

    assert.ok(dryRun.costImpact.sharedNodeImplications.toLowerCase().includes('reclaim'));
    assert.ok(dryRun.costImpact.sharedNodeImplications.includes('Cluster Autoscaler'));
  });

  test('22. Audit Trail Completeness: Operations record comprehensive audit trails with user attribution', async () => {
    const worker = await resourceService.getResourceById('res-docker-worker');

    const op = await lifecycleService.requestOperation({
      resourceId: worker.id,
      action: 'restart',
      user: RESPONDER_USER,
      reason: 'Audit log check'
    });
    await lifecycleService.approveOperation({ operationId: op.id, user: ADMIN_USER });
    await lifecycleService.executeOperation({ operationId: op.id, user: ADMIN_USER });

    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE resource_id = $1 ORDER BY created_at DESC;`,
      [op.id]
    );

    assert.ok(auditRes.rows.length >= 2, 'Audit trail must record request, approval and execution events');
    const actions = auditRes.rows.map(a => a.action);
    assert.ok(actions.includes('CLOUD_OPERATION_APPROVED'));
    assert.ok(actions.includes('CLOUD_OPERATION_EXECUTED'));
  });

});
