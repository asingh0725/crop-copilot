import {
  normalizeModelScore,
  scoreFeatureVector,
  type InHouseLinearModelArtifact,
} from './in-house-models';
import type {
  ComplianceCheckResult,
  PremiumInsightPayload,
  RiskReviewDecision,
} from '../premium/types';

export const PREMIUM_FEATURE_NAMES = [
  'f0_decision_score',
  'f1_checks_norm',
  'f2_clear_ratio',
  'f3_conflict_ratio',
  'f4_has_cost_totals',
  'f5_live_weather_ratio',
  'f6_has_report',
] as const;

export interface PremiumQualityFeatureInput {
  decision: string | null;
  checks: unknown;
  costAnalysis: unknown;
  sprayWindows: unknown;
  report: unknown;
}

export function buildPremiumFeatureVector(
  input: PremiumQualityFeatureInput
): [number, number, number, number, number, number, number] {
  const checks = toArray(input.checks);
  const checkCount = checks.length;
  const clearSignals = checks.filter((check) => check.result === 'clear_signal').length;
  const conflicts = checks.filter((check) => check.result === 'potential_conflict').length;

  const costAnalysis = toObject(input.costAnalysis);
  const perAcre = toNumber(costAnalysis.perAcreTotalUsd) ?? 0;
  const wholeField = toNumber(costAnalysis.wholeFieldTotalUsd) ?? 0;
  const hasCostTotals = perAcre > 0 || wholeField > 0 ? 1 : 0;

  const sprayWindows = toArray(input.sprayWindows);
  const liveWindows = sprayWindows.filter((window) => {
    const source = String(window.source ?? '').toLowerCase();
    return source.length > 0 && source !== 'fallback';
  }).length;

  const report = toObject(input.report);
  const hasReport = report.html || report.htmlUrl || report.pdfUrl ? 1 : 0;

  const checksNorm = Math.min(1, checkCount / 6);
  const clearRatio = checkCount > 0 ? clearSignals / checkCount : 0;
  const conflictRatio = checkCount > 0 ? conflicts / checkCount : 0;
  const liveWeatherRatio = sprayWindows.length > 0 ? liveWindows / sprayWindows.length : 0;

  return [
    decisionScore(input.decision),
    checksNorm,
    clearRatio,
    conflictRatio,
    hasCostTotals,
    liveWeatherRatio,
    hasReport,
  ];
}

export function buildPremiumQualityCheck(params: {
  artifact: InHouseLinearModelArtifact;
  payload: Pick<PremiumInsightPayload, 'riskReview' | 'checks' | 'costAnalysis' | 'sprayWindows' | 'report'>;
}): ComplianceCheckResult {
  const features = buildPremiumFeatureVector({
    decision: params.payload.riskReview,
    checks: params.payload.checks,
    costAnalysis: params.payload.costAnalysis,
    sprayWindows: params.payload.sprayWindows,
    report: params.payload.report,
  });
  const rawScore = scoreFeatureVector(features, params.artifact);
  const normalizedScore = normalizeModelScore(rawScore, params.artifact);
  const result = qualityBandToDecision(normalizedScore);

  return {
    id: 'premium_quality_confidence',
    title: 'Premium Coverage Confidence',
    result,
    severity: 'soft',
    message: qualityMessage(normalizedScore, result),
    ruleVersion: 'premium-quality-model-v1',
    sourceVersion: params.artifact.backend,
    evidence: {
      qualityScore: normalizedScore,
      rawScore,
      trainedAt: params.artifact.trainedAt,
      ndcgAt3: params.artifact.metrics.ndcgAt3,
      ndcgAt5: params.artifact.metrics.ndcgAt5,
      pairwiseAccuracy: params.artifact.metrics.pairwiseAccuracy,
    },
  };
}

function qualityBandToDecision(score: number): RiskReviewDecision {
  if (score >= 0.75) {
    return 'clear_signal';
  }
  if (score >= 0.45) {
    return 'needs_manual_verification';
  }
  return 'potential_conflict';
}

function qualityMessage(score: number, decision: RiskReviewDecision): string {
  const pct = Math.round(score * 100);
  if (decision === 'clear_signal') {
    return `Premium package quality is strong (${pct}/100) with good evidence coverage across compliance, cost, weather, and report output.`;
  }
  if (decision === 'needs_manual_verification') {
    return `Premium package quality is moderate (${pct}/100). Some support signals are present, but cost or weather coverage may still need manual verification.`;
  }
  return `Premium package quality is weak (${pct}/100). Missing pricing, fallback weather, or incomplete report support reduces confidence in the premium output.`;
}

function decisionScore(decision: string | null): number {
  if (decision === 'clear_signal') return 0.9;
  if (decision === 'potential_conflict') return 0.35;
  if (decision === 'needs_manual_verification') return 0.5;
  return 0.4;
}

function toArray(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object');
}

function toObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
