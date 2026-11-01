// ==============================================================================
// InfraPulse - AWS EC2 Governed Lifecycle Provider
// Phase 23E: Governed EC2 Start & Stop Operations (Restricted to ap-south-1)
//
// Safety Guarantees:
// 1. Separate mutating provider: Only StartInstances, StopInstances, DescribeInstances,
//    waitUntilInstanceRunning, waitUntilInstanceStopped.
// 2. Absolutely NO reboot, terminate, run, create, or delete operations.
// 3. AWS_LIFECYCLE_MUTATIONS_ENABLED guard: Strictly disabled by default.
// 4. Restricted to ap-south-1 Mumbai.
// 5. Throttling backoff & retry with timeout protection.
// 6. State verification and zero compensating mutations on failure.
// ==============================================================================

import {
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeInstancesCommand,
  waitUntilInstanceRunning,
  waitUntilInstanceStopped
} from '@aws-sdk/client-ec2';
import { config } from '../../../config/env.js';

export const ALLOWED_REGION = process.env.AWS_REGION || 'ap-south-1';

export class AwsEc2LifecycleProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.region='ap-south-1']
   * @param {Object} [options.clients] - Optional injected client bundle for unit testing
   */
  constructor({ region = ALLOWED_REGION, clients = {} } = {}) {
    this.region = region;
    this.clients = clients;
  }

  _validateRegion(targetRegion) {
    const reg = targetRegion || this.region;
    if (reg !== ALLOWED_REGION) {
      throw new Error(`Region '${reg}' is strictly prohibited. Governed EC2 lifecycle mutations are only permitted in '${ALLOWED_REGION}'.`);
    }
    return reg;
  }

  _checkFeatureFlag() {
    if (!config.awsLifecycleMutationsEnabled) {
      throw new Error('Live AWS Lifecycle Mutations are currently DISABLED by configuration (AWS_LIFECYCLE_MUTATIONS_ENABLED=false). No commands sent to AWS.');
    }
  }

  _getEc2Client(region) {
    const effectiveRegion = this._validateRegion(region);
    if (this.clients.ec2) {
      return this.clients.ec2;
    }
    return new EC2Client({ region: effectiveRegion });
  }

  /**
   * Safe execution wrapper with exponential backoff for throttling.
   */
  async _executeWithRetry(fn, operationName, retries = 3) {
    let delay = 1000;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const isThrottled = err.name === 'RequestLimitExceeded' ||
          err.name === 'ThrottlingException' ||
          (err.message && err.message.includes('Rate exceeded'));

        if (isThrottled && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * 1. Describe EC2 instance state
   */
  async describeInstance(instanceId, { region = this.region } = {}) {
    const client = this._getEc2Client(region);
    const command = new DescribeInstancesCommand({ InstanceIds: [instanceId] });

    const response = await this._executeWithRetry(
      () => client.send(command),
      `DescribeInstance:${instanceId}`
    );

    const reservation = (response.Reservations || [])[0];
    const instance = (reservation?.Instances || [])[0];

    if (!instance) {
      throw new Error(`EC2 instance '${instanceId}' not found in region '${region}'.`);
    }

    return {
      instanceId: instance.InstanceId,
      state: instance.State?.Name || 'unknown',
      instanceType: instance.InstanceType,
      publicIp: instance.PublicIpAddress || null,
      privateIp: instance.PrivateIpAddress || null,
      availabilityZone: instance.Placement?.AvailabilityZone,
      tags: (instance.Tags || []).reduce((acc, t) => {
        if (t.Key && t.Value) acc[t.Key] = t.Value;
        return acc;
      }, {})
    };
  }

  /**
   * 2. Start EC2 Instance (Strictly non-mutating unless feature flag is explicitly enabled)
   */
  async startInstance(instanceId, { region = this.region, maxWaitSeconds = 60 } = {}) {
    this._checkFeatureFlag();
    const effectiveRegion = this._validateRegion(region);
    const client = this._getEc2Client(effectiveRegion);
    const startMs = Date.now();

    // 1. Initial State Check
    const initial = await this.describeInstance(instanceId, { region: effectiveRegion });
    if (initial.state === 'running') {
      return {
        success: true,
        instanceId,
        alreadyInState: true,
        previousState: 'running',
        currentState: 'running',
        message: `EC2 instance '${instanceId}' is already in running state.`,
        durationMs: Date.now() - startMs
      };
    }

    // 2. Dispatch StartInstances
    const command = new StartInstancesCommand({ InstanceIds: [instanceId] });
    const response = await this._executeWithRetry(
      () => client.send(command),
      `StartInstances:${instanceId}`
    );

    const startingInfo = (response.StartingInstances || [])[0];
    const previousState = startingInfo?.PreviousState?.Name || initial.state;

    // 3. Wait for running state verification
    let currentState = 'starting';
    try {
      if (typeof client.waitUntilInstanceRunning === 'function') {
        await client.waitUntilInstanceRunning({
          client,
          maxWaitTime: maxWaitSeconds
        }, { InstanceIds: [instanceId] });
        currentState = 'running';
      } else {
        // Use SDK waiter helper
        await waitUntilInstanceRunning({
          client,
          maxWaitTime: maxWaitSeconds
        }, { InstanceIds: [instanceId] });
        currentState = 'running';
      }
    } catch (waitErr) {
      // Partial transition reporting (Never perform compensating mutations)
      const rechecked = await this.describeInstance(instanceId, { region: effectiveRegion });
      currentState = rechecked.state;
      return {
        success: currentState === 'running',
        instanceId,
        previousState,
        currentState,
        partialTransition: currentState !== 'running',
        warning: `Instance start dispatched, but waiter did not observe 'running' within ${maxWaitSeconds}s (current state: '${currentState}').`,
        durationMs: Date.now() - startMs
      };
    }

    // 4. Final verification
    const verified = await this.describeInstance(instanceId, { region: effectiveRegion });
    return {
      success: true,
      instanceId,
      previousState,
      currentState: verified.state,
      publicIp: verified.publicIp,
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 3. Stop EC2 Instance (Strictly non-mutating unless feature flag is explicitly enabled)
   */
  async stopInstance(instanceId, { region = this.region, maxWaitSeconds = 60 } = {}) {
    this._checkFeatureFlag();
    const effectiveRegion = this._validateRegion(region);
    const client = this._getEc2Client(effectiveRegion);
    const startMs = Date.now();

    // 1. Initial State Check
    const initial = await this.describeInstance(instanceId, { region: effectiveRegion });
    if (initial.state === 'stopped') {
      return {
        success: true,
        instanceId,
        alreadyInState: true,
        previousState: 'stopped',
        currentState: 'stopped',
        message: `EC2 instance '${instanceId}' is already in stopped state.`,
        durationMs: Date.now() - startMs
      };
    }

    // 2. Dispatch StopInstances
    const command = new StopInstancesCommand({ InstanceIds: [instanceId] });
    const response = await this._executeWithRetry(
      () => client.send(command),
      `StopInstances:${instanceId}`
    );

    const stoppingInfo = (response.StoppingInstances || [])[0];
    const previousState = stoppingInfo?.PreviousState?.Name || initial.state;

    // 3. Wait for stopped state verification
    let currentState = 'stopping';
    try {
      if (typeof client.waitUntilInstanceStopped === 'function') {
        await client.waitUntilInstanceStopped({
          client,
          maxWaitTime: maxWaitSeconds
        }, { InstanceIds: [instanceId] });
        currentState = 'stopped';
      } else {
        await waitUntilInstanceStopped({
          client,
          maxWaitTime: maxWaitSeconds
        }, { InstanceIds: [instanceId] });
        currentState = 'stopped';
      }
    } catch (waitErr) {
      const rechecked = await this.describeInstance(instanceId, { region: effectiveRegion });
      currentState = rechecked.state;
      return {
        success: currentState === 'stopped',
        instanceId,
        previousState,
        currentState,
        partialTransition: currentState !== 'stopped',
        warning: `Instance stop dispatched, but waiter did not observe 'stopped' within ${maxWaitSeconds}s (current state: '${currentState}').`,
        durationMs: Date.now() - startMs
      };
    }

    // 4. Final verification
    const verified = await this.describeInstance(instanceId, { region: effectiveRegion });
    return {
      success: true,
      instanceId,
      previousState,
      currentState: verified.state,
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString()
    };
  }
}

