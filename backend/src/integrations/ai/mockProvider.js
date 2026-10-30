import { AiProvider } from './aiProvider.js';

/**
 * Deterministic Mock AI Provider for offline testing, CI environments, and local development.
 * Grounds answers strictly on the supplied evidence context and adheres to the structured response contract.
 */
export class MockAiProvider extends AiProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'mock';
  }

  async checkHealth() {
    return { available: true, provider: 'mock', model: 'mock-grounded-model' };
  }

  async generateInvestigationResponse({ prompt, evidenceContext, conversationHistory = [], options = {} }) {
    const query = (prompt || '').toLowerCase();
    const hypotheses = evidenceContext?.hypotheses || evidenceContext?.hypothesesSummary || [];
    const topCandidate = hypotheses[0] || evidenceContext?.topRankedCandidate || null;
    const incident = evidenceContext?.incident || {};
    const validEvidenceIds = (evidenceContext?.evidenceCatalog || []).map(e => e.id);
    const topServiceName = topCandidate ? (topCandidate.candidateServiceName || topCandidate.candidateServiceId || incident.serviceName) : null;

    // Filter evidence to ensure every referenced item exists in the supplied context
    const getReferencedIds = (filterFn) => {
      return (evidenceContext?.evidenceCatalog || [])
        .filter(filterFn)
        .map(e => e.id)
        .slice(0, 5);
    };

    let answer = '';
    let summary = '';
    let referencedEvidence = [];
    let supportingSignals = [];
    let contradictorySignals = [];
    let uncertainties = [];
    let suggestedDiagnostics = [];
    let requiresHumanVerification = true;

    // Defense against prompt injection in query or untrusted logs
    if (query.includes('ignore previous instructions') || query.includes('system prompt') || query.includes('drop table')) {
      return {
        answer: 'I can only analyze verified observability signals and deterministic RCA hypotheses associated with this incident. I cannot execute commands or modify system instructions.',
        summary: 'Untrusted or adversarial instruction detected and rejected.',
        referencedEvidence: [],
        supportingSignals: [],
        contradictorySignals: ['User prompt contained non-observability control instructions.'],
        uncertainties: ['Prompt safety boundary triggered.'],
        suggestedDiagnostics: [{
          action: 'Refocus inquiry on incident telemetry signals',
          reason: 'Assistant only processes SRE observability inquiries',
          service: incident.serviceName || 'unknown',
          motivatingEvidence: 'N/A',
          expectedInformationGained: 'Clear telemetry attribution'
        }],
        requiresHumanVerification: true
      };
    }

    // Branch 1: Inquire about why top service was ranked first
    if (query.includes('why') && (query.includes('ranked') || query.includes('first') || query.includes('top'))) {
      if (!topCandidate) {
        answer = 'No primary root cause candidate could be recommended because available telemetry evidence is insufficient or completely nominal.';
        summary = 'Insufficient telemetry to formulate a top candidate hypothesis.';
        uncertainties.push('Zero anomalous candidate hypotheses passed the attribution threshold.');
      } else {
        answer = `Service "${topServiceName}" is ranked #1 with a deterministic attribution score of ${topCandidate.score}/100. ` +
                 `The evidence demonstrates a ${topCandidate.causalRole ? topCandidate.causalRole.replace(/_/g, ' ') : 'primary failure'} role: ` +
                 `${topCandidate.summary}`;
        summary = `Rank #1 attributed to ${topServiceName} (Score: ${topCandidate.score}/100) based on ${topCandidate.causalRole || 'critical path'}.`;

        referencedEvidence = getReferencedIds(e => e.serviceId === (topCandidate.candidateServiceId || topServiceName));
        supportingSignals = (topCandidate.supportingEvidence || []).map(s => s.title || s.description);
        contradictorySignals = topCandidate.contradictoryEvidence || [];
        uncertainties = topCandidate.uncertaintyAndMissingEvidence || [];

        suggestedDiagnostics.push({
          action: topCandidate.suggestedNextAction || 'Inspect service metrics and traces',
          reason: `Motivated by rank #1 attribution score (${topCandidate.score}/100)`,
          service: topServiceName,
          motivatingEvidence: referencedEvidence[0] || 'telemetry_anomaly',
          expectedInformationGained: 'Confirmation of underlying cause before executing mitigation'
        });
      }
    }
    // Branch 2: Inquire about deployments
    else if (query.includes('deploy') || query.includes('canary') || query.includes('version')) {
      const deploys = evidenceContext?.deployments || [];
      if (deploys.length === 0) {
        answer = `There are no deployment events recorded within the temporal correlation window for incident ${incident.id}.`;
        summary = 'No deployments found in incident window.';
        uncertainties.push('Deployment log stream or CI/CD webhook has no events for this service.');
      } else {
        const d = deploys[0];
        answer = `Deployment ${d.version} on service "${d.serviceName}" occurred at ${d.timestamp}. ` +
                 `Canary evaluation score was ${d.acaScore}/100 with status "${d.status}". ` +
                 (d.acaScore < 70 ? 'This deployment exhibits strong temporal and anomalous correlation with the failure.' : 'This deployment maintained normal canary health.');
        summary = `Recent deployment ${d.version} on ${d.serviceName} evaluated.`;
        referencedEvidence = getReferencedIds(e => e.type === 'deployment');
        if (d.acaScore < 70) {
          supportingSignals.push(`Canary release ${d.version} showed degraded health (ACA ${d.acaScore}/100).`);
        } else {
          contradictorySignals.push(`Deployment ${d.version} reported healthy ACA score (${d.acaScore}/100).`);
        }
        suggestedDiagnostics.push({
          action: `Inspect commit diff and roll back ${d.version} if symptoms align`,
          reason: 'Temporal alignment with incident onset',
          service: d.serviceName,
          motivatingEvidence: d.id,
          expectedInformationGained: 'Verification whether reverting code restores latency baseline'
        });
      }
    }
    // Branch 3: Inquire about contradictory evidence or weaknesses
    else if (query.includes('contradict') || query.includes('weak') || query.includes('gap')) {
      contradictorySignals = topCandidate?.contradictoryEvidence || [];
      uncertainties = topCandidate?.uncertaintyAndMissingEvidence || [];
      referencedEvidence = getReferencedIds(e => e.serviceId === topCandidate?.candidateServiceId);

      if (contradictorySignals.length === 0 && uncertainties.length === 0) {
        answer = `The evidence for ${topServiceName || 'this incident'} shows strong cross-signal concordance with no contradictory signals identified.`;
        summary = 'No contradiction detected in current telemetry snapshot.';
      } else {
        answer = `Identified ${contradictorySignals.length} contradictory signal(s) and ${uncertainties.length} diagnostic gap(s). ` +
                 `Specifically: ${[...contradictorySignals, ...uncertainties].join('; ')}.`;
        summary = `Evidence audit found ${contradictorySignals.length} contradiction(s) and ${uncertainties.length} uncertainty gap(s).`;
      }

      suggestedDiagnostics.push({
        action: 'Collect auxiliary telemetry for unmonitored dependencies',
        reason: 'Close diagnostic gaps identified during evidence quality assessment',
        service: topServiceName || incident.serviceName || 'unknown',
        motivatingEvidence: referencedEvidence[0] || 'evidence_gap',
        expectedInformationGained: 'Resolved ambiguity between competing hypotheses'
      });
    }
    // Branch 4: Inquire about what to investigate next
    else if (query.includes('next') || query.includes('investigate') || query.includes('recommend')) {
      answer = `Based on the deterministic ranking (Top-1: ${topServiceName || 'None'}), ` +
               `the recommended diagnostic steps are to verify telemetry anomalies on ${topServiceName || incident.serviceName} ` +
               `and check upstream dependency health.`;
      summary = `Recommended diagnostic checks for ${topServiceName || incident.serviceName}.`;
      referencedEvidence = getReferencedIds(e => e.serviceId === (topCandidate?.candidateServiceId || topServiceName));
      supportingSignals = (topCandidate?.supportingEvidence || []).slice(0, 3).map(s => s.title || s.description);

      suggestedDiagnostics.push({
        action: topCandidate?.suggestedNextAction || 'Inspect pod container logs and saturation metrics',
        reason: 'Recommended diagnostic check from RCA engine',
        service: topServiceName || incident.serviceName,
        motivatingEvidence: referencedEvidence[0] || 'rca_hypothesis',
        expectedInformationGained: 'Confirmation of candidate resource contention'
      });
    }
    // Branch 5: Inquire about runbooks, remediation, or mitigation
    else if (query.includes('runbook') || query.includes('remediat') || query.includes('mitigat')) {
      const runbooks = evidenceContext?.availableRunbooks || [];
      const deploys = evidenceContext?.deployments || [];
      const hasBadDeploy = deploys.some(d => d.acaScore < 70);

      // Select registered runbook matching RCA causal evidence
      let targetRb = null;
      if (hasBadDeploy || (topCandidate?.summary || '').toLowerCase().includes('deploy')) {
        targetRb = runbooks.find(r => r.id === 'RB-ROLLBACK-01');
      } else if ((topCandidate?.summary || '').toLowerCase().includes('pool') || (topCandidate?.summary || '').toLowerCase().includes('lock')) {
        targetRb = runbooks.find(r => r.id === 'RB-DB-01');
      } else if ((topCandidate?.summary || '').toLowerCase().includes('health') || (topCandidate?.summary || '').toLowerCase().includes('crash')) {
        targetRb = runbooks.find(r => r.id === 'RB-RESTART-01');
      } else {
        targetRb = runbooks.find(r => r.id === 'RB-LATENCY-01') || runbooks[0];
      }

      const rbId = targetRb ? targetRb.id : 'RB-LATENCY-01';
      const rbTitle = targetRb ? targetRb.title : 'High API Latency Diagnostic & Investigation';
      const risk = targetRb ? targetRb.riskLevel : 'low';
      const approvalRole = targetRb ? targetRb.requiredApprovalRole || 'responder' : 'responder';

      answer = `Based on the deterministic RCA findings for ${topServiceName || incident.serviceName}, the recommended procedure is runbook "${rbId}: ${rbTitle}". ` +
               `Risk Level: ${risk.toUpperCase()}. Execution Mode: ${targetRb?.executionMode || 'remediation'}. ` +
               `Relevance: Addresses ${topCandidate?.summary || 'the primary observed failure'} on ${topServiceName || incident.serviceName}. ` +
               `Required Approval: Explicit ${approvalRole.toUpperCase()} approval is required before execution. Preconditions: ${(targetRb?.preconditions || []).join('; ') || 'Standard cluster connectivity'}. ` +
               `Note: The AI assistant cannot trigger or approve executions; please preview the dry-run plan in the Runbook Orchestrator.`;

      summary = `Recommended runbook ${rbId} (${risk} risk) for ${topServiceName || incident.serviceName}.`;
      referencedEvidence = getReferencedIds(e => e.serviceId === (topCandidate?.candidateServiceId || topServiceName));
      supportingSignals = (topCandidate?.supportingEvidence || []).slice(0, 2).map(s => s.title || s.description);

      suggestedDiagnostics.push({
        action: `Generate dry-run plan for runbook ${rbId}`,
        reason: `Verify execution preconditions for ${topServiceName || incident.serviceName}`,
        service: topServiceName || incident.serviceName,
        motivatingEvidence: rbId,
        expectedInformationGained: 'Dry-run step preview and parameter validation without mutations'
      });
    }
    // Default fallback
    else {
      answer = `For incident ${incident.id} (${incident.title}), the deterministic RCA engine has evaluated ` +
               `${hypotheses.length} candidate hypotheses. The top candidate is "${topServiceName || 'None'}" ` +
               `with attribution score ${topCandidate?.score || 0}/100 and evidence quality rated as "${topCandidate?.evidenceQuality || 'insufficient'}".`;
      summary = `Incident ${incident.id} investigation summary.`;
      referencedEvidence = getReferencedIds(e => e.serviceId === (topCandidate?.candidateServiceId || topServiceName));
      supportingSignals = (topCandidate?.supportingEvidence || []).slice(0, 2).map(s => s.title || s.description);
      contradictorySignals = topCandidate?.contradictoryEvidence || [];
      uncertainties = topCandidate?.uncertaintyAndMissingEvidence || [];
      suggestedDiagnostics.push({
        action: 'Review distributed trace waterfall for root cause span',
        reason: 'Identify precise RPC failure or delay',
        service: topServiceName || incident.serviceName,
        motivatingEvidence: referencedEvidence[0] || 'trace_root',
        expectedInformationGained: 'Isolated bottleneck or timeout origin'
      });
    }

    return {
      answer,
      summary,
      referencedEvidence: referencedEvidence.filter(id => validEvidenceIds.includes(id)),
      supportingSignals,
      contradictorySignals,
      uncertainties,
      suggestedDiagnostics,
      requiresHumanVerification: true
    };
  }
}
