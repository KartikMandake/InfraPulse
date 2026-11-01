import {withTenant} from '../../backend/src/security/tenantContext.js';
// ==============================================================================
// InfraPulse - Governed Automated Remediation Intelligence Test Suite
// Phase 23J: End-to-End Tests for Evidence-Backed, Approval-Controlled Remediation
// ==============================================================================

import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { query } from '../../backend/src/db/connection.js';
import { remediationRepository } from '../../backend/src/repositories/remediation.repository.js';
import { cloudLifecycleRepository } from '../../backend/src/repositories/cloudLifecycle.repository.js';
import * as incidentsRepo from '../../backend/src/repositories/incidents.repository.js';
import { remediationPolicyService } from '../../backend/src/services/remediation/remediationPolicy.service.js';
import { riskAssessmentService } from '../../backend/src/services/remediation/riskAssessment.service.js';
import { remediationRecommendationService } from '../../backend/src/services/remediation/remediationRecommendation.service.js';
import { remediationApprovalService } from '../../backend/src/services/remediation/remediationApproval.service.js';
import { remediationExecutionService } from '../../backend/src/services/remediation/remediationExecution.service.js';
import { remediationVerificationService } from '../../backend/src/services/remediation/remediationVerification.service.js';
import { workloadEligibilityService } from '../../backend/src/services/cloud-lifecycle/services/workloadEligibility.service.js';
import { config } from '../../backend/src/config/env.js';

const TEST_TENANT_1 = 'tenant-remediation-alpha';
const TEST_TENANT_2 = 'tenant-remediation-beta';

async function createTestPlan(recOverrides = {}, planOverrides = {}) {
  const rec = await remediationRepository.createRecommendation({
    incidentId: 'INC-23J-001',
    tenantId: TEST_TENANT_1,
    environment: 'staging',
    serviceId: 'test-23j-payment-service',
    resourceId: 'test-23j-res-01',
    detectedProblem: 'Test problem',
    proposedAction: 'DOCKER_CONTAINER_RESTART',
    expectedOutcome: 'Restore service',
    riskLevel: 'LOW',
    ...recOverrides
  });

  const plan = await remediationRepository.createPlan({
    recommendationId: rec.id,
    tenantId: TEST_TENANT_1,
    action: 'DOCKER_CONTAINER_RESTART',
    targetResourceId: 'test-23j-res-01',
    planHash: 'hash-default-test',
    ...planOverrides
  });

  return { rec, plan };
}

describe('Phase 23J: Governed Automated Remediation Intelligence', () => {
  before(async () => {
    await query("DELETE FROM incidents WHERE id LIKE 'INC-23J-%'");
    await query("INSERT INTO services(id,name,tenant_id) VALUES('test-23j-payment-service','test-23j-payment-service',$1) ON CONFLICT(id) DO NOTHING",[TEST_TENANT_1]);
    // Ensure clean state for test tenant
    await query(`DELETE FROM remediation_execution_events WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_executions WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM infra_remediation_approvals WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_plans WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_recommendations WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_policy_rules WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM cloud_resources WHERE id LIKE 'test-23j-%'`);
  });

  afterEach(async () => {
    await query(`DELETE FROM remediation_execution_events WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_executions WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM infra_remediation_approvals WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_plans WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_recommendations WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM remediation_policy_rules WHERE tenant_id IN ($1, $2)`, [TEST_TENANT_1, TEST_TENANT_2]);
    await query(`DELETE FROM cloud_resources WHERE id LIKE 'test-23j-%'`);
  });

  // ---------------------------------------------------------------------------
  // 1. Policy Evaluation & Prohibited Actions
  // ---------------------------------------------------------------------------
  tenantTest('1. Policy: Strictly blocks prohibited actions (resource/database deletion, arbitrary scripts)', async () => {
    const prohibitedActions = [
      'RESOURCE_DELETE',
      'DATABASE_DELETE',
      'DATABASE_RESTART',
      'VOLUME_DELETE',
      'PVC_DELETE',
      'EXECUTE_SHELL_COMMAND',
      'EXECUTE_ARBITRARY_SCRIPT'
    ];

    for (const action of prohibitedActions) {
      const res = await remediationPolicyService.evaluatePolicy({
        tenantId: TEST_TENANT_1,
        environment: 'staging',
        action
      });
      assert.strictEqual(res.allowed, false, `Action '${action}' must be blocked by policy`);
      assert.ok(res.blockers.some(b => b.includes('strictly prohibited')), `Expected prohibited message for '${action}'`);
    }

    // Permitted allowlisted action
    const allowed = await remediationPolicyService.evaluatePolicy({
      tenantId: TEST_TENANT_1,
      environment: 'staging',
      action: 'DOCKER_CONTAINER_RESTART',
      riskLevel: 'LOW'
    });
    assert.strictEqual(allowed.allowed, true);
  });

  // ---------------------------------------------------------------------------
  // 2. Production Environment Protection
  // ---------------------------------------------------------------------------
  tenantTest('2. Production Protection: Automated remediation blocked by default in production', async () => {
    config.remediationProductionEnabled = false;

    const res = await remediationPolicyService.evaluatePolicy({
      tenantId: TEST_TENANT_1,
      environment: 'production',
      action: 'DOCKER_CONTAINER_RESTART',
      riskLevel: 'MEDIUM'
    });

    assert.strictEqual(res.allowed, false);
    assert.ok(res.blockers.some(b => b.includes('Production Safeguard')));
  });

  // ---------------------------------------------------------------------------
  // 3. Evidence-Backed Recommendation Generation from RCA Findings
  // ---------------------------------------------------------------------------
  tenantTest('3. Recommendation: Generates evidence-backed proposal when RCA confirms underlying container failure', async () => {
    // Setup target cloud resource
    await cloudLifecycleRepository.upsertResource({
      id: 'test-23j-payment-container',
      name: 'test-23j-payment-service-container',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      current_state: 'crashed',
      metadata: { compose_service: 'test-23j-payment-service', container_name: 'test-23j-payment-service-container' }
    });

    // Create incident with CONFIRMED_FACT RCA finding
    const incident = await incidentsRepo.createIncidentRecord({
      id: 'INC-23J-001',
      title: 'Incident: Payment API Outage',
      serviceId: 'test-23j-payment-service',
      serviceName: 'Payment Gateway',
      status: 'investigating',
      rcaConfidenceLevel: 'CONFIRMED_FACT',
      rcaHypotheses: [
        {
          candidateServiceId: 'test-23j-payment-service',
          candidateServiceName: 'Payment Gateway',
          score: 95,
          confidenceLevel: 'CONFIRMED_FACT',
          supportingEvidence: [
            { type: 'infrastructure_failure', title: 'Container Crashed' }
          ]
        }
      ]
    });

    const result = await remediationRecommendationService.generateRecommendationsForIncident({
      incidentId: incident.id,
      tenantId: TEST_TENANT_1
    });

    assert.strictEqual(result.recommendationsGenerated, 1);
    const rec = result.recommendations[0];
    assert.strictEqual(rec.proposed_action || rec.proposedAction, 'DOCKER_CONTAINER_START');
    assert.strictEqual(rec.risk_level || rec.riskLevel, 'LOW');
    assert.ok(rec.planId);
    assert.ok(rec.planHash);
  });

  // ---------------------------------------------------------------------------
  // 4. Insufficient Evidence Safeguard
  // ---------------------------------------------------------------------------
  tenantTest('4. Insufficient Evidence: Never generates actionable recommendations from WEAK_HYPOTHESIS', async () => {
    const incident = await incidentsRepo.createIncidentRecord({
      id: 'INC-23J-002',
      title: 'Incident: Ambiguous Latency Spike',
      serviceId: 'test-23j-payment-service',
      serviceName: 'Payment Gateway',
      status: 'investigating',
      rcaConfidenceLevel: 'WEAK_HYPOTHESIS',
      rcaHypotheses: [
        {
          candidateServiceId: 'test-23j-payment-service',
          candidateServiceName: 'Payment Gateway',
          score: 35,
          confidenceLevel: 'WEAK_HYPOTHESIS'
        }
      ]
    });

    const result = await remediationRecommendationService.generateRecommendationsForIncident({
      incidentId: incident.id,
      tenantId: TEST_TENANT_1
    });

    assert.strictEqual(result.recommendationsGenerated, 0);
    assert.match(result.message, /insufficient|inconclusive/i);
  });

  // ---------------------------------------------------------------------------
  // 5. Deterministic Risk Assessment & Blast Radius
  // ---------------------------------------------------------------------------
  tenantTest('5. Risk Assessment: Accurately scores risk and identifies downstream caller dependencies', async () => {
    const resource = {
      id: 'test-23j-auth-workload',
      name: 'auth-gateway',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      is_critical_dependency: true,
      persistence_requirements: { has_volume: true }
    };

    const risk = await riskAssessmentService.assessRisk({
      resource,
      action: 'DOCKER_CONTAINER_RESTART',
      rcaConfidenceLevel: 'CONFIRMED_FACT'
    });

    assert.ok(risk.riskScore >= 35, 'Critical dependency with volume must have elevated risk score');
    assert.strictEqual(risk.riskLevel, 'MEDIUM');
    assert.ok(risk.riskRationale.includes('Critical Dependency'));
    assert.ok(risk.blastRadius.persistentStorageProtected === true);
  });

  // ---------------------------------------------------------------------------
  // 6. Dry-Run Execution Isolation
  // ---------------------------------------------------------------------------
  tenantTest('6. Dry-Run: Evaluates preconditions and blast radius with zero mutations', async () => {
    await cloudLifecycleRepository.upsertResource({
      id: 'test-23j-dry-workload',
      name: 'dry-test-container',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      current_state: 'crashed'
    });

    const rec = await remediationRepository.createRecommendation({
      incidentId: 'INC-23J-001',
      tenantId: TEST_TENANT_1,
      environment: 'staging',
      serviceId: 'test-23j-payment-service',
      resourceId: 'test-23j-dry-workload',
      detectedProblem: 'Container crashed',
      proposedAction: 'DOCKER_CONTAINER_START',
      expectedOutcome: 'Restore service',
      riskLevel: 'LOW',
      riskScore: 20
    });

    const plan = await remediationRepository.createPlan({
      recommendationId: rec.id,
      tenantId: TEST_TENANT_1,
      action: 'DOCKER_CONTAINER_START',
      targetResourceId: 'test-23j-dry-workload',
      planHash: 'hash-dry-001'
    });

    const preview = await remediationExecutionService.dryRunExecution({
      planId: plan.id,
      user: { email: 'sre@infrapulse.io', role: 'responder' },
      tenantId: TEST_TENANT_1
    });

    assert.strictEqual(preview.dryRun, true);
    assert.strictEqual(preview.status, 'DRY_RUN_PASSED');
    assert.strictEqual(preview.intendedState, 'running');

    // Verify empirical state in DB remains strictly untouched (crashed)
    const afterResource = await cloudLifecycleRepository.getResourceById('test-23j-dry-workload');
    assert.strictEqual(afterResource.current_state, 'crashed', 'Dry-run must not mutate actual infrastructure');
  });

  // ---------------------------------------------------------------------------
  // 7. Separation of Duties: Requester Cannot Approve
  // ---------------------------------------------------------------------------
  tenantTest('7. Separation of Duties: Rejects self-approval attempt by the requester', async () => {
    const { plan } = await createTestPlan({}, { planHash: 'hash-sod-001' });

    const approval = await remediationApprovalService.requestApproval({
      planId: plan.id,
      user: { email: 'operator@infrapulse.io', role: 'responder' },
      tenantId: TEST_TENANT_1
    });

    assert.strictEqual(approval.approval_status, 'PENDING');

    // Requester attempts self-approval
    await assert.rejects(
      async () => {
        await remediationApprovalService.approvePlan({
          approvalId: approval.id,
          user: { email: 'operator@infrapulse.io', role: 'admin' }, // Same email!
          planHash: 'hash-sod-001',
          tenantId: TEST_TENANT_1
        });
      },
      /Separation of Duties Violation.*cannot approve their own/i
    );
  });

  // ---------------------------------------------------------------------------
  // 8. Multi-Party Approval Workflow
  // ---------------------------------------------------------------------------
  tenantTest('8. Multi-Party Approval: Independent administrator successfully approves remediation plan', async () => {
    const { plan } = await createTestPlan({}, { planHash: 'hash-two-person-001' });

    const approval = await remediationApprovalService.requestApproval({
      planId: plan.id,
      user: { email: 'sre-requester@infrapulse.io', role: 'responder' },
      tenantId: TEST_TENANT_1
    });

    // Independent admin approves
    const approved = await remediationApprovalService.approvePlan({
      approvalId: approval.id,
      user: { email: 'admin-lead@infrapulse.io', role: 'admin' },
      planHash: plan.plan_hash,
      tenantId: TEST_TENANT_1
    });

    assert.strictEqual(approved.approval_status, 'APPROVED');
    assert.strictEqual(approved.approver_email, 'admin-lead@infrapulse.io');
    assert.ok(approved.approved_at);
  });

  // ---------------------------------------------------------------------------
  // 9. Expiration Governance
  // ---------------------------------------------------------------------------
  tenantTest('9. Expiration: Rejects approval attempt on expired remediation approval request', async () => {
    const { plan } = await createTestPlan({}, { planHash: 'hash-exp-001' });

    // Create approval that expired 10 minutes ago
    const pastTime = new Date(Date.now() - 600000).toISOString();
    const approval = await remediationRepository.createApproval({
      planId: plan.id,
      tenantId: TEST_TENANT_1,
      requesterEmail: 'dev@infrapulse.io',
      requesterRole: 'responder',
      expiresAt: pastTime
    });

    await assert.rejects(
      async () => {
        await remediationApprovalService.approvePlan({
          approvalId: approval.id,
          user: { email: 'lead@infrapulse.io', role: 'admin' },
          tenantId: TEST_TENANT_1
        });
      },
      /Approval Expired/i
    );
  });

  // ---------------------------------------------------------------------------
  // 10. Plan Immutability & Tampering Protection
  // ---------------------------------------------------------------------------
  tenantTest('10. Plan Immutability: Rejects approval when provided plan hash does not match immutable version', async () => {
    const { plan } = await createTestPlan({}, { planHash: 'hash-authentic-12345' });

    const approval = await remediationApprovalService.requestApproval({
      planId: plan.id,
      user: { email: 'sre@infrapulse.io', role: 'responder' },
      tenantId: TEST_TENANT_1
    });

    await assert.rejects(
      async () => {
        await remediationApprovalService.approvePlan({
          approvalId: approval.id,
          user: { email: 'admin@infrapulse.io', role: 'admin' },
          planHash: 'hash-tampered-99999', // Mismatched hash!
          tenantId: TEST_TENANT_1
        });
      },
      /Plan Tampering Detected/i
    );
  });

  // ---------------------------------------------------------------------------
  // 11. Controlled Execution with Idempotency Key
  // ---------------------------------------------------------------------------
  tenantTest('11. Idempotency: Replaying execution with identical idempotency key returns cached result', async () => {
    config.remediationExecutionEnabled = true;

    await cloudLifecycleRepository.upsertResource({
      id: 'test-23j-exec-workload',
      name: 'exec-test-container',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      current_state: 'crashed'
    });

    const rec = await remediationRepository.createRecommendation({
      incidentId: 'INC-23J-001',
      tenantId: TEST_TENANT_1,
      environment: 'staging',
      serviceId: 'test-23j-payment-service',
      resourceId: 'test-23j-exec-workload',
      detectedProblem: 'Container crashed',
      proposedAction: 'DOCKER_CONTAINER_START',
      expectedOutcome: 'Start container',
      riskLevel: 'LOW'
    });

    const plan = await remediationRepository.createPlan({
      recommendationId: rec.id,
      tenantId: TEST_TENANT_1,
      action: 'DOCKER_CONTAINER_START',
      targetResourceId: 'test-23j-exec-workload',
      planHash: 'hash-exec-001'
    });

    const approval = await remediationRepository.createApproval({
      planId: plan.id,
      tenantId: TEST_TENANT_1,
      requesterEmail: 'sre@infrapulse.io',
      approverEmail: 'admin@infrapulse.io',
      approvalStatus: 'APPROVED'
    });

    const idempotencyKey = 'idem-unique-key-23j-001';

    // Mock Docker Provider
    const mockDocker = {
      startContainer: async () => ({ success: true, containerStatus: 'running' }),
      restartContainer: async () => ({ success: true, containerStatus: 'running' })
    };

    // First execution
    const res1 = await remediationExecutionService.executePlan({
      planId: plan.id,
      approvalId: approval.id,
      user: { email: 'admin@infrapulse.io', role: 'admin' },
      idempotencyKey,
      explicitConfirmation: true,
      tenantId: TEST_TENANT_1,
      dockerProvider: mockDocker
    });

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.execution.status, 'COMPLETED');

    // Repeated execution with identical key
    const res2 = await remediationExecutionService.executePlan({
      planId: plan.id,
      approvalId: approval.id,
      user: { email: 'admin@infrapulse.io', role: 'admin' },
      idempotencyKey,
      explicitConfirmation: true,
      tenantId: TEST_TENANT_1,
      dockerProvider: mockDocker
    });

    assert.strictEqual(res2.idempotentReplay, true);
    assert.strictEqual(res2.execution.id, res1.execution.id);
  });

  // ---------------------------------------------------------------------------
  // 12. Concurrency Operation Lock Protection
  // ---------------------------------------------------------------------------
  tenantTest('12. Concurrency Lock: Blocks simultaneous concurrent executions on the same target resource', async () => {
    config.remediationExecutionEnabled = true;

    await cloudLifecycleRepository.upsertResource({
      id: 'test-23j-locked-resource',
      name: 'locked-resource-container',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      current_state: 'running'
    });

    const { plan: plan1 } = await createTestPlan({}, { targetResourceId: 'test-23j-locked-resource' });

    // Simulate an already active execution on resource
    await remediationRepository.createExecution({
      planId: plan1.id,
      tenantId: TEST_TENANT_1,
      resourceId: 'test-23j-locked-resource',
      idempotencyKey: 'idem-lock-01',
      status: 'EXECUTING',
      executedBy: 'runner-1@infrapulse.io'
    });

    // Attempt second execution on same resource
    const { plan: plan2 } = await createTestPlan({}, { targetResourceId: 'test-23j-locked-resource', planHash: 'hash-lock-02' });

    const approval2 = await remediationRepository.createApproval({
      planId: plan2.id,
      tenantId: TEST_TENANT_1,
      requesterEmail: 'user1@infrapulse.io',
      approverEmail: 'user2@infrapulse.io',
      approvalStatus: 'APPROVED'
    });

    await assert.rejects(
      async () => {
        await remediationExecutionService.executePlan({
          planId: plan2.id,
          approvalId: approval2.id,
          user: { email: 'user2@infrapulse.io', role: 'admin' },
          idempotencyKey: 'idem-lock-02',
          explicitConfirmation: true,
          tenantId: TEST_TENANT_1
        });
      },
      /Concurrency Lock.*active remediation running/i
    );
  });

  // ---------------------------------------------------------------------------
  // 13. System Namespace & Database Workload Protection
  // ---------------------------------------------------------------------------
  tenantTest('13. Workload Safety: Blocks remediation on kube-system namespace and database containers', async () => {
    // Kubernetes System Namespace Workload
    const k8sSystemWorkload = {
      id: 'test-23j-k8s-coredns',
      name: 'coredns',
      provider: 'kubernetes',
      resource_type: 'k8s_deployment',
      environment: 'staging',
      metadata: { namespace: 'kube-system' }
    };

    const resK8s = await workloadEligibilityService.evaluateEligibility(k8sSystemWorkload, 'restart');
    assert.strictEqual(resK8s.eligible, false);
    assert.ok(resK8s.blockers.some(b => b.includes('Protected System Namespace')));

    // Database Container Workload
    const dbWorkload = {
      id: 'test-23j-postgres-db',
      name: 'infrapulse-postgres',
      provider: 'docker',
      resource_type: 'docker_container',
      environment: 'staging',
      metadata: { container_name: 'postgres-db-container' }
    };

    const resDb = await workloadEligibilityService.evaluateEligibility(dbWorkload, 'stop');
    assert.strictEqual(resDb.eligible, false);
    assert.ok(resDb.blockers.some(b => /Database.*Protected/i.test(b)));
  });

  // ---------------------------------------------------------------------------
  // 14. Post-Execution Observability Verification
  // ---------------------------------------------------------------------------
  tenantTest('14. Verification: Classifies outcome based on container health, error rate, and active alerts', async () => {
    const resource = {
      id: 'test-23j-verify-res',
      name: 'payment-container',
      current_state: 'running'
    };

    // Scenario A: Healthy workload & cleared alerts -> SUCCESSFUL
    const v1 = await remediationVerificationService.verifyRemediation({
      resource,
      action: 'DOCKER_CONTAINER_START',
      postExecutionState: { currentState: 'running' },
      providerResponse: { status: 'running' },
      relatedAlerts: [],
      telemetryStats: { lastSuccessfulAt: new Date().toISOString() }
    });
    assert.strictEqual(v1.outcome, 'SUCCESSFUL');

    // Scenario B: Workload running but critical alert still firing -> PARTIALLY_SUCCESSFUL
    const v2 = await remediationVerificationService.verifyRemediation({
      resource,
      action: 'DOCKER_CONTAINER_START',
      postExecutionState: { currentState: 'running' },
      providerResponse: { status: 'running' },
      relatedAlerts: [{ severity: 'critical', state: 'firing' }]
    });
    assert.strictEqual(v2.outcome, 'PARTIALLY_SUCCESSFUL');

    // Scenario C: Workload crashed / CrashLoopBackOff -> RECOVERY_REQUIRED
    const v3 = await remediationVerificationService.verifyRemediation({
      resource,
      action: 'DOCKER_CONTAINER_START',
      postExecutionState: { currentState: 'crashed' },
      providerResponse: { status: 'CrashLoopBackOff' }
    });
    assert.strictEqual(v3.outcome, 'RECOVERY_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // 15. Recovery Planning & Non-Destructive Rollback Strategy
  // ---------------------------------------------------------------------------
  tenantTest('15. Recovery Strategy: Defines non-destructive compensating actions for all allowlisted mutations', () => {
    const actions = [
      'DOCKER_CONTAINER_START',
      'DOCKER_CONTAINER_RESTART',
      'K8S_REPLICA_RESTORE',
      'K8S_DEPLOYMENT_RESTART',
      'AWS_EC2_START'
    ];

    for (const act of actions) {
      const rollback = remediationRecommendationService._buildRollbackStrategy(
        { id: 'res-test-01', name: 'workload-01' },
        act
      );
      assert.ok(rollback);
      assert.ok(rollback.compensatingProcedure);
      assert.ok(!rollback.compensatingProcedure.toLowerCase().includes('delete'), 'Rollback must never perform destructive deletion');
    }
  });

  // ---------------------------------------------------------------------------
  // 16. Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  tenantTest('16. Isolation: Prevents cross-tenant access to recommendations, approvals, and executions', async () => {
    // Create Tenant 1 Recommendation
    const rec1 = await remediationRepository.createRecommendation({
      incidentId: 'INC-23J-001',
      tenantId: TEST_TENANT_1,
      environment: 'staging',
      serviceId: 'test-23j-payment-service',
      resourceId: 'res-t1-001',
      detectedProblem: 'Tenant 1 failure',
      proposedAction: 'DOCKER_CONTAINER_START',
      expectedOutcome: 'Start workload'
    });

    // Query from Tenant 2 -> Must be empty
    const t2List = await remediationRepository.listRecommendations(TEST_TENANT_2);
    assert.strictEqual(t2List.length, 0);

    const crossQuery = await remediationRepository.getRecommendationById(rec1.id, TEST_TENANT_2);
    assert.strictEqual(crossQuery, null, 'Tenant 2 cannot query Tenant 1 recommendation');
  });

  // ---------------------------------------------------------------------------
  // 17. Execution Audit Trail
  // ---------------------------------------------------------------------------
  tenantTest('17. Audit Trail: All mutation events and verification milestones are permanently recorded', async () => {
    const { plan } = await createTestPlan();
    const exec = await remediationRepository.createExecution({
      planId: plan.id,
      tenantId: TEST_TENANT_1,
      resourceId: 'res-audit-01',
      idempotencyKey: 'idem-audit-01',
      executedBy: 'lead-sre@infrapulse.io'
    });

    await remediationRepository.recordExecutionEvent({
      executionId: exec.id,
      tenantId: TEST_TENANT_1,
      eventType: 'PRECHECK_PASSED',
      severity: 'info',
      message: 'Pre-execution checks verified without blockers.'
    });

    await remediationRepository.recordExecutionEvent({
      executionId: exec.id,
      tenantId: TEST_TENANT_1,
      eventType: 'VERIFICATION_PASSED',
      severity: 'info',
      message: 'Container health verified in running state.'
    });

    const events = await remediationRepository.listExecutionEvents(exec.id, TEST_TENANT_1);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].event_type, 'PRECHECK_PASSED');
    assert.strictEqual(events[1].event_type, 'VERIFICATION_PASSED');
  });
});

function tenantTest(name,callback){return test(name,()=>withTenant(TEST_TENANT_1,callback));}
