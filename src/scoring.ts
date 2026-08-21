/**
 * Scoring Engine for agentic-ucp-scanner
 * Deterministic 0-100 Machine Trust & Agent Readiness Scoring across 5 weighted dimensions.
 */

import { AuditScore, CheckResult, DimensionKey, DimensionScore, Grade } from './types.js';

const DIMENSION_NAMES: Record<DimensionKey, string> = {
  discovery: 'Discovery & AI Orientation',
  entityGraph: 'Entity Graph & Machine Trust',
  intentAndOffers: 'Intent & Commerce Offers',
  machinePayments: 'Autonomous Payments & Checkout',
  aiCrawlerAccess: 'AI Crawler & Search Bot Access',
};

const DIMENSION_TARGET_MAX: Record<DimensionKey, number> = {
  discovery: 20,
  entityGraph: 20,
  intentAndOffers: 20,
  machinePayments: 20,
  aiCrawlerAccess: 20,
};

export function calculateScore(checks: CheckResult[]): AuditScore {
  const dimensions: Record<DimensionKey, DimensionScore> = {
    discovery: createEmptyDimension('discovery'),
    entityGraph: createEmptyDimension('entityGraph'),
    intentAndOffers: createEmptyDimension('intentAndOffers'),
    machinePayments: createEmptyDimension('machinePayments'),
    aiCrawlerAccess: createEmptyDimension('aiCrawlerAccess'),
  };

  for (const check of checks) {
    const dim = dimensions[check.dimension];
    if (!dim) continue;

    dim.checksCount++;
    dim.score += check.score;
    dim.maxScore += check.maxScore;

    if (check.status === 'PASS') {
      dim.passedCount++;
    } else if (check.status === 'FAIL') {
      dim.failedCount++;
    } else if (check.status === 'WARN') {
      dim.warningCount++;
    }
  }

  // Normalize each dimension to its target 20-point weight
  let totalScoreRaw = 0;
  for (const key of Object.keys(dimensions) as DimensionKey[]) {
    const dim = dimensions[key];
    const targetMax = DIMENSION_TARGET_MAX[key];

    if (dim.maxScore > 0) {
      const ratio = Math.min(1, dim.score / dim.maxScore);
      dim.score = Math.round(ratio * targetMax * 10) / 10;
      dim.maxScore = targetMax;
      dim.percentage = Math.round(ratio * 100);
    } else {
      dim.score = 0;
      dim.maxScore = targetMax;
      dim.percentage = 0;
    }

    totalScoreRaw += dim.score;
  }

  const totalScore = Math.min(100, Math.max(0, Math.round(totalScoreRaw)));
  const grade = computeGrade(totalScore);
  const machineTrustIndex = Math.round((totalScore / 100) * 100) / 100;
  const summary = generateScoreSummary(totalScore, grade, dimensions);

  return {
    totalScore,
    maxScore: 100,
    grade,
    machineTrustIndex,
    summary,
    dimensions,
    timestamp: new Date().toISOString(),
  };
}

function createEmptyDimension(key: DimensionKey): DimensionScore {
  return {
    name: DIMENSION_NAMES[key],
    score: 0,
    maxScore: 0,
    percentage: 0,
    checksCount: 0,
    passedCount: 0,
    failedCount: 0,
    warningCount: 0,
  };
}

function computeGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

function generateScoreSummary(
  score: number,
  grade: Grade,
  dimensions: Record<DimensionKey, DimensionScore>
): string {
  if (grade === 'A') {
    return 'Full Agent-Native Autonomous Readiness. High machine trust, structured offers, and active agent commerce rails.';
  }
  if (grade === 'B') {
    return 'Agent-Friendly Platform. Strong structured data and crawler access; minor improvements needed in autonomous checkout or UCP endpoints.';
  }
  if (grade === 'C') {
    return 'Partial AI Readiness. Basic JSON-LD or meta tags present, but missing dedicated agent manifests (UCP, llms.txt) or machine payment rails.';
  }
  if (grade === 'D') {
    return 'Legacy Web Structure. Site is primarily human-oriented with minimal machine readability, missing schema, or restrictive crawler settings.';
  }
  return 'Agent-Hostile / Opaque. Missing core machine trust metadata, blocked crawlers, or zero machine-readable commerce interfaces.';
}
