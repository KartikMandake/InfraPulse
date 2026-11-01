// ==============================================================================
// InfraPulse - Cloud Lifecycle Orchestration Service
// Manages dry-runs, requests, two-person approvals, execution & safe workflows
// Phase 23F: Governed Docker & Kubernetes Workload Lifecycle Management
// ==============================================================================

import crypto from 'crypto';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';
import { dependencyCheckService } from './dependency-check.service.js';
import { resourceService } from './resource.service.js';
import { workloadEligibilityService } from './workloadEligibility.service.js';
import { AwsEc2LifecycleProvider } from '../providers/awsEc2Lifecycle.provider.js';
import { DockerLifecycleProvider } from '../providers/dockerLifecycle.provider.js';
import { KubernetesLifecycleProvider } from '../providers/kubernetesLifecycle.provider.js';
import { lifecyclePolicy } from '../policies/lifecycle-policy.js';
import { recordAuditEvent } from '../../audit.service.js';

export const lifecycleService = {
  /**
   * 1. DRY-RUN PREVIEW
   * Evaluates safety checks, workload eligibility, dependencies, persistent storage,
   * replica scaling, shared-node implications, and disaggregated cost impact.
   */
  async dryRun({ resourceId, action, user, targetReplicas, allowStatefulSetScale = false, exceptionalAuthorization = false }) {
    const resource = await resourceService.getResourceById(resourceId);
    const safetyAssessment = await dependencyCheckService.evaluateSafetyChecks(resource, action);

    // Unified Workload Eligibility Engine (EC2, Docker, Kubernetes)
    const eligibility = await workloadEligibilityService.evaluateEligibility(resource, action, {
      targetReplicas,
      allowStatefulSetScale,
      exceptionalAuthorization
    });

    if (!eligibility.eligible) {
      safetyAssessment.safe = false;
      safetyAssessment.blockers.push(...eligibility.blockers);
    }
    safetyAssessment.warnings.push(...eligibility.warnings);

    // Disaggregated Cost & Resource Impact Calculation
    const compute = parseFloat(resource.cost_breakdown?.compute || 0);
    const storage = parseFloat(resource.cost_breakdown?.storage || 0);
    const ipv4 = parseFloat(resource.cost_breakdown?.ipv4 || 0);

    const isDocker = resource.provider === 'docker' || ['docker_container', 'docker_compose_service'].includes(resource.resource_type);
    const isK8s = resource.provider === 'kubernetes' || ['k8s_deployment', 'k8s_statefulset'].includes(resource.resource_type);

    let costImpact = {
      action,
      hourlyCompute: compute,
      hourlyStorage: storage,
      hourlyIpv4: ipv4,
      estimatedComputeSavingsMonthly: action === 'stop' ? parseFloat((compute * 730).toFixed(2)) : 0,
      ongoingStorageMonthly: parseFloat((storage * 730).toFixed(2)),
      ongoingIpv4Monthly: parseFloat((ipv4 * 730).toFixed(2)),
      ongoingTotalMonthly: parseFloat(((storage + ipv4) * 730).toFixed(2)),
      expectedMonthlyComputeCost: action === 'start' ? parseFloat((compute * 730).toFixed(2)) : 0,
      costDisclosure: 'Calculated from published AWS ap-south-1 On-Demand rates. Ongoing storage and IPv4 fees retain state and continue billing after compute stops. Never a zero-cost operation.'
    };

    if (isDocker) {
      costImpact = {
        action,
        resourceType: resource.resource_type,
        containerName: resource.metadata?.container_name || resource.name,
        resourceAllocation: {
          cpu: resource.metadata?.cpu || '0.5 vCPU',
          memory: resource.metadata?.memory || '512 MB'
        },
        ongoingStorageMonthly: storage > 0 ? parseFloat((storage * 730).toFixed(2)) : 0,
        persistentVolumePreserved: resource.persistence_requirements?.volume_name || (resource.persistence_requirements?.has_persistent_volume ? 'pgdata' : null),
        sharedNodeImplications: 'Container runs on shared host Docker daemon. Stopping container terminates processes and reclaims host CPU/RAM. Persistent volumes remain safely intact on host storage.',
        costDisclosure: 'Docker containers running on existing host incur zero incremental cloud bill change when stopped. Host billing continues unchanged.'
      };
    } else if (isK8s) {
      const currentReplicas = resource.metadata?.replicas || 1;
      const target = targetReplicas !== undefined ? parseInt(targetReplicas, 10) : (action === 'stop' ? 0 : 1);
      const replicaDelta = currentReplicas - target;
      const hourlyPerReplica = currentReplicas > 0 ? compute / currentReplicas : 0;
      const computeSavingsMonthly = replicaDelta > 0 ? parseFloat((replicaDelta * hourlyPerReplica * 730).toFixed(2)) : 0;

      costImpact = {
        action,
        resourceType: resource.resource_type,
        workloadName: resource.name,
        namespace: resource.metadata?.namespace || 'infrapulse',
        replicasBefore: currentReplicas,
        replicasAfter: target,
        resourceAllocation: {
          cpuRequests: '250m',
          cpuLimits: '500m',
          memoryRequests: '256Mi',
          memoryLimits: '512Mi'
        },
        estimatedComputeSavingsMonthly: computeSavingsMonthly,
        ongoingStorageMonthly: parseFloat((storage * 730).toFixed(2)),
        pvcRetained: resource.persistence_requirements?.claim_name || (resource.persistence_requirements?.has_pvc ? 'gp3-pvc' : null),
        sharedNodeImplications: 'Scaling Kubernetes workload adjusts replica count across cluster worker nodes. Reclaimed capacity frees CPU/RAM on worker nodes. Cloud billing reduces only if Kubernetes Cluster Autoscaler terminates underutilized nodes.',
        costDisclosure: 'Persistent Volume Claims (PVCs) continue to bill for allocated gp3 storage regardless of workload replica count.'
      };
    }

    const dryRunId = `dry_${crypto.randomBytes(6).toString('hex')}`;
    const status = safetyAssessment.safe ? 'dry_run_passed' : 'dry_run_failed';

    const operation = await cloudLifecycleRepository.createOperation({
      id: dryRunId,
      resource_id: resourceId,
      action,
      status,
      is_dry_run: true,
      safety_checks: {
        ...safetyAssessment,
        eligibility,
        costImpact
      },
      requested_by: user?.email || user?.name || 'anonymous',
      requester_role: user?.role || 'viewer',
      execution_logs: [
        {
          timestamp: new Date().toISOString(),
          message: `Dry-run evaluation for action '${action}' completed with status: ${status}.`,
          safetyAssessment,
          costImpact
        }
      ]
    });

    return {
      dryRunId: operation.id,
      resource: {
        id: resource.id,
        name: resource.name,
        provider: resource.provider,
        currentState: resource.current_state,
        environment: resource.environment,
        isLiveAws: resource.metadata?.is_live_aws === true,
        isLive: resource.metadata?.is_live === true
      },
      action,
      safe: safetyAssessment.safe,
      status,
      blockers: safetyAssessment.blockers,
      warnings: safetyAssessment.warnings,
      downstreamRunningCallers: safetyAssessment.downstreamRunningCallers,
      safetyChecks: safetyAssessment.safetyChecks,
      eligibility,
      costImpact,
      requiresApproval: resource.environment === 'production' || ['stop', 'restart', 'scale_down', 'scale'].includes(action) || resource.metadata?.is_live_aws === true || resource.metadata?.is_live === true
    };
  },

  /**
   * 2. REQUEST LIFECYCLE OPERATION
   * Creates an official pending operation record with idempotency & concurrency protection.
   */
  async requestOperation({ resourceId, action, idempotencyKey, user, dryRunId, targetReplicas, allowStatefulSetScale = false, exceptionalAuthorization = false, reason = null }) {
    // RBAC: Viewers cannot create mutating requests
    if (user?.role === 'viewer' && ['start', 'stop', 'restart', 'scale_up', 'scale_down', 'scale'].includes(action)) {
      throw new Error(`Forbidden: Role 'viewer' is not authorized to request cloud lifecycle operations. Minimum role required: 'responder'.`);
    }

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = await cloudLifecycleRepository.getOperationByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    // 2. Concurrency Lock
    const activeOp = await cloudLifecycleRepository.getActiveOperationOnResource(resourceId);
    if (activeOp) {
      throw new Error(`Resource '${resourceId}' already has an active operation in progress (${activeOp.id}: ${activeOp.action} [${activeOp.status}]). Please wait for it to complete.`);
    }

    // 3. Resource & Policy Pre-Check
    const resource = await resourceService.getResourceById(resourceId);
    const killSwitch = await lifecyclePolicy.getKillSwitchState();
    if (killSwitch.active) {
      throw new Error(`Request Rejected: Kill Switch Active (${killSwitch.reason}).`);
    }

    // 4. Workload Eligibility Evaluation
    const eligibility = await workloadEligibilityService.evaluateEligibility(resource, action, {
      targetReplicas,
      allowStatefulSetScale,
      exceptionalAuthorization
    });

    const isLive = resource.metadata?.is_live_aws === true || resource.metadata?.is_live === true;
    if (isLive && !eligibility.eligible) {
      throw new Error(`Request rejected by workload safety rules: ${eligibility.blockers.join('; ')}`);
    }

    // 5. Create official operation record
    const operationId = `op_${crypto.randomBytes(6).toString('hex')}`;
    const operation = await cloudLifecycleRepository.createOperation({
      id: operationId,
      resource_id: resourceId,
      action,
      status: 'pending_approval',
      is_dry_run: false,
      safety_checks: {
        eligibility,
        dryRunId,
        targetReplicas,
        allowStatefulSetScale,
        exceptionalAuthorization
      },
      requested_by: user.email,
      requester_role: user.role,
      idempotency_key: idempotencyKey,
      execution_logs: [
        {
          timestamp: new Date().toISOString(),
          message: `Operation '${action}' requested by ${user.email} (${user.role}). Reason: ${reason || 'Not specified'}. Pending two-person approval.`
        }
      ]
    });

    await recordAuditEvent({
      userId: user.id || null,
      userEmail: user.email,
      action: 'CLOUD_OPERATION_REQUESTED',
      resourceType: 'cloud_operation',
      resourceId: operationId,
      details: { resource_id: resourceId, action, idempotency_key: idempotencyKey, reason }
    });

    return operation;
  },

  /**
   * 3. APPROVE OPERATION (Admin Only, Strict Separation of Duties)
   */
  async approveOperation({ operationId, user }) {
    if (user?.role !== 'admin') {
      throw new Error('Forbidden: Only Administrators can approve cloud lifecycle operations.');
    }

    const operation = await cloudLifecycleRepository.getOperationById(operationId);
    if (!operation) throw new Error(`Operation '${operationId}' not found.`);

    if (operation.status !== 'pending_approval') {
      throw new Error(`Operation '${operationId}' cannot be approved because it is in '${operation.status}' status.`);
    }

    // Separation of Duties: Requester cannot self-approve
    if (operation.requested_by === user.email) {
      throw new Error(`Separation of Duties Violation: Requester (${user.email}) cannot self-approve their own lifecycle request.`);
    }

    const updated = await cloudLifecycleRepository.updateOperationStatus(operationId, {
      status: 'approved',
      approved_by: user.email,
      approved_at: new Date().toISOString(),
      execution_logs: [
        ...(Array.isArray(operation.execution_logs) ? operation.execution_logs : []),
        {
          timestamp: new Date().toISOString(),
          message: `Operation approved by Administrator (${user.email}). Ready for execution.`
        }
      ]
    });

    await recordAuditEvent({
      userId: user.id || null,
      userEmail: user.email,
      action: 'CLOUD_OPERATION_APPROVED',
      resourceType: 'cloud_operation',
      resourceId: operationId,
      details: { resource_id: operation.resource_id, action: operation.action, requested_by: operation.requested_by }
    });

    return updated;
  },

  /**
   * 4. EXECUTE OPERATION
   * Handles simulated workloads, live AWS EC2, live Docker, and live Kubernetes.
   */
  async executeOperation({
    operationId,
    user,
    dryRunOverride = false,
    explicitConfirmation = false,
    awsEc2LifecycleProvider = null,
    dockerLifecycleProvider = null,
    kubernetesLifecycleProvider = null
  }) {
    const operation = await cloudLifecycleRepository.getOperationById(operationId);
    if (!operation) throw new Error(`Operation '${operationId}' not found.`);

    if (operation.status !== 'approved' && !dryRunOverride) {
      throw new Error(`Execution Denied: Operation '${operationId}' has not been approved (current status: '${operation.status}').`);
    }

    // Check Kill Switch before execution
    const killSwitch = await lifecyclePolicy.getKillSwitchState();
    if (killSwitch.active) {
      throw new Error(`Execution Blocked: Kill Switch Active (${killSwitch.reason}).`);
    }

    const resource = await resourceService.getResourceById(operation.resource_id);
    const isLiveAws = resource.metadata?.is_live_aws === true;
    const isLiveDocker = resource.provider === 'docker' && resource.metadata?.is_live === true;
    const isLiveK8s = resource.provider === 'kubernetes' && resource.metadata?.is_live === true;
    const isAnyLive = isLiveAws || isLiveDocker || isLiveK8s;

    // Explicit Confirmation Requirement for Real Live Mutations
    if (isAnyLive && !explicitConfirmation) {
      throw new Error('Explicit confirmation required: Governed live infrastructure mutation requires explicit administrative confirmation (explicitConfirmation: true) immediately prior to execution.');
    }

    // Re-verify workload eligibility at execution time
    const eligibility = await workloadEligibilityService.evaluateEligibility(resource, operation.action, {
      targetReplicas: operation.safety_checks?.targetReplicas,
      allowStatefulSetScale: operation.safety_checks?.allowStatefulSetScale,
      exceptionalAuthorization: operation.safety_checks?.exceptionalAuthorization
    });

    if (!eligibility.eligible) {
      await cloudLifecycleRepository.updateOperationStatus(operationId, {
        status: 'failed',
        rejection_reason: `Workload safety checks failed at execution time: ${eligibility.blockers.join('; ')}`
      });
      throw new Error(`Execution blocked by workload safety rules: ${eligibility.blockers.join('; ')}`);
    }

    // Re-verify multi-system safety checks at execution time
    const safetyAssessment = await dependencyCheckService.evaluateSafetyChecks(resource, operation.action);
    if (!safetyAssessment.safe) {
      await cloudLifecycleRepository.updateOperationStatus(operationId, {
        status: 'failed',
        rejection_reason: `Safety checks failed at execution time: ${safetyAssessment.blockers.join('; ')}`
      });
      throw new Error(`Pre-execution safety check failed: ${safetyAssessment.blockers.join('; ')}`);
    }

    // Safe Start dependency ordering: Ensure upstream dependencies are running
    if (operation.action === 'start') {
      const allResources = await cloudLifecycleRepository.getAllResources();
      const deps = Array.isArray(resource.dependencies) ? resource.dependencies : [];
      const unreadyDeps = allResources.filter(r => deps.includes(r.id) && !['running', 'in-use', 'available'].includes(r.current_state));

      if (unreadyDeps.length > 0) {
        const unreadyNames = unreadyDeps.map(d => `'${d.name}' (${d.current_state})`).join(', ');
        throw new Error(`Safe Start Precondition Failed: Upstream dependencies for '${resource.name}' are not running: ${unreadyNames}. Start dependencies first.`);
      }
    }

    // Mark status: executing
    await cloudLifecycleRepository.updateOperationStatus(operationId, {
      status: 'executing',
      executed_at: new Date().toISOString()
    });

    let result;
    try {
      if (isLiveAws) {
        // Real AWS EC2 mutation execution
        const ec2Provider = awsEc2LifecycleProvider || new AwsEc2LifecycleProvider({ region: resource.region || 'ap-south-1' });
        const targetInstanceId = resource.metadata?.instance_id || resource.id.replace(/^aws-/, '');

        if (operation.action === 'start') {
          result = await ec2Provider.startInstance(targetInstanceId, { region: resource.region });
        } else if (operation.action === 'stop') {
          result = await ec2Provider.stopInstance(targetInstanceId, { region: resource.region });
        } else {
          throw new Error(`Unsupported live AWS action: '${operation.action}'. Only 'start' and 'stop' are permitted.`);
        }

        const newState = result.currentState || resource.current_state;
        await cloudLifecycleRepository.updateResourceState(resource.id, newState, operation.action);

        const completedOp = await cloudLifecycleRepository.updateOperationStatus(operationId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          execution_logs: [
            ...(Array.isArray(operation.execution_logs) ? operation.execution_logs : []),
            {
              timestamp: new Date().toISOString(),
              message: `Live AWS EC2 mutation '${operation.action}' executed successfully via AwsEc2LifecycleProvider in ${resource.region}.`,
              result
            }
          ]
        });

        await recordAuditEvent({
          userId: user?.id || null,
          userEmail: user?.email || 'system',
          action: operation.action === 'start' ? 'CLOUD_AWS_EC2_STARTED' : 'CLOUD_AWS_EC2_STOPPED',
          resourceType: 'cloud_operation',
          resourceId: operationId,
          details: { resource_id: resource.id, action: operation.action, newState, isLiveAws: true }
        });

        return {
          success: true,
          operation: completedOp,
          result
        };
      } else if (isLiveDocker) {
        // Live Docker Container Mutation Execution
        const dockerProvider = dockerLifecycleProvider || new DockerLifecycleProvider();
        const containerName = resource.metadata?.container_name || resource.name;

        if (operation.action === 'start') {
          result = await dockerProvider.startContainer(containerName);
        } else if (operation.action === 'stop') {
          result = await dockerProvider.stopContainer(containerName, { timeoutSeconds: 10 });
        } else if (operation.action === 'restart') {
          result = await dockerProvider.restartContainer(containerName, { timeoutSeconds: 10 });
        } else {
          throw new Error(`Unsupported live Docker action: '${operation.action}'.`);
        }

        const newState = result.currentState || (operation.action === 'stop' ? 'stopped' : 'running');
        await cloudLifecycleRepository.updateResourceState(resource.id, newState, operation.action);

        const completedOp = await cloudLifecycleRepository.updateOperationStatus(operationId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          execution_logs: [
            ...(Array.isArray(operation.execution_logs) ? operation.execution_logs : []),
            {
              timestamp: new Date().toISOString(),
              message: `Live Docker mutation '${operation.action}' executed successfully on container '${containerName}'.`,
              result
            }
          ]
        });

        await recordAuditEvent({
          userId: user?.id || null,
          userEmail: user?.email || 'system',
          action: `CLOUD_DOCKER_CONTAINER_${operation.action.toUpperCase()}ED`,
          resourceType: 'cloud_operation',
          resourceId: operationId,
          details: { resource_id: resource.id, action: operation.action, newState, isLive: true }
        });

        return {
          success: true,
          operation: completedOp,
          result
        };
      } else if (isLiveK8s) {
        // Live Kubernetes Workload Mutation Execution
        const k8sProvider = kubernetesLifecycleProvider || new KubernetesLifecycleProvider();
        const namespace = resource.metadata?.namespace || 'infrapulse';
        const workloadName = resource.name;
        const targetReplicas = operation.safety_checks?.targetReplicas !== undefined ? operation.safety_checks.targetReplicas : (operation.action === 'stop' ? 0 : 1);
        const allowStatefulSetScale = operation.safety_checks?.allowStatefulSetScale === true;

        if (resource.resource_type === 'k8s_statefulset') {
          result = await k8sProvider.scaleStatefulSet(workloadName, namespace, targetReplicas, { allowStatefulSetScale });
        } else {
          result = await k8sProvider.scaleDeployment(workloadName, namespace, targetReplicas);
        }

        const newState = targetReplicas === 0 ? 'scaled_down' : 'running';
        await cloudLifecycleRepository.updateResourceState(resource.id, newState, operation.action);

        const completedOp = await cloudLifecycleRepository.updateOperationStatus(operationId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          execution_logs: [
            ...(Array.isArray(operation.execution_logs) ? operation.execution_logs : []),
            {
              timestamp: new Date().toISOString(),
              message: `Live Kubernetes workload '${workloadName}' in namespace '${namespace}' scaled to ${targetReplicas} replicas.`,
              result
            }
          ]
        });

        await recordAuditEvent({
          userId: user?.id || null,
          userEmail: user?.email || 'system',
          action: 'CLOUD_K8S_WORKLOAD_SCALED',
          resourceType: 'cloud_operation',
          resourceId: operationId,
          details: { resource_id: resource.id, action: operation.action, targetReplicas, newState, isLive: true }
        });

        return {
          success: true,
          operation: completedOp,
          result
        };
      } else {
        // Deterministic Simulation Execution (Docker, K8s, Mock Baseline)
        const provider = resourceService.getProvider(resource.provider);
        switch (operation.action) {
          case 'start':
            result = await provider.start(resource);
            break;
          case 'stop':
            result = await provider.stop(resource);
            break;
          case 'restart':
            result = await provider.restart(resource);
            break;
          case 'scale_down':
            result = await provider.scale(resource, { replicas: 0 });
            break;
          case 'scale_up':
            result = await provider.scale(resource, { replicas: resource.metadata?.replicas || 2 });
            break;
          case 'scale':
            result = await provider.scale(resource, { replicas: operation.safety_checks?.targetReplicas !== undefined ? operation.safety_checks.targetReplicas : 1 });
            break;
          default:
            result = await provider.inspect(resource);
        }

        // Update resource state
        await cloudLifecycleRepository.updateResourceState(resource.id, result.newState || resource.current_state, operation.action);

        const completedOp = await cloudLifecycleRepository.updateOperationStatus(operationId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          execution_logs: [
            ...(Array.isArray(operation.execution_logs) ? operation.execution_logs : []),
            {
              timestamp: new Date().toISOString(),
              message: `Execution of '${operation.action}' completed successfully via ${resource.provider} simulated provider.`,
              result
            }
          ]
        });

        await recordAuditEvent({
          userId: user?.id || null,
          userEmail: user?.email || 'system',
          action: 'CLOUD_OPERATION_EXECUTED',
          resourceType: 'cloud_operation',
          resourceId: operationId,
          details: { resource_id: resource.id, action: operation.action, newState: result.newState }
        });

        return {
          success: true,
          operation: completedOp,
          result
        };
      }
    } catch (execErr) {
      await cloudLifecycleRepository.updateOperationStatus(operationId, {
        status: 'failed',
        rejection_reason: execErr.message
      });
      throw execErr;
    }
  },

  /**
   * 5. CANCEL OPERATION
   */
  async cancelOperation({ operationId, user, reason }) {
    const operation = await cloudLifecycleRepository.getOperationById(operationId);
    if (!operation) throw new Error(`Operation '${operationId}' not found.`);

    if (['completed', 'cancelled', 'executing'].includes(operation.status)) {
      throw new Error(`Operation in '${operation.status}' status cannot be cancelled.`);
    }

    const updated = await cloudLifecycleRepository.updateOperationStatus(operationId, {
      status: 'cancelled',
      rejection_reason: reason || `Cancelled by ${user?.email || 'user'}`
    });

    await recordAuditEvent({
      userId: user?.id || null,
      userEmail: user?.email || 'user',
      action: 'CLOUD_OPERATION_CANCELLED',
      resourceType: 'cloud_operation',
      resourceId: operationId,
      details: { reason }
    });

    return updated;
  }
};
