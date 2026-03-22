import type { Pool } from 'pg';
import { tierIsPro, getSubscriptionSnapshot } from '../lib/entitlements';
import { buildCostAnalysis } from './cost-optimizer';
import { deriveRiskReviewDecision, evaluateCompliance } from './compliance-engine';
import { buildApplicationReportHtml } from './report-builder';
import {
  loadCachedRetailPricing,
  loadPremiumProcessingInput,
  persistComplianceAudit,
  upsertPremiumInsight,
} from './premium-store';
import { buildSprayWindows } from './weather-spray-windows';
import {
  DEFAULT_ADVISORY_NOTICE,
  type ComplianceCheckResult,
  type PremiumInsightPayload,
} from './types';

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
  const supplementalChecks: ComplianceCheckResult[] = [];

  const pricedItemCount = costAnalysis?.pricedItemCount ?? 0;
  const totalItemCount = costAnalysis?.totalItemCount ?? 0;
  const livePricedItemCount =
    costAnalysis?.items.filter((item) => item.priceSource === 'live').length ?? 0;
  const estimatedPricedItemCount =
    costAnalysis?.items.filter((item) => item.priceSource === 'estimated').length ?? 0;
  supplementalChecks.push({
    id: 'cost_data_coverage',
    title: 'Cost Data Coverage',
    result:
      totalItemCount === 0
        ? 'needs_manual_verification'
        : pricedItemCount === totalItemCount && estimatedPricedItemCount === 0
          ? 'clear_signal'
          : 'needs_manual_verification',
    severity: 'soft',
    message:
      totalItemCount === 0
        ? 'No recommended products were available for cost analysis.'
        : pricedItemCount === totalItemCount && estimatedPricedItemCount === 0
          ? `Live pricing was found for all ${totalItemCount} recommended products.`
          : `Pricing coverage ${pricedItemCount}/${totalItemCount} (${livePricedItemCount} live, ${estimatedPricedItemCount} estimated benchmark).`,
    ruleVersion: 'premium-support-v1',
    sourceVersion: 'pricing-cache-v1',
    evidence: {
      pricedItemCount,
      totalItemCount,
      livePricedItemCount,
      estimatedPricedItemCount,
      coverageRatio: costAnalysis?.pricingCoverageRatio ?? 0,
    },
  });

  const hasFallbackWeather = sprayWindows.some((window) => window.source === 'fallback');
  supplementalChecks.push({
    id: 'spray_forecast_quality',
    title: 'Spray Forecast Data Quality',
    result: hasFallbackWeather ? 'needs_manual_verification' : 'clear_signal',
    severity: 'soft',
    message: hasFallbackWeather
      ? 'Live forecast data was unavailable. Spray windows are generic fallback estimates.'
      : 'Spray windows are based on live forecast provider data.',
    ruleVersion: 'premium-support-v1',
    sourceVersion: 'weather-provider-v1',
    evidence: {
      sources: sprayWindows.map((window) => window.source),
    },
  });

  const checks = [...compliance.checks, ...supplementalChecks];
  const riskReview = deriveRiskReviewDecision(checks);
  const reportHtml = buildApplicationReportHtml({
    input: processingInput,
    compliance: {
      checks,
      riskReview,
    },
    costAnalysis,
    sprayWindows,
  });

  await persistComplianceAudit(
    pool,
    recommendationId,
    userId,
    {
      checks,
      riskReview,
    },
    processingInput.input
  );

  const payload: PremiumInsightPayload = {
    status: 'ready',
    riskReview,
    complianceDecision: riskReview,
    checks,
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
