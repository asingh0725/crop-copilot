import type { Pool } from 'pg';
import { tierIsPro, getSubscriptionSnapshot } from '../lib/entitlements';
import { buildCostAnalysis } from './cost-optimizer';
import { evaluateCompliance } from './compliance-engine';
import { buildApplicationReportHtml } from './report-builder';
import {
  loadCachedRetailPricing,
  loadPremiumProcessingInput,
  persistComplianceAudit,
  upsertPremiumInsight,
} from './premium-store';
import { buildSprayWindows } from './weather-spray-windows';
import { DEFAULT_ADVISORY_NOTICE, type PremiumInsightPayload } from './types';

export async function runPremiumEnrichment(params: {
  pool: Pool;
  userId: string;
  recommendationId: string;
}): Promise<PremiumInsightPayload> {
  const { pool, userId, recommendationId } = params;

  const subscription = await getSubscriptionSnapshot(pool, userId);
  const isPremiumEligible =
    (subscription.status === 'active' || subscription.status === 'trialing') &&
    tierIsPro(subscription.planId);

  if (!isPremiumEligible) {
    const payload: PremiumInsightPayload = {
      status: 'not_available',
      riskReview: null,
      complianceDecision: null,
      checks: [],
      costAnalysis: null,
      sprayWindows: [],
      advisoryNotice: DEFAULT_ADVISORY_NOTICE,
      report: null,
    };

    await upsertPremiumInsight(pool, userId, recommendationId, payload);
    return payload;
  }

  const processingInput = await loadPremiumProcessingInput(pool, recommendationId, userId);
  if (!processingInput) {
    const payload: PremiumInsightPayload = {
      status: 'failed',
      riskReview: null,
      complianceDecision: null,
      checks: [],
      costAnalysis: null,
      sprayWindows: [],
      advisoryNotice: DEFAULT_ADVISORY_NOTICE,
      report: null,
      failureReason: 'Recommendation not found for premium enrichment',
    };

    await upsertPremiumInsight(pool, userId, recommendationId, payload);
    return payload;
  }

  await upsertPremiumInsight(pool, userId, recommendationId, {
    status: 'processing',
    riskReview: null,
    complianceDecision: null,
    checks: [],
    costAnalysis: null,
    sprayWindows: [],
    advisoryNotice: DEFAULT_ADVISORY_NOTICE,
    report: null,
  });

  const compliance = evaluateCompliance(processingInput);
  const pricing = await loadCachedRetailPricing(
    pool,
    processingInput.products.map((product) => product.productId),
    processingInput.input.location ?? 'United States'
  );
  const costAnalysis = buildCostAnalysis(processingInput, pricing);
  const sprayWindows = await buildSprayWindows(processingInput, { pool });
  const reportHtml = buildApplicationReportHtml({
    input: processingInput,
    compliance,
    costAnalysis,
    sprayWindows,
  });

  await persistComplianceAudit(
    pool,
    recommendationId,
    userId,
    compliance,
    processingInput.input
  );

  const payload: PremiumInsightPayload = {
    status: 'ready',
    riskReview: compliance.riskReview,
    complianceDecision: compliance.riskReview,
    checks: compliance.checks,
    costAnalysis,
    sprayWindows,
    advisoryNotice: DEFAULT_ADVISORY_NOTICE,
    report: {
      html: reportHtml,
      generatedAt: new Date().toISOString(),
    },
  };

  await upsertPremiumInsight(pool, userId, recommendationId, payload);

  return payload;
}
