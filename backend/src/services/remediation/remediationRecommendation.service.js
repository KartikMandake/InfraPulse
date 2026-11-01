import {governanceError} from '../../utils/governanceError.js';
// ==============================================================================
// InfraPulse - Remediation Recommendation Engine
// Phase 23J: Evidence-Backed RCA to Structured Remediation Recommendations
// ==============================================================================

import crypto from 'crypto';
import { remediationRepository } from '../../repositories/remediation.repository.js';
import * as incidentsRepo from '../../repositories/incidents.repository.js';
import { cloudLifecycleRepository } from '../../repositories/cloudLifecycle.repository.js';
import { workloadEligibilityService } from '../cloud-lifecycle/services/workloadEligibility.service.js';
import { riskAssessmentService } from './riskAssessment.service.js';
import { remediationPolicyService } from './remediationPolicy.service.js';

export const remediationRecommendationService = {
  /**
   * Evaluates an incident's RCA findings and generates governed remediation recommendations.
   * Core Rule: Never generate actionable recommendations from insufficient evidence or weak hypotheses.
   */
  async generateRecommendationsForIncident({
    incidentId,
    tenantId = 'default_tenant',
    user = null
  }) {
    const incident = await incidentsRepo.findIncidentById(incidentId);
    if (!incident) {
      throw governanceError(`Incident '${incidentId}' not found.`);
    }

    const recommendations = [];
    const rcaLevel = incident.rcaConfidenceLevel || 'STRONG_HYPOTHESIS';
    const hypotheses = Array.isArray(incident.rcaHypotheses) ? incident.rcaHypotheses : [];

    // Guard: Insufficient Evidence Check
    if (rcaLevel === 'WEAK_HYPOTHESIS' || hypotheses.length === 0) {
      return {
        incidentId,
        recommendationsGenerated: 0,
        recommendations: [],
        message: 'No actionable remediation generated: RCA evidence is inconclusive or hypothesis confidence is insufficient.'
      };
    }

    // Top hypothesis must meet quality threshold (score >= 60 and not weak hypothesis)
    const topHypothesis = hypotheses[0];
    if (topHypothesis.score < 60 || topHypothesis.confidenceLevel === 'WEAK_HYPOTHESIS') {
      return {
        incidentId,
        recommendationsGenerated: 0,
        recommendations: [],
        message: 'No actionable remediation generated: Top candidate score below threshold (60) or unverified hypothesis.'
      };
    }

    // Query all cloud infrastructure resources to identify matching workloads
    const allResources = await cloudLifecycleRepository.getAllResources();
    const serviceId = topHypothesis.candidateServiceId || incident.serviceId;

    // Filter resources belonging to the affected candidate service
    const matchedResources = allResources.filter(res => {
      const sId = (serviceId || '').toLowerCase();
      const rId = (res.id || '').toLowerCase();
      const rName = (res.name || '').toLowerCase();
      const composeSvc = (res.metadata?.compose_service || '').toLowerCase();
      const k8sApp = (res.metadata?.app || res.metadata?.['app.kubernetes.io/name'] || '').toLowerCase();
      return rId.includes(sId) || rName.includes(sId) || composeSvc === sId || k8sApp === sId;
    });

    if (matchedResources.length === 0) {
      return {
        incidentId,
        recommendationsGenerated: 0,
        recommendations: [],
        message: `No matching infrastructure resources found for candidate service '${serviceId}'.`
      };
    }

    for (const resource of matchedResources) {
      const proposed = this._determineProposedAction(resource, topHypothesis);
      if (!proposed) continue;

      // 1. Workload Safety & Eligibility Check
      const eligibility = await workloadEligibilityService.evaluateEligibility(
        resource,
        proposed.lifecycleAction,
        proposed.eligibilityOptions || {}
      );

      // 2. Deterministic Risk Assessment
      const riskAssessment = await riskAssessmentService.assessRisk({
        resource,
        action: proposed.actionName,
        incident,
        rcaConfidenceLevel: topHypothesis.confidenceLevel || rcaLevel
      });

      // 3. Policy Evaluation
      const policyResult = await remediationPolicyService.evaluatePolicy({
        tenantId,
        environment: resource.environment,
        provider: resource.provider,
        resourceType: resource.resource_type,
        action: proposed.actionName,
        riskLevel: riskAssessment.riskLevel,
        isProduction: ['production', 'prod'].includes((resource.environment || '').toLowerCase())
      });

      // Consolidate blocking reasons
      const blockingReasons = [
        ...eligibility.blockers,
        ...policyResult.blockers
      ];

      // Build Rollback Strategy
      const rollbackStrategy = this._buildRollbackStrategy(resource, proposed.actionName);

      // Create recommendation record
      const rec = await remediationRepository.createRecommendation({
        incidentId: incident.id,
        tenantId,
        environment: resource.environment,
        serviceId,
        resourceId: resource.id,
        detectedProblem: proposed.detectedProblem,
        proposedAction: proposed.actionName,
        expectedOutcome: proposed.expectedOutcome,
        supportingEvidence: [
          ...(topHypothesis.supportingEvidence || []),
          {
            type: 'resource_state',
            resourceId: resource.id,
            resourceName: resource.name,
            state: resource.current_state,
            provider: resource.provider
          }
        ],
        riskLevel: riskAssessment.riskLevel,
        riskScore: riskAssessment.riskScore,
        riskRationale: riskAssessment.riskRationale,
        confidenceScore: (topHypothesis.score || 85) / 100,
        blastRadius: riskAssessment.blastRadius,
        eligibilityResult: eligibility,
        blockingReasons,
        rollbackStrategy,
        status: blockingReasons.length > 0 ? 'BLOCKED' : 'PENDING'
      });

      // Create associated draft remediation plan with immutable SHA-256 hash
      const planPayload = {
        recommendationId: rec.id,
        tenantId,
        version: 1,
        action: proposed.actionName,
        targetResourceId: resource.id,
        targetResourceName: resource.name,
        provider: resource.provider,
        parameters: proposed.parameters,
        preconditions: [
          `Resource '${resource.id}' exists and is currently in state '${resource.current_state}'.`,
          `No active conflicting lock exists on resource '${resource.id}'.`,
          `Workload eligibility passed without safety blockers.`
        ],
        verificationCriteria: {
          expectedState: proposed.expectedState,
          timeoutSeconds: 60,
          verifyReadiness: true
        },
        rollbackPlan: rollbackStrategy
      };

      const planHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(planPayload))
        .digest('hex');

      const plan = await remediationRepository.createPlan({
        ...planPayload,
        planHash
      });

      recommendations.push({
        ...rec,
        planId: plan.id,
        planHash: plan.plan_hash,
        isExecutable: blockingReasons.length === 0
      });
    }

    return {
      incidentId,
      recommendationsGenerated: recommendations.length,
      recommendations
    };
  },

  /**
   * Determines allowlisted proposed action based on empirical infrastructure state and RCA finding.
   */
  _determineProposedAction(resource, hypothesis) {
    const provider = (resource.provider || '').toLowerCase();
    const type = (resource.resource_type || '').toLowerCase();
    const state = (resource.current_state || '').toLowerCase();

    // 1. Docker Containers
    if (provider === 'docker' || type.includes('container') || type.includes('compose')) {
      if (['crashed', 'stopped', 'exited', 'failed'].includes(state)) {
        return {
          actionName: 'DOCKER_CONTAINER_START',
          lifecycleAction: 'start',
          parameters: { containerName: resource.metadata?.container_name || resource.name },
          detectedProblem: `Container '${resource.name}' is in unready state '${state}'.`,
          expectedOutcome: `Start container to restore service availability.`,
          expectedState: 'running'
        };
      } else {
        return {
          actionName: 'DOCKER_CONTAINER_RESTART',
          lifecycleAction: 'restart',
          parameters: { containerName: resource.metadata?.container_name || resource.name, timeoutSeconds: 10 },
          detectedProblem: `Workload '${resource.name}' is degraded with high error rates or resource saturation.`,
          expectedOutcome: `Gracefully restart container to flush corrupted state and restore clean runtime.`,
          expectedState: 'running'
        };
      }
    }

    // 2. Kubernetes Workloads
    if (provider === 'kubernetes' || type.includes('deployment') || type.includes('statefulset')) {
      // Check for replica drift
      const currentReplicas = resource.metadata?.replicas || 1;
      const expectedReplicas = resource.metadata?.expectedReplicas || 2;
      if (currentReplicas < expectedReplicas) {
        return {
          actionName: 'K8S_REPLICA_RESTORE',
          lifecycleAction: 'scale',
          parameters: {
            workloadName: resource.name,
            namespace: resource.metadata?.namespace || 'infrapulse',
            targetReplicas: expectedReplicas
          },
          eligibilityOptions: { targetReplicas: expectedReplicas },
          detectedProblem: `Deployment '${resource.name}' has drifted below desired replica count (${currentReplicas}/${expectedReplicas}).`,
          expectedOutcome: `Restore deployment replica count to approved baseline (${expectedReplicas} replicas).`,
          expectedState: 'running'
        };
      } else {
        return {
          actionName: 'K8S_DEPLOYMENT_RESTART',
          lifecycleAction: 'restart',
          parameters: {
            workloadName: resource.name,
            namespace: resource.metadata?.namespace || 'infrapulse'
          },
          detectedProblem: `Deployment '${resource.name}' pods are experiencing CrashLoopBackOff or high error rates.`,
          expectedOutcome: `Execute controlled rollout restart of pods to restore operational readiness.`,
          expectedState: 'running'
        };
      }
    }

    // 3. AWS EC2 Workloads
    if (provider === 'aws' || type.includes('ec2')) {
      if (['stopped', 'stopping'].includes(state)) {
        return {
          actionName: 'AWS_EC2_START',
          lifecycleAction: 'start',
          parameters: { instanceId: resource.metadata?.instance_id || resource.id.replace(/^aws-/, '') },
          detectedProblem: `EC2 instance '${resource.name}' is currently in state '${state}'.`,
          expectedOutcome: `Start EC2 instance in ap-south-1 to recover compute capacity.`,
          expectedState: 'running'
        };
      }
    }

    return null;
  },

  /**
   * Generates a safe, non-destructive rollback strategy for the action.
   */
  _buildRollbackStrategy(resource, actionName) {
    switch (actionName) {
      case 'DOCKER_CONTAINER_START':
        return {
          isReversible: true,
          rollbackAction: 'DOCKER_CONTAINER_STOP',
          compensatingProcedure: `If started container fails health checks, gracefully stop container with 10s SIGTERM timeout to avoid host resource exhaustion.`,
          manualVerificationRequired: true
        };
      case 'DOCKER_CONTAINER_RESTART':
        return {
          isReversible: false,
          rollbackAction: null,
          compensatingProcedure: `Restart cannot be directly inverted. If restart fails, preserve container logs, keep container isolated, and escalate to incident commander.`,
          manualVerificationRequired: true
        };
      case 'K8S_REPLICA_RESTORE':
        return {
          isReversible: true,
          rollbackAction: 'K8S_REPLICA_SCALE',
          compensatingProcedure: `If restored replicas fail to become ready, revert replica count to previous level to prevent node saturation.`,
          manualVerificationRequired: false
        };
      case 'K8S_DEPLOYMENT_RESTART':
        return {
          isReversible: false,
          rollbackAction: null,
          compensatingProcedure: `Rollout restart triggers standard Kubernetes rolling update. If new pods fail readiness probe, Kubernetes automatically retains existing pods.`,
          manualVerificationRequired: true
        };
      case 'AWS_EC2_START':
        return {
          isReversible: true,
          rollbackAction: 'AWS_EC2_STOP',
          compensatingProcedure: `If started EC2 instance fails system status checks within 5 minutes, stop instance to prevent ongoing compute charges while preserving EBS storage.`,
          manualVerificationRequired: true
        };
      default:
        return {
          isReversible: false,
          rollbackAction: null,
          compensatingProcedure: `Halt automated actions, preserve execution audit records, and notify on-call SRE.`,
          manualVerificationRequired: true
        };
    }
  }
};

