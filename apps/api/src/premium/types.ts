export type RiskReviewDecision =
  | 'clear_signal'
  | 'potential_conflict'
  | 'needs_manual_verification';
export type PremiumStatus = 'not_available' | 'queued' | 'processing' | 'ready' | 'failed';

export const DEFAULT_ADVISORY_NOTICE =
  'Decision support only. Verify label instructions, local registrations, and regulations before application.';

export interface ComplianceCheckResult {
  id: string;
  title: string;
  result: RiskReviewDecision;
  severity: 'hard' | 'soft';
  message: string;
  ruleVersion: string;
  sourceVersion?: string;
  evidence?: Record<string, unknown>;
}

export interface CostAnalysisItem {
  productId: string;
  productName: string;
  productType: string;
  applicationRate: string | null;
  parsedRatePerAcre: number | null;
  unitPriceUsd: number | null;
  estimatedCostPerAcreUsd: number | null;
  estimatedFieldCostUsd: number | null;
}

export interface CostSwapOption {
  fromProductId: string;
  fromProductName: string;
  toProductId: string;
  toProductName: string;
  estimatedSavingsPerAcreUsd: number;
  estimatedSavingsWholeFieldUsd: number;
}

export interface CostAnalysisResult {
  currency: 'USD';
  acreage: number | null;
  perAcreTotalUsd: number | null;
  wholeFieldTotalUsd: number | null;
  items: CostAnalysisItem[];
  swapOptions: CostSwapOption[];
}

export interface SprayWindow {
  startsAt: string;
  endsAt: string;
  score: number;
  summary: string;
  source: 'openweather' | 'nws' | 'fallback';
}

export interface PremiumInsightPayload {
  status: PremiumStatus;
  riskReview: RiskReviewDecision | null;
  // Deprecated compatibility key for older clients.
  complianceDecision?: RiskReviewDecision | null;
  checks: ComplianceCheckResult[];
  costAnalysis: CostAnalysisResult | null;
  sprayWindows: SprayWindow[];
  advisoryNotice: string;
  report: {
    html?: string;
    htmlUrl?: string;
    pdfUrl?: string;
    generatedAt: string;
  } | null;
  failureReason?: string;
}

export interface PremiumProcessingInput {
  recommendationId: string;
  userId: string;
  input: {
    crop: string | null;
    location: string | null;
    season: string | null;
    fieldAcreage: number | null;
    plannedApplicationDate: string | null;
    fieldLatitude: number | null;
    fieldLongitude: number | null;
  };
  products: Array<{
    productId: string;
    productName: string;
    productType: string;
    applicationRate: string | null;
    reason: string | null;
  }>;
}
