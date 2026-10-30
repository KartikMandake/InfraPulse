import { runRcaAnalysis } from '../../backend/src/engine/rcaEngine.js';
import { RCA_EVALUATION_DATASET } from './scenarios.dataset.js';

/**
 * RCA Evaluation Framework & Metric Calculator
 *
 * Evaluates the deterministic RCA engine against the labeled benchmark dataset.
 * Computes:
 * - Top-1 Accuracy: Proportion where the ground-truth root cause is ranked #1.
 * - Top-3 Accuracy: Proportion where the ground-truth root cause is in top 3.
 * - Mean Reciprocal Rank (MRR): 1 / rank of true root cause (0 if not in list).
 * - False-Positive Rate: Identification of false alarms / ambiguous incidents.
 * - Insufficient Evidence Detection Rate.
 * - Evaluation Duration per scenario.
 */
export function evaluateRCAEngine(dataset = RCA_EVALUATION_DATASET) {
  console.log('[RCAEvaluation] Beginning evaluation across', dataset.length, 'labeled scenarios...');

  const results = [];
  let top1Matches = 0;
  let top3Matches = 0;
  let reciprocalRankSum = 0;
  let totalWithGroundTruth = 0;
  let falsePositiveCount = 0;
  let falseAlarmCases = 0;
  let insufficientEvidenceCorrect = 0;
  let insufficientEvidenceTotal = 0;

  for (const item of dataset) {
    const start = performance.now();
    const rankedCandidates = runRcaAnalysis({
      incident: item.evidence.incident,
      services: item.evidence.services,
      alerts: item.evidence.alerts,
      deployments: item.evidence.deployments,
      logs: item.evidence.logs,
      traces: item.evidence.traces
    });
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    const topCandidate = rankedCandidates[0] || null;
    const top3Ids = rankedCandidates.slice(0, 3).map(c => c.candidateServiceId);

    const gt = item.groundTruth;
    let rank = -1;
    let isTop1 = false;
    let isTop3 = false;
    let rr = 0;

    if (gt.expectedRootCauseServiceId) {
      totalWithGroundTruth++;
      rank = rankedCandidates.findIndex(c => c.candidateServiceId === gt.expectedRootCauseServiceId);
      if (rank === 0) {
        top1Matches++;
        isTop1 = true;
      }
      if (rank >= 0 && rank < 3) {
        top3Matches++;
        isTop3 = true;
      }
      if (rank >= 0) {
        rr = 1 / (rank + 1);
        reciprocalRankSum += rr;
      }
    } else {
      // Ambiguous / False alarm case
      falseAlarmCases++;
      // If score exceeds 40, classify as false positive
      if (topCandidate && topCandidate.score > 40) {
        falsePositiveCount++;
      }
    }

    if (!gt.sufficientEvidence) {
      insufficientEvidenceTotal++;
      // Verified if no candidate, or topCandidate.sufficientEvidence === false, or quality is weak/insufficient, or score < 50
      if (!topCandidate || topCandidate.sufficientEvidence === false || ['weak', 'insufficient'].includes(topCandidate.evidenceQuality) || topCandidate.score < 50) {
        insufficientEvidenceCorrect++;
      }
    }

    results.push({
      id: item.id,
      name: item.name,
      type: item.type,
      durationMs,
      expected: gt.expectedRootCauseServiceId,
      actualTop1: topCandidate?.candidateServiceId || 'none',
      actualScore: topCandidate?.score || 0,
      rank: rank >= 0 ? rank + 1 : 'N/A',
      isTop1,
      isTop3,
      reciprocalRank: Math.round(rr * 1000) / 1000,
      top3Candidates: top3Ids
    });
  }

  const top1Accuracy = totalWithGroundTruth > 0 ? Math.round((top1Matches / totalWithGroundTruth) * 1000) / 10 : 0;
  const top3Accuracy = totalWithGroundTruth > 0 ? Math.round((top3Matches / totalWithGroundTruth) * 1000) / 10 : 0;
  const mrr = totalWithGroundTruth > 0 ? Math.round((reciprocalRankSum / totalWithGroundTruth) * 1000) / 1000 : 0;
  const falsePositiveRate = falseAlarmCases > 0 ? Math.round((falsePositiveCount / falseAlarmCases) * 1000) / 10 : 0;
  const insufficientEvidenceAccuracy = insufficientEvidenceTotal > 0
    ? Math.round((insufficientEvidenceCorrect / insufficientEvidenceTotal) * 1000) / 10
    : 100;

  const summary = {
    totalScenarios: dataset.length,
    scenariosWithTarget: totalWithGroundTruth,
    top1Accuracy: `${top1Accuracy}%`,
    top3Accuracy: `${top3Accuracy}%`,
    meanReciprocalRank: mrr,
    falsePositiveRate: `${falsePositiveRate}%`,
    insufficientEvidenceDetectionRate: `${insufficientEvidenceAccuracy}%`,
    averageDurationMs: Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length * 100) / 100,
    details: results
  };

  return summary;
}

if (process.argv[1]?.endsWith('evaluationRunner.js')) {
  const summary = evaluateRCAEngine();
  console.log('\n================ RCA EVALUATION SUMMARY ================');
  console.log(`Top-1 Accuracy:                      ${summary.top1Accuracy}`);
  console.log(`Top-3 Accuracy:                      ${summary.top3Accuracy}`);
  console.log(`Mean Reciprocal Rank (MRR):          ${summary.meanReciprocalRank}`);
  console.log(`False-Positive Rate:                 ${summary.falsePositiveRate}`);
  console.log(`Insufficient Evidence Detection:     ${summary.insufficientEvidenceDetectionRate}`);
  console.log(`Average Investigation Duration:      ${summary.averageDurationMs}ms`);
  console.log('========================================================\n');
}
