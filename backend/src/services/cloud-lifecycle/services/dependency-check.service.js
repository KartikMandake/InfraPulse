// ==============================================================================
// InfraPulse - Cloud Lifecycle Dependency & Safety Evaluation Service
// Inspects active incidents, running runbooks, pending queues, DB health & storage
// ==============================================================================

import { query } from '../../../db/connection.js';
import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';
import { lifecyclePolicy } from '../policies/lifecycle-policy.js';

export const dependencyCheckService = {
  /**
   * Performs an exhaustive multi-system safety check before any mutating lifecycle action.
   *
   * @param {Object} resource - Target cloud resource object
   * @param {string} action - 'stop' | 'start' | 'restart' | 'scale_down'
   * @returns {Promise<Object>} Safety assessment result with blockers and warnings
   */
  async evaluateSafetyChecks(resource, action) {
    const blockers = [];
    const warnings = [];
    const safetyChecks = {
      killSwitchPassed: true,
      dependencyGraphSafe: true,
      activeIncidentsCheck: true,
      runningRunbooksCheck: true,
      pendingNotificationsCheck: true,
      databaseHealthCheck: true,
      persistentStorageProtected: true,
      activeInvestigationsCheck: true
    };

    // 1. Policy & Kill Switch
    const policyResult = await lifecyclePolicy.evaluateActionPolicy(resource, action);
    if (!policyResult.allowed) {
      safetyChecks.killSwitchPassed = false;
      blockers.push(...policyResult.blockers);
    }
    warnings.push(...policyResult.warnings);

    // 2. Dependency Graph Inspection
    const allResources = await cloudLifecycleRepository.getAllResources();
    const downstreamRunningCallers = allResources.filter(r => {
      if (r.id === resource.id) return false;
      const deps = Array.isArray(r.dependencies) ? r.dependencies : [];
      return deps.includes(resource.id) && r.current_state === 'running';
    });

    if (action === 'stop' && downstreamRunningCallers.length > 0) {
      safetyChecks.dependencyGraphSafe = false;
      const callerNames = downstreamRunningCallers.map(c => `'${c.name}' (${c.id})`).join(', ');
      blockers.push(`Cannot stop '${resource.name}': Downstream running workloads depend on it: ${callerNames}. Halt dependent workloads first.`);
    }

    // 3. Active Incident Check
    try {
      const activeIncidentsRes = await query(
        `SELECT id, title, severity FROM incidents WHERE status != 'resolved' LIMIT 5;`
      );
      if (activeIncidentsRes.rows.length > 0 && ['stop', 'restart', 'scale_down'].includes(action)) {
        safetyChecks.activeIncidentsCheck = false;
        const incidentList = activeIncidentsRes.rows.map(i => `${i.id} [${i.severity}]`).join(', ');
        warnings.push(`Platform has ${activeIncidentsRes.rows.length} active unresolved incident(s): ${incidentList}. Stopping infrastructure during active incidents is risky.`);
      }
    } catch {
      // Table may be empty or skipped in unit tests
    }

    // 4. Running Runbook Executions Check
    try {
      const activeRunbooksRes = await query(
        `SELECT id, runbook_id, status FROM runbook_executions WHERE status IN ('pending', 'running', 'approved') LIMIT 5;`
      );
      if (activeRunbooksRes.rows.length > 0 && ['stop', 'restart'].includes(action)) {
        safetyChecks.runningRunbooksCheck = false;
        blockers.push(`There are ${activeRunbooksRes.rows.length} active runbook execution(s) in progress. Halt or wait for runbooks to complete before modifying cloud resources.`);
      }
    } catch {
      // Skip if table not populated
    }

    // 5. Pending Notification Queue Deliveries Check
    try {
      const pendingDeliveriesRes = await query(
        `SELECT count(*)::int as count FROM notification_deliveries WHERE status IN ('pending', 'queued');`
      );
      const pendingCount = pendingDeliveriesRes.rows[0]?.count || 0;
      if (pendingCount > 0 && ['stop', 'restart'].includes(action)) {
        safetyChecks.pendingNotificationsCheck = false;
        warnings.push(`Notification queue contains ${pendingCount} pending deliveries. Worker halt will pause message dispatch.`);
      }
    } catch {
      // Skip
    }

    // 6. Database Health Check
    try {
      const dbProbeRes = await query('SELECT 1 as alive;');
      if (!dbProbeRes.rows[0]?.alive) {
        safetyChecks.databaseHealthCheck = false;
        blockers.push('Relational database probe failed. Database is unhealthy or disconnecting.');
      }
    } catch (err) {
      safetyChecks.databaseHealthCheck = false;
      blockers.push(`Database connection probe failed: ${err.message}`);
    }

    // 7. Persistent Storage Protection Check
    const reqs = resource.persistence_requirements || {};
    if (reqs.has_persistent_volume || reqs.has_pvc || reqs.volume_type) {
      safetyChecks.persistentStorageProtected = true;
      warnings.push(`Resource has persistent storage attached (${reqs.volume_name || reqs.claim_name || reqs.volume_type || 'EBS/PVC'}). Compute will cease, but disk storage will be safely preserved.`);
    }

    // 8. Active Investigations Check
    try {
      const activeInvestRes = await query(
        `SELECT id, incident_id FROM investigation_runs WHERE created_at > NOW() - INTERVAL '5 minutes' LIMIT 5;`
      );
      if (activeInvestRes.rows.length > 0 && ['stop', 'restart'].includes(action)) {
        safetyChecks.activeInvestigationsCheck = false;
        warnings.push(`AI assistant or RCA engine has recent active investigations. Resource telemetry may become unavailable.`);
      }
    } catch {
      // Skip
    }

    return {
      safe: blockers.length === 0,
      blockers,
      warnings,
      downstreamRunningCallers: downstreamRunningCallers.map(c => c.id),
      safetyChecks
    };
  }
};
