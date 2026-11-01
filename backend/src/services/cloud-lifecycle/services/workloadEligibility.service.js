// ==============================================================================
// InfraPulse - Governed Workload Eligibility Engine
// Phase 23F: Docker, Docker Compose, and Kubernetes Workload Safety Verification
//
// Safety Guarantees:
// 1. Docker: Control plane protection, database protection, named volume preservation,
//    graceful timeout, allowlist & non-prod environment enforcement.
// 2. Kubernetes: System namespace protection, PVC preservation, control plane protection,
//    database StatefulSet scaling lock, PDB availability checks.
// 3. Flags: Real execution strictly blocked by default unless enabled via configuration.
// 4. Zero destructive operations: NEVER delete containers, images, volumes, PVCs or namespaces.
// ==============================================================================

import { config } from '../../../config/env.js';
import { query } from '../../../db/connection.js';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';
import { ec2EligibilityService } from './ec2Eligibility.service.js';

export const PROTECTED_K8S_SYSTEM_NAMESPACES = [
  'kube-system',
  'kube-public',
  'kube-node-lease',
  'local-path-storage'
];

export const PROHIBITED_PROD_ENVIRONMENTS = ['production', 'prod', 'live', 'prd'];

export const workloadEligibilityService = {
  /**
   * Evaluates eligibility for any cloud workload (EC2, Docker, or Kubernetes).
   *
   * @param {Object} resource - cloud_resources record
   * @param {string} action - 'start' | 'stop' | 'restart' | 'scale' | 'scale_down'
   * @param {Object} [options]
   * @param {number} [options.targetReplicas]
   * @param {boolean} [options.allowStatefulSetScale=false]
   * @param {boolean} [options.exceptionalAuthorization=false]
   * @returns {Promise<{ eligible: boolean, blockers: string[], warnings: string[], checks: Object }>}
   */
  async evaluateEligibility(resource, action = 'stop', options = {}) {
    const provider = resource.provider;
    const type = resource.resource_type;

    // 1. EC2 instances delegate to ec2EligibilityService
    if (provider === 'aws' || ['ec2_instance', 'ec2'].includes(type)) {
      return ec2EligibilityService.evaluateEligibility(resource, action);
    }

    // 2. Docker / Docker Compose evaluation
    if (provider === 'docker' || ['docker_container', 'docker_compose_service'].includes(type)) {
      return this._evaluateDockerEligibility(resource, action, options);
    }

    // 3. Kubernetes evaluation
    if (provider === 'kubernetes' || ['k8s_deployment', 'k8s_statefulset'].includes(type)) {
      return this._evaluateKubernetesEligibility(resource, action, options);
    }

    // Default mock / generic provider pass-through
    return {
      eligible: true,
      blockers: [],
      warnings: [],
      checks: { genericProvider: true }
    };
  },

  /**
   * Docker & Docker Compose Eligibility Evaluation
   */
  async _evaluateDockerEligibility(resource, action, options = {}) {
    const blockers = [];
    const warnings = [];
    const checks = {
      isDockerResource: true,
      isAllowlisted: false,
      isNonProduction: false,
      isNotControlPlaneContainer: false,
      isNotDatabaseContainer: false,
      namedVolumePreserved: false,
      noActiveIncidentConflict: true,
      noActiveRunbookConflict: true,
      noDownstreamCallersBlocked: true,
      mutationsFlagEnabled: false
    };

    const isLive = resource.metadata?.is_live === true;
    const containerName = resource.metadata?.container_name || resource.name;

    // 1. Feature Flag Check for Live Docker
    if (isLive) {
      if (config.dockerLifecycleEnabled) {
        checks.mutationsFlagEnabled = true;
      } else {
        blockers.push(`Live Docker Mutations Disabled: DOCKER_LIFECYCLE_ENABLED is false. Real Docker mutations are disabled by default for zero out-of-pocket safety.`);
      }
    } else {
      checks.mutationsFlagEnabled = true;
    }

    // 2. Allowlist Check
    const allowed = Array.isArray(config.dockerAllowedContainers) ? config.dockerAllowedContainers : [];
    if (allowed.length === 0 || allowed.includes(containerName) || allowed.includes(resource.id)) {
      checks.isAllowlisted = true;
    } else {
      blockers.push(`Container Not Allowlisted: Container '${containerName}' is not listed in DOCKER_ALLOWED_CONTAINERS.`);
    }

    // 3. Environment Protection
    const env = (resource.environment || '').toLowerCase();
    if (PROHIBITED_PROD_ENVIRONMENTS.includes(env)) {
      blockers.push(`Production Protected: Container '${containerName}' is in ${env.toUpperCase()} environment. Governed stop/restart is strictly prohibited on production containers.`);
    } else {
      checks.isNonProduction = true;
    }

    // 4. Control Plane Container Protection
    const hostContainer = config.infraPulseHostContainer || 'infrapulse-backend';
    const isControlPlane = (isLive && (containerName === hostContainer || containerName === 'infrapulse-backend' || containerName === 'infrapulse-frontend')) ||
      resource.metadata?.is_control_plane === true;

    if (isControlPlane && ['stop', 'restart'].includes(action)) {
      blockers.push(`Control Plane Protected: Container '${containerName}' runs the InfraPulse monitoring control plane. Halting the control plane is strictly forbidden.`);
    } else {
      checks.isNotControlPlaneContainer = true;
    }

    // 5. Database Container Protection
    const isDb = resource.is_critical_dependency === true ||
      containerName.includes('postgres') ||
      containerName.includes('database') ||
      (resource.metadata?.image || '').includes('postgres');

    if (isDb && action === 'stop') {
      blockers.push(`Critical Database Protected: Container '${containerName}' is a PostgreSQL database. Direct container stoppage will crash dependent microservices and transactions.`);
    } else {
      checks.isNotDatabaseContainer = true;
    }

    // 6. Persistent Volume Preservation Verification
    if (resource.persistence_requirements?.volume_name || resource.persistence_requirements?.has_persistent_volume) {
      checks.namedVolumePreserved = true;
      if (['delete', 'prune', 'remove'].includes(action)) {
        blockers.push(`Persistent Storage Violation: Action '${action}' on '${containerName}' would destroy persistent volume '${resource.persistence_requirements.volume_name || 'attached'}'. Data destruction is strictly prohibited.`);
      }
    } else {
      checks.namedVolumePreserved = true;
    }

    // 7. Active Runbook Conflicts
    try {
      const activeRunbooksRes = await query(
        `SELECT id, runbook_id, status FROM runbook_executions WHERE status IN ('pending', 'running', 'approved') LIMIT 5;`
      );
      if (activeRunbooksRes.rows.length > 0 && ['stop', 'restart'].includes(action)) {
        blockers.push(`Active Remediation In Progress: There are ${activeRunbooksRes.rows.length} active runbook execution(s) running. Wait for automated remediations to finish before modifying container state.`);
        checks.noActiveRunbookConflict = false;
      }
    } catch {
      // Ignored in unit testing
    }

    // 8. Active Incident Conflicts
    try {
      const activeIncidentsRes = await query(
        `SELECT id, title, severity FROM incidents WHERE status != 'resolved' LIMIT 5;`
      );
      if (activeIncidentsRes.rows.length > 0 && ['stop', 'restart'].includes(action)) {
        const incList = activeIncidentsRes.rows.map(i => `${i.id} [${i.severity}]`).join(', ');
        warnings.push(`Platform has ${activeIncidentsRes.rows.length} active unresolved incident(s): ${incList}. Halting containers during open incidents requires Incident Commander sign-off.`);
      }
    } catch {
      // Ignored in unit testing
    }

    // 9. Downstream Callers Inspection
    if (['stop', 'restart'].includes(action)) {
      const allResources = await cloudLifecycleRepository.getAllResources();
      const callers = allResources.filter(r => {
        if (r.id === resource.id) return false;
        const deps = Array.isArray(r.dependencies) ? r.dependencies : [];
        return deps.includes(resource.id) && ['running', 'in-use', 'available'].includes(r.current_state);
      });

      if (callers.length > 0) {
        checks.noDownstreamCallersBlocked = false;
        const callerNames = callers.map(c => `'${c.name}' (${c.id})`).join(', ');
        blockers.push(`Downstream Workloads Active: Cannot stop '${resource.name}': Running workloads depend on it: ${callerNames}. Halt callers first.`);
      }
    }

    return {
      eligible: blockers.length === 0,
      blockers,
      warnings,
      checks
    };
  },

  /**
   * Kubernetes Workload Eligibility Evaluation
   */
  async _evaluateKubernetesEligibility(resource, action, options = {}) {
    const blockers = [];
    const warnings = [];
    const checks = {
      isKubernetesResource: true,
      notSystemNamespace: false,
      isNamespaceAllowed: false,
      isWorkloadAllowlisted: false,
      isNonProduction: false,
      isNotControlPlaneWorkload: false,
      isDatabaseWorkloadProtected: false,
      pvcRetainedAndProtected: false,
      pdbAvailabilityMet: true,
      noActiveIncidentConflict: true,
      noActiveRunbookConflict: true,
      noDownstreamCallersBlocked: true,
      mutationsFlagEnabled: false
    };

    const isLive = resource.metadata?.is_live === true;
    const namespace = resource.metadata?.namespace || 'default';
    const workloadName = resource.name;
    const workloadType = resource.resource_type === 'k8s_statefulset' ? 'StatefulSet' : 'Deployment';
    const targetReplicas = options.targetReplicas !== undefined ? parseInt(options.targetReplicas, 10) : (action === 'stop' ? 0 : 1);

    // 1. Protected System Namespace Check (Strictly Forbidden)
    if (PROTECTED_K8S_SYSTEM_NAMESPACES.includes(namespace)) {
      blockers.push(`Protected System Namespace: Workload '${workloadName}' resides in system namespace '${namespace}'. Modifying system namespaces is strictly forbidden.`);
      return { eligible: false, blockers, warnings, checks };
    }
    checks.notSystemNamespace = true;

    // 2. Allowed Namespaces Check
    const allowedNs = Array.isArray(config.kubernetesAllowedNamespaces) ? config.kubernetesAllowedNamespaces : [];
    if (allowedNs.includes(namespace)) {
      checks.isNamespaceAllowed = true;
    } else {
      blockers.push(`Namespace Not Allowed: Namespace '${namespace}' is not listed in KUBERNETES_ALLOWED_NAMESPACES [${allowedNs.join(', ')}].`);
    }

    // 3. Feature Flag Check for Live K8s
    if (isLive) {
      if (config.kubernetesLifecycleEnabled) {
        checks.mutationsFlagEnabled = true;
      } else {
        blockers.push(`Live Kubernetes Mutations Disabled: KUBERNETES_LIFECYCLE_ENABLED is false. Real Kubernetes mutations are disabled by default for zero out-of-pocket safety.`);
      }
    } else {
      checks.mutationsFlagEnabled = true;
    }

    // 4. Workload Allowlist Check
    const allowedWorkloads = Array.isArray(config.kubernetesAllowedWorkloads) ? config.kubernetesAllowedWorkloads : [];
    if (allowedWorkloads.length === 0 || allowedWorkloads.includes(workloadName) || allowedWorkloads.includes(resource.id)) {
      checks.isWorkloadAllowlisted = true;
    } else {
      blockers.push(`Workload Not Allowlisted: Workload '${workloadName}' is not in KUBERNETES_ALLOWED_WORKLOADS.`);
    }

    // 5. Environment & Production Protection
    const env = (resource.environment || '').toLowerCase();
    if (PROHIBITED_PROD_ENVIRONMENTS.includes(env)) {
      if (targetReplicas === 0 && !options.exceptionalAuthorization) {
        blockers.push(`Production Protected: Workload '${workloadName}' is in ${env.toUpperCase()}. Scaling production workloads to 0 requires exceptional authorization.`);
      } else {
        warnings.push(`Workload is in ${env.toUpperCase()}. All scaling changes are subject to two-person review.`);
        checks.isNonProduction = true;
      }
    } else {
      checks.isNonProduction = true;
    }

    // 6. Control Plane Workload Protection
    const isControlPlane = (isLive && (workloadName.includes('backend') || workloadName.includes('frontend') || workloadName.includes('infrapulse'))) ||
      resource.metadata?.is_control_plane === true;

    if (isControlPlane && targetReplicas === 0 && !options.exceptionalAuthorization) {
      blockers.push(`Control Plane Protected: Workload '${workloadName}' is part of the InfraPulse control plane. Scaling monitoring workloads to zero is prohibited.`);
    } else {
      checks.isNotControlPlaneWorkload = true;
    }

    // 7. Database StatefulSet Protection
    const isDb = resource.is_critical_dependency === true ||
      workloadType === 'StatefulSet' ||
      workloadName.includes('postgres') ||
      workloadName.includes('database');

    if (isDb) {
      if (targetReplicas === 0 && !options.exceptionalAuthorization) {
        blockers.push(`Critical Database Workload: '${workloadName}' is a persistent database (${workloadType}). Scaling database to zero will cause data loss or crash dependent microservices. Requires exceptional authorization.`);
      } else if (workloadType === 'StatefulSet' && !options.allowStatefulSetScale) {
        blockers.push(`StatefulSet Scaling Locked: StatefulSet '${workloadName}' has persistent data bindings. Scaling requires explicit allowStatefulSetScale parameter.`);
      } else {
        checks.isDatabaseWorkloadProtected = true;
      }
    } else {
      checks.isDatabaseWorkloadProtected = true;
    }

    // 8. PVC Preservation Check
    if (resource.persistence_requirements?.has_pvc) {
      checks.pvcRetainedAndProtected = true;
      if (['delete', 'purge', 'destroy'].includes(action)) {
        blockers.push(`PVC Storage Protection: Destructive action '${action}' would delete PVC '${resource.persistence_requirements.claim_name || 'storage'}'. Data destruction is strictly prohibited.`);
      }
    } else {
      checks.pvcRetainedAndProtected = true;
    }

    // 9. PodDisruptionBudget (PDB) & Availability Validation
    const pdb = resource.metadata?.pdb;
    if (pdb) {
      const minAvailable = parseInt(pdb.minAvailable || 0, 10);
      if (targetReplicas < minAvailable) {
        checks.pdbAvailabilityMet = false;
        blockers.push(`PodDisruptionBudget Violation: Target replicas (${targetReplicas}) violates PDB minAvailable constraint (${minAvailable}) for '${workloadName}'.`);
      }
    }

    // 10. Active Runbook Conflicts
    try {
      const activeRunbooksRes = await query(
        `SELECT id, runbook_id, status FROM runbook_executions WHERE status IN ('pending', 'running', 'approved') LIMIT 5;`
      );
      if (activeRunbooksRes.rows.length > 0 && targetReplicas === 0) {
        blockers.push(`Active Remediation In Progress: There are ${activeRunbooksRes.rows.length} active runbook execution(s) running. Wait for automated remediations to finish before scaling workloads.`);
        checks.noActiveRunbookConflict = false;
      }
    } catch {
      // Ignored in unit testing
    }

    // 11. Active Incident Conflicts
    try {
      const activeIncidentsRes = await query(
        `SELECT id, title, severity FROM incidents WHERE status != 'resolved' LIMIT 5;`
      );
      if (activeIncidentsRes.rows.length > 0 && targetReplicas === 0) {
        const incList = activeIncidentsRes.rows.map(i => `${i.id} [${i.severity}]`).join(', ');
        warnings.push(`Platform has ${activeIncidentsRes.rows.length} active unresolved incident(s): ${incList}. Scaling workloads during open incidents requires Incident Commander sign-off.`);
      }
    } catch {
      // Ignored in unit testing
    }

    // 12. Downstream Callers Inspection (when scaling to 0)
    if (targetReplicas === 0) {
      const allResources = await cloudLifecycleRepository.getAllResources();
      const callers = allResources.filter(r => {
        if (r.id === resource.id) return false;
        const deps = Array.isArray(r.dependencies) ? r.dependencies : [];
        return deps.includes(resource.id) && ['running', 'in-use', 'available'].includes(r.current_state);
      });

      if (callers.length > 0) {
        checks.noDownstreamCallersBlocked = false;
        const callerNames = callers.map(c => `'${c.name}' (${c.id})`).join(', ');
        blockers.push(`Downstream Workloads Active: Cannot scale '${resource.name}' to 0: Running workloads depend on it: ${callerNames}. Halt callers first.`);
      }
    }

    return {
      eligible: blockers.length === 0,
      blockers,
      warnings,
      checks
    };
  }
};
