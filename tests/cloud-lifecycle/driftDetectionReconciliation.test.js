/**
 * Phase 23G: Infrastructure Drift Detection & Reconciliation Intelligence Test Suite
 *
 * Exhaustive coverage of:
 *  1. State Snapshot Creation & Normalization
 *  2. Deterministic SHA-256 Configuration Hashing (order-independent, volatile fields stripped)
 *  3. Desired-State Baseline Creation, Versioning, and Updates
 *  4. Configuration Drift Detection (Field-level deltas)
 *  5. Workload State Drift Detection (running vs stopped)
 *  6. Replica Mismatch Drift Detection (desired != actual)
 *  7. Missing Resource Detection (in baseline, missing from runtime)
 *  8. Unexpected Addition Detection (in runtime, not in baseline)
 *  9. Idempotent Drift Deduplication & Observation Counter
 * 10. Auto-Reconciliation of Resolved Drift
 * 11. Explainable Severity Classifier (Critical, High, Medium, Low rules)
 * 12. Dependency Impact Analysis (Blast radius & downstream callers)
 * 13. Governed Reconciliation Plan Generation (Step-by-step actions)
 * 14. Safety Guardrails (No auto-delete, no PVC deletion, manual intervention flag)
 * 15. Reconciliation Submission & Separation of Duties (Two-person approval)
 * 16. Drift Event Lifecycle (Acknowledge, Ignore, Reconciled)
 * 17. Multi-Tenant Isolation
 */

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { query } from '../../backend/src/db/connection.js';
import { snapshotService } from '../../backend/src/services/cloud-lifecycle/services/snapshot.service.js';
import { baselineService } from '../../backend/src/services/cloud-lifecycle/services/baseline.service.js';
import { driftDetectionService } from '../../backend/src/services/cloud-lifecycle/services/driftDetection.service.js';
import { driftSeverityClassifier } from '../../backend/src/services/cloud-lifecycle/services/driftSeverity.service.js';
import { driftReconciliationService } from '../../backend/src/services/cloud-lifecycle/services/driftReconciliation.service.js';
import { driftGovernanceRepository } from '../../backend/src/repositories/driftGovernance.repository.js';
import { lifecycleService } from '../../backend/src/services/cloud-lifecycle/services/lifecycle.service.js';

const ADMIN_USER = { id: 'usr_admin_001', name: 'Sarah Chen', role: 'admin', email: 'sarah.chen@infrapulse.io' };
const ADMIN_USER_2 = { id: 'usr_admin_002', name: 'Marcus Vance', role: 'admin', email: 'marcus.v@infrapulse.io' };
const RESPONDER_USER = { id: 'usr_responder_003', name: 'James Kim', role: 'responder', email: 'james.kim@infrapulse.io' };
const VIEWER_USER = { id: 'usr_viewer_004', name: 'Alex Ross', role: 'viewer', email: 'alex.ross@infrapulse.io' };

describe('Phase 23G: Infrastructure Drift Detection & Reconciliation Intelligence', () => {

  beforeEach(async () => {
    // Reset test drift and baseline state
    await query(`DELETE FROM cloud_reconciliation_plans WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
    await query(`DELETE FROM cloud_drift_events WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
    await query(`DELETE FROM cloud_state_snapshots WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
    await query(`DELETE FROM cloud_desired_state_baselines WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
    await query(`DELETE FROM cloud_lifecycle_operations WHERE resource_id LIKE '%payment%' OR resource_id LIKE '%order%' OR resource_id LIKE '%worker%' OR resource_id LIKE '%cache%' OR resource_id LIKE '%doc%'`);
  });

  afterEach(async () => {
    await query(`DELETE FROM cloud_reconciliation_plans WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
    await query(`DELETE FROM cloud_drift_events WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
    await query(`DELETE FROM cloud_state_snapshots WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
    await query(`DELETE FROM cloud_desired_state_baselines WHERE tenant_id IN ('default_tenant', 'tenant_other')`);
  });

  // ---------------------------------------------------------------------------
  // 1. STATE SNAPSHOT CREATION & NORMALIZATION
  // ---------------------------------------------------------------------------
  test('1. Normalizes resource configuration stripping volatile runtime timestamps', () => {
    const rawMetadata = {
      image: 'infrapulse-payment:v1.2.0',
      replicas: 3,
      last_observed_at: '2026-10-31T12:00:00Z',
      creationTimestamp: '2026-10-01T00:00:00Z',
      generation: 42,
      restartCount: 3,
      status: {
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'True', lastTransitionTime: '2026-10-31T11:00:00Z' }]
      },
      env: { DB_HOST: 'postgres.internal', PORT: '5000' }
    };

    const normalized = snapshotService.normalizeResourceConfig('kubernetes', 'k8s_deployment', rawMetadata);

    assert.equal(normalized.image, 'infrapulse-payment:v1.2.0');
    assert.equal(normalized.replicas, 3);
    assert.deepEqual(normalized.env, { DB_HOST: 'postgres.internal', PORT: '5000' });

    // Volatile runtime keys must be stripped
    assert.equal(normalized.last_observed_at, undefined);
    assert.equal(normalized.creationTimestamp, undefined);
    assert.equal(normalized.generation, undefined);
    assert.equal(normalized.restartCount, undefined);
    assert.equal(normalized.status?.conditions, undefined);
  });

  // ---------------------------------------------------------------------------
  // 2. DETERMINISTIC CONFIGURATION HASHING
  // ---------------------------------------------------------------------------
  test('2. Computes deterministic SHA-256 hash regardless of object key order', () => {
    const objA = {
      name: 'infrapulse-api',
      replicas: 2,
      environment: 'staging',
      config: { port: 8080, logging: 'json' }
    };

    const objB = {
      environment: 'staging',
      config: { logging: 'json', port: 8080 },
      replicas: 2,
      name: 'infrapulse-api'
    };

    const hashA = snapshotService.computeConfigHash(objA);
    const hashB = snapshotService.computeConfigHash(objB);

    assert.equal(typeof hashA, 'string');
    assert.equal(hashA.length, 64);
    assert.equal(hashA, hashB, 'Hashes must be identical regardless of key insertion order');

    // Modifying a non-volatile field must alter hash
    const objC = { ...objA, replicas: 3 };
    const hashC = snapshotService.computeConfigHash(objC);
    assert.notEqual(hashA, hashC, 'Changing non-volatile field must change the hash');
  });

  // ---------------------------------------------------------------------------
  // 3. BASELINE CREATION & VERSIONING
  // ---------------------------------------------------------------------------
  test('3. Manages baseline lifecycle, version increments, and resource update', async () => {
    const initialResources = [
      {
        resource_id: 'deploy-payment',
        resource_name: 'Payment Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 3, image: 'payment:v1.0' }
      },
      {
        resource_id: 'container-worker',
        resource_name: 'Background Worker',
        resource_type: 'docker_container',
        provider: 'docker',
        state: 'running',
        metadata: { image: 'worker:v2.1' }
      }
    ];

    // Create v1
    const baselineV1 = await baselineService.createBaseline('staging', initialResources, ADMIN_USER);
    assert.equal(baselineV1.version, 1);
    assert.equal(baselineV1.is_active, true);
    assert.equal(Object.keys(baselineV1.resources).length, 2);

    // Active baseline check
    const active = await baselineService.getActiveBaseline('staging');
    assert.equal(active.id, baselineV1.id);
    assert.equal(active.version, 1);

    // Update resource in baseline -> creates v2
    const updated = await baselineService.updateResourceInBaseline(
      'staging',
      'deploy-payment',
      { replicas: 5, image: 'payment:v1.1' },
      ADMIN_USER
    );

    assert.equal(updated.version, 2);
    assert.equal(updated.is_active, true);
    assert.equal(updated.resources['deploy-payment'].config.replicas, 5);

    // Old baseline v1 should now be marked inactive
    const v1Query = await query(`SELECT is_active FROM cloud_desired_state_baselines WHERE id = $1`, [baselineV1.id]);
    assert.equal(v1Query.rows[0].is_active, false);
  });

  // ---------------------------------------------------------------------------
  // 4. CONFIGURATION DRIFT DETECTION
  // ---------------------------------------------------------------------------
  test('4. Detects configuration drift on modified fields', async () => {
    // 1. Establish baseline
    const baselineResources = [
      {
        resource_id: 'deploy-payment',
        resource_name: 'Payment Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 3, image: 'payment:v1.0.0', cpu: '500m' }
      }
    ];
    await baselineService.createBaseline('staging', baselineResources, ADMIN_USER);

    // 2. Live snapshot with modified image tag and cpu
    const liveResources = [
      {
        resource_id: 'deploy-payment',
        resource_name: 'Payment Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 3, image: 'payment:v1.1.0-unauthorized', cpu: '1000m' }
      }
    ];

    const result = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: liveResources
    });

    assert.equal(result.driftsDetectedCount, 1);
    const drift = result.drifts[0];
    assert.equal(drift.drift_type, 'CONFIGURATION_DRIFT');
    assert.equal(drift.resource_id, 'deploy-payment');

    const fields = drift.changed_fields;
    assert.ok(fields.some(f => f.field === 'image' && f.expected === 'payment:v1.0.0' && f.actual === 'payment:v1.1.0-unauthorized'));
    assert.ok(fields.some(f => f.field === 'cpu' && f.expected === '500m' && f.actual === '1000m'));
  });

  // ---------------------------------------------------------------------------
  // 5. WORKLOAD STATE DRIFT DETECTION
  // ---------------------------------------------------------------------------
  test('5. Detects workload state drift when expected running workload is stopped', async () => {
    await baselineService.createBaseline('staging', [
      {
        resource_id: 'docker-cache',
        resource_name: 'Redis Cache',
        resource_type: 'docker_container',
        provider: 'docker',
        state: 'running',
        metadata: { image: 'redis:7.0-alpine' }
      }
    ], ADMIN_USER);

    const liveResources = [
      {
        resource_id: 'docker-cache',
        resource_name: 'Redis Cache',
        resource_type: 'docker_container',
        provider: 'docker',
        state: 'stopped',
        metadata: { image: 'redis:7.0-alpine' }
      }
    ];

    const result = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: liveResources
    });

    assert.equal(result.driftsDetectedCount, 1);
    const drift = result.drifts[0];
    assert.equal(drift.drift_type, 'WORKLOAD_STATE_DRIFT');
    assert.equal(drift.expected_state, 'running');
    assert.equal(drift.actual_state, 'stopped');
  });

  // ---------------------------------------------------------------------------
  // 6. REPLICA MISMATCH DRIFT DETECTION
  // ---------------------------------------------------------------------------
  test('6. Detects replica mismatch between baseline and actual pods', async () => {
    await baselineService.createBaseline('staging', [
      {
        resource_id: 'deploy-order-service',
        resource_name: 'Order Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 4, image: 'orders:v2.0' }
      }
    ], ADMIN_USER);

    const liveResources = [
      {
        resource_id: 'deploy-order-service',
        resource_name: 'Order Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 1, image: 'orders:v2.0' }
      }
    ];

    const result = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: liveResources
    });

    assert.equal(result.driftsDetectedCount, 1);
    const drift = result.drifts[0];
    assert.equal(drift.drift_type, 'REPLICA_MISMATCH');
    assert.equal(drift.severity, 'medium');
    assert.ok(drift.changed_fields.some(f => f.field === 'replicas' && f.expected === 4 && f.actual === 1));
  });

  // ---------------------------------------------------------------------------
  // 7. MISSING RESOURCE DETECTION
  // ---------------------------------------------------------------------------
  test('7. Detects missing resource when registered baseline workload is deleted from runtime', async () => {
    await baselineService.createBaseline('staging', [
      {
        resource_id: 'deploy-audit',
        resource_name: 'Audit Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 2 }
      }
    ], ADMIN_USER);

    // Live inventory is empty
    const result = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: []
    });

    assert.equal(result.driftsDetectedCount, 1);
    const drift = result.drifts[0];
    assert.equal(drift.drift_type, 'MISSING_RESOURCE');
    assert.equal(drift.resource_id, 'deploy-audit');
    assert.equal(drift.actual_state, 'missing');
    assert.equal(drift.actual_hash, 'MISSING');
  });

  // ---------------------------------------------------------------------------
  // 8. UNEXPECTED ADDITION DETECTION
  // ---------------------------------------------------------------------------
  test('8. Detects unexpected untracked workload added outside baseline', async () => {
    await baselineService.createBaseline('staging', [], ADMIN_USER);

    const liveResources = [
      {
        resource_id: 'untracked-miner-container',
        resource_name: 'Crypto Miner Rogue',
        resource_type: 'docker_container',
        provider: 'docker',
        state: 'running',
        metadata: { image: 'suspicious/miner:latest' }
      }
    ];

    const result = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: liveResources
    });

    assert.equal(result.driftsDetectedCount, 1);
    const drift = result.drifts[0];
    assert.equal(drift.drift_type, 'UNEXPECTED_ADDITION');
    assert.equal(drift.resource_id, 'untracked-miner-container');
    assert.equal(drift.expected_state, 'not_present');
  });

  // ---------------------------------------------------------------------------
  // 9. IDEMPOTENT DRIFT DEDUPLICATION & OBSERVATION COUNTER
  // ---------------------------------------------------------------------------
  test('9. Increments observation_count and updates timestamp without duplicate records', async () => {
    await baselineService.createBaseline('staging', [
      {
        resource_id: 'deploy-payment',
        resource_name: 'Payment Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 3 }
      }
    ], ADMIN_USER);

    const liveResources = [
      {
        resource_id: 'deploy-payment',
        resource_name: 'Payment Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 1 }
      }
    ];

    // Scan 1
    const run1 = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: liveResources
    });
    assert.equal(run1.drifts[0].observation_count, 1);

    // Scan 2 (same drift)
    const run2 = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: liveResources
    });
    assert.equal(run2.drifts[0].observation_count, 2);

    // Verify DB table contains only 1 record for this resource
    const allDrifts = await driftGovernanceRepository.listDriftEvents({ environment: 'staging' });
    assert.equal(allDrifts.length, 1);
    assert.equal(allDrifts[0].observation_count, 2);
  });

  // ---------------------------------------------------------------------------
  // 10. AUTO-RECONCILIATION OF RESOLVED DRIFT
  // ---------------------------------------------------------------------------
  test('10. Auto-marks drift as reconciled when live state returns to matching baseline', async () => {
    await baselineService.createBaseline('staging', [
      {
        resource_id: 'deploy-payment',
        resource_name: 'Payment Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 3 }
      }
    ], ADMIN_USER);

    // 1. Drifting state
    await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: [
        {
          resource_id: 'deploy-payment',
          resource_name: 'Payment Service',
          resource_type: 'k8s_deployment',
          provider: 'kubernetes',
          state: 'running',
          metadata: { replicas: 1 }
        }
      ]
    });

    let activeDrifts = await driftGovernanceRepository.listDriftEvents({ environment: 'staging', status: 'detected' });
    assert.equal(activeDrifts.length, 1);

    // 2. Workload restored to 3 replicas
    await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: [
        {
          resource_id: 'deploy-payment',
          resource_name: 'Payment Service',
          resource_type: 'k8s_deployment',
          provider: 'kubernetes',
          state: 'running',
          metadata: { replicas: 3 }
        }
      ]
    });

    // Active detected drifts should now be 0
    activeDrifts = await driftGovernanceRepository.listDriftEvents({ environment: 'staging', status: 'detected' });
    assert.equal(activeDrifts.length, 0);

    // Drift record status must be 'reconciled'
    const reconciledDrifts = await driftGovernanceRepository.listDriftEvents({ environment: 'staging', status: 'reconciled' });
    assert.equal(reconciledDrifts.length, 1);
    assert.ok(reconciledDrifts[0].reconciled_at !== null);
  });

  // ---------------------------------------------------------------------------
  // 11. EXPLAINABLE SEVERITY CLASSIFIER
  // ---------------------------------------------------------------------------
  test('11. Classifies drift severity deterministically with explainable reasons and evidence', () => {
    // Database drift -> CRITICAL
    const dbAssessment = driftSeverityClassifier.classifyDriftSeverity({
      driftType: 'WORKLOAD_STATE_DRIFT',
      resourceType: 'database',
      resourceId: 'postgres-db-01',
      resourceName: 'Production PostgreSQL',
      environment: 'production',
      expectedState: 'running',
      actualState: 'stopped',
      changedFields: [{ field: 'state', expected: 'running', actual: 'stopped' }],
      dependencyImpact: { downstreamCallers: ['api', 'payment'] }
    });
    assert.equal(dbAssessment.severity, 'critical');
    assert.ok(dbAssessment.reason.includes('Database'));
    assert.equal(dbAssessment.evidence.isDatabase, true);

    // Control plane drift -> CRITICAL
    const cpAssessment = driftSeverityClassifier.classifyDriftSeverity({
      driftType: 'CONFIGURATION_DRIFT',
      resourceType: 'docker_container',
      resourceId: 'infrapulse-backend',
      resourceName: 'infrapulse-backend',
      environment: 'staging',
      expectedState: 'running',
      actualState: 'running',
      changedFields: [{ field: 'image', expected: 'v1.0', actual: 'v1.1' }],
      dependencyImpact: {}
    });
    assert.equal(cpAssessment.severity, 'critical');
    assert.equal(cpAssessment.evidence.isControlPlane, true);

    // Production environment with downstream callers -> HIGH
    const prodCallerAssessment = driftSeverityClassifier.classifyDriftSeverity({
      driftType: 'CONFIGURATION_DRIFT',
      resourceType: 'k8s_deployment',
      resourceId: 'order-service',
      resourceName: 'Order Service',
      environment: 'production',
      expectedState: 'running',
      actualState: 'running',
      changedFields: [{ field: 'env.TIMEOUT', expected: '5s', actual: '1s' }],
      dependencyImpact: { downstreamCallers: ['checkout-ui'] }
    });
    assert.equal(prodCallerAssessment.severity, 'high');
    assert.ok(prodCallerAssessment.reason.includes('Production'));

    // Replica mismatch -> MEDIUM
    const replicaAssessment = driftSeverityClassifier.classifyDriftSeverity({
      driftType: 'REPLICA_MISMATCH',
      resourceType: 'k8s_deployment',
      resourceId: 'search-service',
      resourceName: 'Search Service',
      environment: 'staging',
      expectedState: 'running',
      actualState: 'running',
      changedFields: [{ field: 'replicas', expected: 3, actual: 1 }],
      dependencyImpact: {}
    });
    assert.equal(replicaAssessment.severity, 'medium');

    // Minor metadata in non-production -> LOW
    const lowAssessment = driftSeverityClassifier.classifyDriftSeverity({
      driftType: 'CONFIGURATION_DRIFT',
      resourceType: 'k8s_deployment',
      resourceId: 'doc-service',
      resourceName: 'Documentation Service',
      environment: 'staging',
      expectedState: 'running',
      actualState: 'running',
      changedFields: [{ field: 'metadata.owner', expected: 'team-a', actual: 'team-b' }],
      dependencyImpact: {}
    });
    assert.equal(lowAssessment.severity, 'low');
  });

  // ---------------------------------------------------------------------------
  // 12. DEPENDENCY IMPACT ANALYSIS
  // ---------------------------------------------------------------------------
  test('12. Analyzes dependency impact identifying affected callers', async () => {
    const impact = await driftDetectionService.analyzeDependencyImpact(
      'k8s-payment-service',
      'k8s_deployment',
      'staging'
    );

    assert.equal(impact.directlyAffected, 'k8s-payment-service');
    assert.ok(Array.isArray(impact.downstreamCallers));
    assert.equal(typeof impact.criticalInfrastructureInvolved, 'boolean');
  });

  // ---------------------------------------------------------------------------
  // 13. GOVERNED RECONCILIATION PLAN GENERATION
  // ---------------------------------------------------------------------------
  test('13. Generates governed reconciliation plan preview with step-by-step actions', async () => {
    await baselineService.createBaseline('staging', [
      {
        resource_id: 'container-worker',
        resource_name: 'Background Worker',
        resource_type: 'docker_container',
        provider: 'docker',
        state: 'running',
        metadata: { image: 'worker:v1.0' }
      }
    ], ADMIN_USER);

    // Detect drift: container stopped
    const detectionResult = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: [
        {
          resource_id: 'container-worker',
          resource_name: 'Background Worker',
          resource_type: 'docker_container',
          provider: 'docker',
          state: 'stopped',
          metadata: { image: 'worker:v1.0' }
        }
      ]
    });

    const driftId = detectionResult.drifts[0].id;
    const plan = await driftReconciliationService.previewReconciliationPlan(driftId, ADMIN_USER);

    assert.ok(plan.id);
    assert.equal(plan.drift_id, driftId);
    assert.equal(plan.resource_id, 'container-worker');
    assert.equal(plan.is_executable, true);
    assert.equal(plan.proposed_actions.length, 1);
    assert.equal(plan.proposed_actions[0].action, 'START_CONTAINER');
    assert.equal(plan.proposed_actions[0].targetState, 'running');
  });

  // ---------------------------------------------------------------------------
  // 14. SAFETY GUARDRAILS (NO AUTO-DELETE, NO PVC REMOVAL)
  // ---------------------------------------------------------------------------
  test('14. Blocks automated execution for unexpected additions requiring manual runbooks', async () => {
    await baselineService.createBaseline('staging', [], ADMIN_USER);

    const detectionResult = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: [
        {
          resource_id: 'suspicious-untracked-workload',
          resource_name: 'Rogue Workload',
          resource_type: 'docker_container',
          provider: 'docker',
          state: 'running',
          metadata: { image: 'busybox:latest' }
        }
      ]
    });

    const driftId = detectionResult.drifts[0].id;
    const plan = await driftReconciliationService.previewReconciliationPlan(driftId, ADMIN_USER);

    // Policy Rule: InfraPulse NEVER deletes unexpected workloads automatically
    assert.equal(plan.is_executable, false, 'Unexpected workload deletion must never be executable');
    assert.equal(plan.safety_assessment.safe, false);
    assert.ok(plan.safety_assessment.blockers.some(b => b.includes('Automated deletion of unexpected resources is forbidden')));
    assert.equal(plan.proposed_actions[0].action, 'MANUAL_REMEDIATION_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // 15. RECONCILIATION SUBMISSION & TWO-PERSON APPROVAL
  // ---------------------------------------------------------------------------
  test('15. Submits reconciliation request into lifecycle framework requiring two-person approval', async () => {
    await query(`
      INSERT INTO cloud_resources (
        id, name, provider, resource_type, environment, current_state, last_health_check_status, metadata, cost_breakdown
      ) VALUES (
        'k8s-order-service', 'Order Service', 'kubernetes', 'k8s_deployment', 'staging', 'running', 'healthy', '{"replicas": 1}', '{}'
      ) ON CONFLICT (id) DO UPDATE SET current_state = 'running', metadata = '{"replicas": 1}';
    `);

    await baselineService.createBaseline('staging', [
      {
        resource_id: 'k8s-order-service',
        resource_name: 'Order Service',
        resource_type: 'k8s_deployment',
        provider: 'kubernetes',
        state: 'running',
        metadata: { replicas: 3 }
      }
    ], ADMIN_USER);

    // Create drift: replica mismatch (1 vs 3)
    const scan = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: [
        {
          resource_id: 'k8s-order-service',
          resource_name: 'Order Service',
          resource_type: 'k8s_deployment',
          provider: 'kubernetes',
          state: 'running',
          metadata: { replicas: 1 }
        }
      ]
    });

    const driftId = scan.drifts[0].id;
    const plan = await driftReconciliationService.previewReconciliationPlan(driftId, ADMIN_USER);

    // Submit reconciliation request
    const submission = await driftReconciliationService.submitReconciliationRequest(
      plan.id,
      'Reconcile order service replicas back to desired baseline',
      ADMIN_USER
    );

    assert.ok(submission.lifecycleOperation);
    assert.equal(submission.lifecycleOperation.status, 'pending_approval');
    assert.equal(submission.lifecycleOperation.action, 'scale');
    assert.equal(submission.lifecycleOperation.parameters.targetReplicas, 3);

    // Requester cannot approve their own reconciliation operation
    await assert.rejects(
      async () => {
        await lifecycleService.approveOperation({ operationId: submission.lifecycleOperation.id, user: ADMIN_USER });
      },
      /Separation of Duties Violation/
    );

    // Distinct administrator can approve
    const approved = await lifecycleService.approveOperation({ operationId: submission.lifecycleOperation.id, user: ADMIN_USER_2 });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.approved_by, ADMIN_USER_2.email);
  });

  // ---------------------------------------------------------------------------
  // 16. DRIFT EVENT LIFECYCLE (ACKNOWLEDGE & IGNORE)
  // ---------------------------------------------------------------------------
  test('16. Supports acknowledging and ignoring drift events with audit recording', async () => {
    await baselineService.createBaseline('staging', [
      {
        resource_id: 'ec2-instance-worker',
        resource_name: 'EC2 Worker',
        resource_type: 'ec2_instance',
        provider: 'aws',
        state: 'running',
        metadata: { instanceType: 't4g.small' }
      }
    ], ADMIN_USER);

    const scan = await driftDetectionService.detectDriftForEnvironment({
      environment: 'staging',
      user: ADMIN_USER,
      liveResourcesOverride: [
        {
          resource_id: 'ec2-instance-worker',
          resource_name: 'EC2 Worker',
          resource_type: 'ec2_instance',
          provider: 'aws',
          state: 'stopped',
          metadata: { instanceType: 't4g.small' }
        }
      ]
    });

    const driftId = scan.drifts[0].id;

    // 1. Acknowledge drift
    const ackResult = await driftReconciliationService.acknowledgeOrIgnoreDrift(
      driftId,
      'acknowledged',
      'Under active SRE maintenance',
      ADMIN_USER
    );
    assert.equal(ackResult.status, 'acknowledged');

    // 2. Ignore drift
    const ignoreResult = await driftReconciliationService.acknowledgeOrIgnoreDrift(
      driftId,
      'ignored',
      'Known planned maintenance window',
      ADMIN_USER
    );
    assert.equal(ignoreResult.status, 'ignored');
  });

  // ---------------------------------------------------------------------------
  // 17. MULTI-TENANT ISOLATION
  // ---------------------------------------------------------------------------
  test('17. Enforces strict multi-tenant isolation across drift records and baselines', async () => {
    // Create baseline for Tenant A
    await driftGovernanceRepository.createBaseline({
      environment: 'staging',
      version: 1,
      resources: { 'resource-a': { name: 'Tenant A Service' } },
      createdBy: 'user_a',
      tenantId: 'default_tenant',
      organizationId: 'default_tenant'
    });

    // Create baseline for Tenant B
    await driftGovernanceRepository.createBaseline({
      environment: 'staging',
      version: 1,
      resources: { 'resource-b': { name: 'Tenant B Service' } },
      createdBy: 'user_b',
      tenantId: 'tenant_other',
      organizationId: 'tenant_other'
    });

    // Create drift for Tenant A
    await driftGovernanceRepository.recordDriftEvent({
      environment: 'staging',
      resourceId: 'resource-a',
      resourceName: 'Tenant A Service',
      resourceType: 'k8s_deployment',
      provider: 'kubernetes',
      driftType: 'REPLICA_MISMATCH',
      severity: 'medium',
      severityReason: 'Tenant A mismatch',
      severityEvidence: {},
      baselineHash: 'hash-a-1',
      actualHash: 'hash-a-2',
      expectedState: 'running',
      actualState: 'running',
      expectedConfig: {},
      actualConfig: {},
      changedFields: [],
      dependencyImpact: {},
      tenantId: 'default_tenant',
      organizationId: 'default_tenant'
    });

    // Create drift for Tenant B
    await driftGovernanceRepository.recordDriftEvent({
      environment: 'staging',
      resourceId: 'resource-b',
      resourceName: 'Tenant B Service',
      resourceType: 'docker_container',
      provider: 'docker',
      driftType: 'WORKLOAD_STATE_DRIFT',
      severity: 'critical',
      severityReason: 'Tenant B mismatch',
      severityEvidence: {},
      baselineHash: 'hash-b-1',
      actualHash: 'hash-b-2',
      expectedState: 'running',
      actualState: 'stopped',
      expectedConfig: {},
      actualConfig: {},
      changedFields: [],
      dependencyImpact: {},
      tenantId: 'tenant_other',
      organizationId: 'tenant_other'
    });

    // Query Tenant A drifts
    const tenantADrifts = await driftGovernanceRepository.listDriftEvents({
      tenantId: 'default_tenant'
    });
    assert.equal(tenantADrifts.length, 1);
    assert.equal(tenantADrifts[0].resource_id, 'resource-a');

    // Query Tenant B drifts
    const tenantBDrifts = await driftGovernanceRepository.listDriftEvents({
      tenantId: 'tenant_other'
    });
    assert.equal(tenantBDrifts.length, 1);
    assert.equal(tenantBDrifts[0].resource_id, 'resource-b');

    // Tenant A active baseline check
    const baselineA = await driftGovernanceRepository.getActiveBaseline('staging', 'default_tenant');
    assert.ok(baselineA.resources['resource-a']);
    assert.equal(baselineA.resources['resource-b'], undefined);
  });

});
