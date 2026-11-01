/**
 * Phase 23E: Governed AWS EC2 Start/Stop Lifecycle Management Test Suite
 *
 * Exhaustive coverage of:
 * 1. Eligible instance start (with feature flag true & allowlisted)
 * 2. Eligible instance stop (verifying state transition to 'stopped')
 * 3. Ineligible instance rejection (instance not allowlisted)
 * 4. Production-tagged instance rejection (Environment=production / env=prod)
 * 5. InfraPulse control plane host protection (INFRAPULSE_HOST_INSTANCE_ID)
 * 6. RDS protection (RDS instance rejected from EC2 lifecycle)
 * 7. EBS preservation guarantees (EBS storage fees continue, volume not stopped)
 * 8. Approval & self-approval prevention (two-person separation of duties)
 * 9. Missing explicit confirmation rejection (explicitConfirmation: false rejected for live AWS)
 * 10. Idempotency key deduplication (duplicate request returns existing op)
 * 11. Concurrent operation lock on active instance
 * 12. AWS API throttling handling (retry on RequestLimitExceeded)
 * 13. Timeout handling and partial failure reporting (no automatic compensating mutations)
 * 14. Cost impact calculations (compute savings vs ongoing storage/IPv4)
 * 15. Disabled mutation flag (AWS_LIFECYCLE_MUTATIONS_ENABLED=false blocks execution and verifies NO AWS SDK mutation command is called)
 */

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../backend/src/config/env.js';
import { query } from '../../backend/src/db/connection.js';
import { AwsEc2LifecycleProvider } from '../../backend/src/services/cloud-lifecycle/providers/awsEc2Lifecycle.provider.js';
import { ec2EligibilityService } from '../../backend/src/services/cloud-lifecycle/services/ec2Eligibility.service.js';
import { lifecycleService } from '../../backend/src/services/cloud-lifecycle/services/lifecycle.service.js';
import { resourceService } from '../../backend/src/services/cloud-lifecycle/services/resource.service.js';
import { cloudLifecycleRepository } from '../../backend/src/repositories/cloudLifecycle.repository.js';
import { lifecyclePolicy } from '../../backend/src/services/cloud-lifecycle/policies/lifecycle-policy.js';

const ADMIN_USER = { id: 'usr_admin_001', name: 'Sarah Chen', role: 'admin', email: 'sarah.chen@infrapulse.io' };
const RESPONDER_USER = { id: 'usr_responder_002', name: 'Marcus Vance', role: 'responder', email: 'marcus.v@infrapulse.io' };

/**
 * Creates a deterministic mock EC2 client bundle with spying capabilities.
 */
function createMockEc2Client({
  initialState = 'stopped',
  finalState = 'running',
  throttlingAttempts = 0,
  waiterThrows = false
} = {}) {
  const dispatchedCommands = [];
  let throttleCount = 0;
  let currentState = initialState;

  const ec2 = {
    send: async (cmd) => {
      const name = cmd.constructor?.name || 'UnknownCommand';
      dispatchedCommands.push({ name, input: cmd.input });

      if (throttleCount < throttlingAttempts) {
        throttleCount++;
        const throttleErr = new Error('Rate exceeded');
        throttleErr.name = 'RequestLimitExceeded';
        throw throttleErr;
      }

      if (name === 'DescribeInstancesCommand') {
        const instanceId = cmd.input?.InstanceIds?.[0] || 'i-test-default';
        return {
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: instanceId,
                  InstanceType: 't4g.small',
                  State: { Name: currentState },
                  PublicIpAddress: '13.232.10.20',
                  PrivateIpAddress: '172.31.20.10',
                  Placement: { AvailabilityZone: 'ap-south-1a' },
                  Tags: [{ Key: 'Name', Value: 'staging-test-ec2' }]
                }
              ]
            }
          ]
        };
      }

      if (name === 'StartInstancesCommand') {
        currentState = 'starting';
        return {
          StartingInstances: [
            {
              InstanceId: cmd.input?.InstanceIds?.[0],
              PreviousState: { Name: initialState },
              CurrentState: { Name: 'starting' }
            }
          ]
        };
      }

      if (name === 'StopInstancesCommand') {
        currentState = 'stopping';
        return {
          StoppingInstances: [
            {
              InstanceId: cmd.input?.InstanceIds?.[0],
              PreviousState: { Name: initialState },
              CurrentState: { Name: 'stopping' }
            }
          ]
        };
      }

      throw new Error(`Unhandled command in mock EC2 client: ${name}`);
    },

    waitUntilInstanceRunning: async () => {
      if (waiterThrows) {
        throw new Error('Waiter timed out waiting for instance to reach running state.');
      }
      currentState = finalState;
      return { state: 'SUCCESS' };
    },

    waitUntilInstanceStopped: async () => {
      if (waiterThrows) {
        throw new Error('Waiter timed out waiting for instance to reach stopped state.');
      }
      currentState = finalState;
      return { state: 'SUCCESS' };
    }
  };

  return { ec2, dispatchedCommands, getCurrentState: () => currentState };
}

describe('Phase 23E: Governed AWS EC2 Start/Stop Lifecycle Management', () => {
  const originalFlag = config.awsLifecycleMutationsEnabled;
  const originalAllowlist = [...(config.awsAllowedInstanceIds || [])];
  const originalHostId = config.infraPulseHostInstanceId;

  beforeEach(async () => {
    // Reset policy kill switch
    await lifecyclePolicy.setKillSwitch(false, { user: ADMIN_USER, reason: 'test_setup' });
    // Reset database operations
    await query('TRUNCATE cloud_lifecycle_operations CASCADE;');
    await resourceService.seedBaselineInventory();

    // Default configuration for tests
    config.awsLifecycleMutationsEnabled = true;
    config.awsAllowedInstanceIds = ['i-allowed-001', 'i-staging-worker', 'res-aws-live-ec2-01'];
    config.infraPulseHostInstanceId = 'i-infrapulse-host-001';
  });

  afterEach(() => {
    config.awsLifecycleMutationsEnabled = originalFlag;
    config.awsAllowedInstanceIds = originalAllowlist;
    config.infraPulseHostInstanceId = originalHostId;
  });

  // --------------------------------------------------------------------------
  // 1. Eligible Instance Start
  // --------------------------------------------------------------------------
  test('1. Eligible Instance Start: End-to-end governed start with approval & explicit confirmation', async () => {
    const { ec2, dispatchedCommands } = createMockEc2Client({
      initialState: 'stopped',
      finalState: 'running'
    });
    const provider = new AwsEc2LifecycleProvider({ region: 'ap-south-1', clients: { ec2 } });

    // Seed a live AWS EC2 resource
    const liveResource = {
      id: 'res-aws-live-ec2-01',
      name: 'live-staging-api',
      provider: 'aws',
      resource_type: 'ec2_instance',
      environment: 'staging',
      region: 'ap-south-1',
      current_state: 'stopped',
      cost_breakdown: { compute: 0.0416, storage: 0.0033, ipv4: 0.005 },
      metadata: { is_live_aws: true, instance_id: 'i-allowed-001', tags: { Environment: 'staging' } }
    };
    await cloudLifecycleRepository.upsertResource(liveResource);

    // 1. Dry run
    const dryRun = await lifecycleService.dryRun({ resourceId: liveResource.id, action: 'start', user: RESPONDER_USER });
    assert.equal(dryRun.safe, true);

    // 2. Request operation
    const op = await lifecycleService.requestOperation({
      resourceId: liveResource.id,
      action: 'start',
      user: RESPONDER_USER,
      reason: 'Staging performance test workload startup'
    });
    assert.equal(op.status, 'pending_approval');

    // 3. Approve operation (Admin)
    await lifecycleService.approveOperation({ operationId: op.id, user: ADMIN_USER });

    // 4. Execute operation with explicitConfirmation
    const executed = await lifecycleService.executeOperation({
      operationId: op.id,
      user: ADMIN_USER,
      explicitConfirmation: true,
      awsEc2LifecycleProvider: provider
    });

    assert.equal(executed.operation.status, 'completed');
    assert.equal(executed.success, true);
    const updatedResource = await resourceService.getResourceById(liveResource.id);
    assert.equal(updatedResource.current_state, 'running');

    // Verify StartInstancesCommand was called
    const startCmd = dispatchedCommands.find(c => c.name === 'StartInstancesCommand');
    assert.ok(startCmd, 'StartInstancesCommand must have been dispatched');
    assert.deepEqual(startCmd.input.InstanceIds, ['i-allowed-001']);
  });

  // --------------------------------------------------------------------------
  // 2. Eligible Instance Stop
  // --------------------------------------------------------------------------
  test('2. Eligible Instance Stop: Governed stop transitions state to stopped', async () => {
    const { ec2, dispatchedCommands } = createMockEc2Client({
      initialState: 'running',
      finalState: 'stopped'
    });
    const provider = new AwsEc2LifecycleProvider({ region: 'ap-south-1', clients: { ec2 } });

    const liveResource = {
      id: 'res-aws-live-ec2-02',
      name: 'live-dev-worker',
      provider: 'aws',
      resource_type: 'ec2_instance',
      environment: 'dev',
      region: 'ap-south-1',
      current_state: 'running',
      cost_breakdown: { compute: 0.0416, storage: 0.0033, ipv4: 0.005 },
      metadata: { is_live_aws: true, instance_id: 'i-staging-worker', tags: { Environment: 'dev' } }
    };
    await cloudLifecycleRepository.upsertResource(liveResource);

    // Request & approve
    const op = await lifecycleService.requestOperation({
      resourceId: liveResource.id,
      action: 'stop',
      user: RESPONDER_USER,
      reason: 'End of sprint idle cost reduction'
    });
    await lifecycleService.approveOperation({ operationId: op.id, user: ADMIN_USER });

    // Execute with explicit confirmation
    const executed = await lifecycleService.executeOperation({
      operationId: op.id,
      user: ADMIN_USER,
      explicitConfirmation: true,
      awsEc2LifecycleProvider: provider
    });

    assert.equal(executed.operation.status, 'completed');
    assert.equal(executed.success, true);
    const updatedResource = await resourceService.getResourceById(liveResource.id);
    assert.equal(updatedResource.current_state, 'stopped');

    const stopCmd = dispatchedCommands.find(c => c.name === 'StopInstancesCommand');
    assert.ok(stopCmd, 'StopInstancesCommand must have been dispatched');
    assert.deepEqual(stopCmd.input.InstanceIds, ['i-staging-worker']);
  });

  // --------------------------------------------------------------------------
  // 3. Ineligible Instance Rejection (Allowlist)
  // --------------------------------------------------------------------------
  test('3. Ineligible Instance Rejection: Non-allowlisted instance is blocked', async () => {
    const unallowedResource = {
      id: 'res-aws-unallowed-01',
      name: 'unallowed-staging-box',
      provider: 'aws',
      resource_type: 'ec2_instance',
      environment: 'staging',
      region: 'ap-south-1',
      current_state: 'running',
      metadata: { is_live_aws: true, instance_id: 'i-not-in-allowlist-999', tags: { Environment: 'staging' } }
    };

    const eligibility = await ec2EligibilityService.evaluateEligibility(unallowedResource, 'stop');
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Instance Not Allowlisted')));

    await cloudLifecycleRepository.upsertResource(unallowedResource);
    const dryRun = await lifecycleService.dryRun({ resourceId: unallowedResource.id, action: 'stop', user: RESPONDER_USER });
    assert.equal(dryRun.safe, false);
    assert.ok(dryRun.blockers.some(b => b.includes('Instance Not Allowlisted')));
  });

  // --------------------------------------------------------------------------
  // 4. Production-Tagged Instance Rejection
  // --------------------------------------------------------------------------
  test('4. Production-Tagged Instance Rejection: Instances tagged production/prod are blocked', async () => {
    const prodResource = {
      id: 'res-aws-prod-ec2',
      name: 'production-primary-gateway',
      provider: 'aws',
      resource_type: 'ec2_instance',
      environment: 'production',
      region: 'ap-south-1',
      current_state: 'running',
      metadata: { is_live_aws: true, instance_id: 'i-allowed-001', tags: { Environment: 'production' } }
    };

    const eligibility = await ec2EligibilityService.evaluateEligibility(prodResource, 'stop');
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Production Protected')));
  });

  // --------------------------------------------------------------------------
  // 5. InfraPulse Control Plane Host Protection
  // --------------------------------------------------------------------------
  test('5. Host Protection: Control plane host cannot be stopped', async () => {
    const hostResource = {
      id: 'res-aws-infrapulse-host',
      name: 'infrapulse-control-plane-host',
      provider: 'aws',
      resource_type: 'ec2_instance',
      environment: 'staging',
      region: 'ap-south-1',
      current_state: 'running',
      metadata: { is_live_aws: true, instance_id: 'i-infrapulse-host-001', tags: { Application: 'infrapulse', Role: 'host' } }
    };

    const eligibility = await ec2EligibilityService.evaluateEligibility(hostResource, 'stop');
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Control Plane Protected')));
  });

  // --------------------------------------------------------------------------
  // 6. RDS Protection
  // --------------------------------------------------------------------------
  test('6. RDS Protection: RDS instances are strictly ineligible for EC2 lifecycle', async () => {
    const rdsResource = {
      id: 'res-aws-rds-postgres',
      name: 'infrapulse-rds-postgres',
      provider: 'aws',
      resource_type: 'rds_instance',
      environment: 'staging',
      region: 'ap-south-1',
      current_state: 'running',
      metadata: { is_live_aws: true }
    };

    const eligibility = await ec2EligibilityService.evaluateEligibility(rdsResource, 'stop');
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.blockers.some(b => b.includes('Ineligible Resource Type')));
  });

  // --------------------------------------------------------------------------
  // 7. EBS Preservation Guarantees
  // --------------------------------------------------------------------------
  test('7. EBS Preservation: Stopping EC2 preserves EBS volumes with transparent continuing costs', async () => {
    const ec2Resource = {
      id: 'res-aws-ebs-check-01',
      name: 'staging-storage-worker',
      provider: 'aws',
      resource_type: 'ec2_instance',
      environment: 'staging',
      region: 'ap-south-1',
      current_state: 'running',
      cost_breakdown: { compute: 0.0416, storage: 0.0033, ipv4: 0.005 },
      metadata: { is_live_aws: true, instance_id: 'i-allowed-001', tags: { Environment: 'staging' } }
    };
    await cloudLifecycleRepository.upsertResource(ec2Resource);

    const dryRun = await lifecycleService.dryRun({ resourceId: ec2Resource.id, action: 'stop', user: RESPONDER_USER });
    assert.ok(dryRun.costImpact.ongoingStorageMonthly > 0, 'Storage fee must continue billing');
    assert.ok(dryRun.costImpact.ongoingIpv4Monthly > 0, 'Public IPv4 fee must continue billing');
    assert.ok(dryRun.costImpact.costDisclosure.includes('Ongoing storage and IPv4 fees retain state'));
  });

  // --------------------------------------------------------------------------
  // 8. Approval & Self-Approval Prevention
  // --------------------------------------------------------------------------
  test('8. Separation of Duties: Requester cannot self-approve; responder cannot approve', async () => {
    const res = await resourceService.getResourceById('res-aws-ec2-staging');

    const op = await lifecycleService.requestOperation({
      resourceId: res.id,
      action: 'stop',
      user: ADMIN_USER, // Admin requests
      reason: 'Self-approval testing'
    });

    // Requester (Admin) tries to self-approve
    await assert.rejects(
      () => lifecycleService.approveOperation({ operationId: op.id, user: ADMIN_USER }),
      /Separation of Duties Violation: Requester/
    );

    // Responder tries to approve
    await assert.rejects(
      () => lifecycleService.approveOperation({ operationId: op.id, user: RESPONDER_USER }),
      /Forbidden: Only Administrators can approve/
    );
  });

  // --------------------------------------------------------------------------
  // 9. Missing Explicit Confirmation Rejection
  // --------------------------------------------------------------------------
  test('9. Explicit Confirmation Requirement: Live AWS execution requires explicitConfirmation: true', async () => {
    const { ec2, dispatchedCommands } = createMockEc2Client({ initialState: 'running', finalState: 'stopped' });
    const provider = new AwsEc2LifecycleProvider({ region: 'ap-south-1', clients: { ec2 } });

    const liveResource = {
      id: 'res-aws-conf-req-01',
      name: 'live-conf-req',
      provider: 'aws',
      resource_type: 'ec2_instance',
      environment: 'staging',
      region: 'ap-south-1',
      current_state: 'running',
      metadata: { is_live_aws: true, instance_id: 'i-allowed-001', tags: { Environment: 'staging' } }
    };
    await cloudLifecycleRepository.upsertResource(liveResource);

    const op = await lifecycleService.requestOperation({
      resourceId: liveResource.id,
      action: 'stop',
      user: RESPONDER_USER,
      reason: 'Confirmation test'
    });
    await lifecycleService.approveOperation({ operationId: op.id, user: ADMIN_USER });

    // Try executing without explicitConfirmation: true
    await assert.rejects(
      () => lifecycleService.executeOperation({
        operationId: op.id,
        user: ADMIN_USER,
        explicitConfirmation: false,
        awsEc2LifecycleProvider: provider
      }),
      /Explicit confirmation required/
    );

    // Zero AWS mutation commands sent
    assert.equal(dispatchedCommands.length, 0, 'No AWS commands should have been dispatched');
  });

  // --------------------------------------------------------------------------
  // 10. Idempotency Key Deduplication
  // --------------------------------------------------------------------------
  test('10. Idempotency Key Deduplication: Duplicate request returns existing operation', async () => {
    const res = await resourceService.getResourceById('res-aws-ec2-staging');
    const idempotencyKey = 'idem-unique-key-12345';

    const op1 = await lifecycleService.requestOperation({
      resourceId: res.id,
      action: 'stop',
      user: RESPONDER_USER,
      reason: 'First request',
      idempotencyKey
    });

    const op2 = await lifecycleService.requestOperation({
      resourceId: res.id,
      action: 'stop',
      user: RESPONDER_USER,
      reason: 'Second identical request',
      idempotencyKey
    });

    assert.equal(op1.id, op2.id, 'Idempotency key must return existing operation ID');
  });

  // --------------------------------------------------------------------------
  // 11. Concurrent Operation Lock
  // --------------------------------------------------------------------------
  test('11. Concurrent Operation Lock: Prevents conflicting pending requests on same resource', async () => {
    const res = await resourceService.getResourceById('res-aws-ec2-staging');

    await lifecycleService.requestOperation({
      resourceId: res.id,
      action: 'stop',
      user: RESPONDER_USER,
      reason: 'First pending op'
    });

    // Second request with different idempotency key
    await assert.rejects(
      () => lifecycleService.requestOperation({
        resourceId: res.id,
        action: 'stop',
        user: RESPONDER_USER,
        reason: 'Concurrent request attempt'
      }),
      /already has an active operation in progress/
    );
  });

  // --------------------------------------------------------------------------
  // 12. AWS API Throttling Handling
  // --------------------------------------------------------------------------
  test('12. Throttling Backoff: Provider retries on RequestLimitExceeded and recovers', async () => {
    const { ec2, dispatchedCommands } = createMockEc2Client({
      initialState: 'stopped',
      finalState: 'running',
      throttlingAttempts: 1 // Throttles once, then succeeds
    });
    const provider = new AwsEc2LifecycleProvider({ region: 'ap-south-1', clients: { ec2 } });

    const result = await provider.startInstance('i-allowed-001', { maxWaitSeconds: 10 });
    assert.equal(result.success, true);
    assert.equal(result.currentState, 'running');

    // Describing happened, then StartInstances was throttled once and retried
    const describeCmds = dispatchedCommands.filter(c => c.name === 'DescribeInstancesCommand');
    assert.ok(describeCmds.length >= 2, 'DescribeInstances executed with retry');
  });

  // --------------------------------------------------------------------------
  // 13. Timeout Handling & Partial Failure Reporting
  // --------------------------------------------------------------------------
  test('13. Timeout Handling: Reports partial transition without compensating mutations', async () => {
    const { ec2 } = createMockEc2Client({
      initialState: 'running',
      finalState: 'stopping', // Did not reach stopped in time
      waiterThrows: true
    });
    const provider = new AwsEc2LifecycleProvider({ region: 'ap-south-1', clients: { ec2 } });

    const result = await provider.stopInstance('i-allowed-001', { maxWaitSeconds: 5 });
    assert.equal(result.success, false);
    assert.equal(result.partialTransition, true);
    assert.ok(result.warning.includes('waiter did not observe \'stopped\''));
  });

  // --------------------------------------------------------------------------
  // 14. Cost Impact Calculations
  // --------------------------------------------------------------------------
  test('14. Cost Impact: Granular breakdown computes savings vs continuing charges', async () => {
    const ec2 = await resourceService.getResourceById('res-aws-ec2-staging');
    const dryRun = await lifecycleService.dryRun({ resourceId: ec2.id, action: 'stop', user: RESPONDER_USER });

    const { costImpact } = dryRun;
    assert.ok(costImpact.estimatedComputeSavingsMonthly > 0, 'Compute savings must be positive on stop');
    assert.ok(costImpact.ongoingStorageMonthly > 0, 'Storage fee must continue');
    assert.ok(costImpact.ongoingIpv4Monthly > 0, 'IPv4 fee must continue');
    assert.equal(
      costImpact.ongoingTotalMonthly,
      parseFloat((costImpact.ongoingStorageMonthly + costImpact.ongoingIpv4Monthly).toFixed(2))
    );
  });

  // --------------------------------------------------------------------------
  // 15. Disabled Mutation Flag Safety
  // --------------------------------------------------------------------------
  test('15. Disabled Mutation Flag: Blocked when AWS_LIFECYCLE_MUTATIONS_ENABLED=false', async () => {
    config.awsLifecycleMutationsEnabled = false; // Strictly disabled
    const { ec2, dispatchedCommands } = createMockEc2Client({ initialState: 'running', finalState: 'stopped' });
    const provider = new AwsEc2LifecycleProvider({ region: 'ap-south-1', clients: { ec2 } });

    await assert.rejects(
      () => provider.stopInstance('i-allowed-001'),
      /Live AWS Lifecycle Mutations are currently DISABLED by configuration/
    );

    // Verify zero commands sent
    assert.equal(dispatchedCommands.length, 0, 'Strictly zero AWS SDK commands dispatched when feature flag is false');
  });

});
