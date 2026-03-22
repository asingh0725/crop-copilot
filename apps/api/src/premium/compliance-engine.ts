import type {
  ComplianceCheckResult,
  PremiumProcessingInput,
  RiskReviewDecision,
} from './types';

const RULE_VERSION = 'risk-review-rules-v2';
const HEURISTIC_SOURCE_VERSION = 'heuristic-local-v1-no-regulatory-feed';

function parseNumberFromRate(rate: string | null): number | null {
  if (!rate) {
    return null;
  }

  const match = rate.match(/[-+]?\d*\.?\d+/);
  if (!match) {
    return null;
  }

  const value = Number(match[0]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

// All 50 US states + DC + territories as two-letter codes.
const US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC','PR','GU','VI','AS','MP',
]);

const US_STATE_NAMES = [
  'alabama','alaska','arizona','arkansas','california','colorado',
  'connecticut','delaware','florida','georgia','hawaii','idaho',
  'illinois','indiana','iowa','kansas','kentucky','louisiana',
  'maine','maryland','massachusetts','michigan','minnesota','mississippi',
  'missouri','montana','nebraska','nevada','new hampshire','new jersey',
  'new mexico','new york','north carolina','north dakota','ohio',
  'oklahoma','oregon','pennsylvania','rhode island','south carolina',
  'south dakota','tennessee','texas','utah','vermont','virginia',
  'washington','west virginia','wisconsin','wyoming',
  'district of columbia','puerto rico',
];

function isLikelyUSLocation(location: string | null): boolean {
  if (!location) return false;
  const normalized = location.trim().toLowerCase();
  // Explicit "United States" or "US" as a word boundary
  if (normalized.includes('united states') || /\bus\b/.test(normalized)) return true;
  // Full state names (case-insensitive)
  if (US_STATE_NAMES.some((name) => normalized.includes(name))) return true;
  // Two-letter state abbreviations as word-boundary tokens (e.g. ", ND" or "ND,")
  const abbrevMatches = location.match(/\b([A-Z]{2})\b/g) ?? [];
  return abbrevMatches.some((abbr) => US_STATE_CODES.has(abbr));
}

function isLikelyNonUSLocation(location: string | null): boolean {
  if (!location) return false;
  // Never flag a known US location as non-US
  if (isLikelyUSLocation(location)) return false;
  const normalized = location.trim().toLowerCase();
  return (
    normalized.includes('canada') ||
    normalized.includes('mexico') ||
    normalized.includes('ontario') ||
    normalized.includes('alberta') ||
    normalized.includes('british columbia') ||
    normalized.includes('quebec') ||
    normalized.includes('manitoba') ||
    normalized.includes('saskatchewan')
  );
}

function capitalizeFirst(value: string | null): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildDiagnosisQualityCheck(input: PremiumProcessingInput): ComplianceCheckResult {
  const reasons: string[] = [];
  const modelUsed = input.recommendation.modelUsed?.toLowerCase() ?? '';
  const diagnosisType = input.recommendation.diagnosisConditionType?.toLowerCase() ?? '';
  const confidence = input.recommendation.confidence;
  const sourceSignals = input.recommendation.sourceSignals;

  if (!modelUsed || modelUsed.startsWith('heuristic')) {
    reasons.push('fallback diagnostic model was used');
  }
  if (diagnosisType === 'unknown') {
    reasons.push('diagnosis is unresolved');
  }
  if (typeof confidence === 'number' && confidence < 0.72) {
    reasons.push(`confidence is low (${Math.round(confidence * 100)}%)`);
  }
  if (sourceSignals.totalSources === 0) {
    reasons.push('no cited evidence sources were attached');
  } else if (sourceSignals.cropAlignedSources === 0) {
    reasons.push('retrieved evidence does not clearly match the selected crop');
  }
  if (
    sourceSignals.totalSources > 0 &&
    sourceSignals.policyLikeSources >= Math.max(2, Math.ceil(sourceSignals.totalSources * 0.6))
  ) {
    reasons.push('evidence is mostly policy/regulatory text rather than agronomic diagnostics');
  }

  const hasQualityRisk = reasons.length > 0;
  return {
    id: 'diagnosis_quality',
    title: 'Recommendation Evidence Quality',
    result: hasQualityRisk ? 'needs_manual_verification' : 'clear_signal',
    severity: 'hard',
    message: hasQualityRisk
      ? `This recommendation needs manual verification because ${reasons.join('; ')}.`
      : 'Diagnostic evidence quality is sufficient for advisory checks.',
    ruleVersion: RULE_VERSION,
    sourceVersion: 'recommendation-quality-v1',
    evidence: {
      modelUsed: input.recommendation.modelUsed,
      diagnosisConditionType: input.recommendation.diagnosisConditionType,
      confidence: input.recommendation.confidence,
      sourceSignals,
    },
  };
}

export function deriveRiskReviewDecision(checks: ComplianceCheckResult[]): RiskReviewDecision {
  if (checks.some((check) => check.result === 'potential_conflict')) {
    return 'potential_conflict';
  }

  if (checks.some((check) => check.result === 'needs_manual_verification')) {
    return 'needs_manual_verification';
  }

  return 'clear_signal';
}

export interface ComplianceEvaluationResult {
  checks: ComplianceCheckResult[];
  riskReview: RiskReviewDecision;
}

export function evaluateCompliance(input: PremiumProcessingInput): ComplianceEvaluationResult {
  const checks: ComplianceCheckResult[] = [];
  checks.push(buildDiagnosisQualityCheck(input));

  const isUSLocation = isLikelyUSLocation(input.input.location);
  const isNonUSLocation = isLikelyNonUSLocation(input.input.location);

  checks.push({
    id: 'registration_jurisdiction',
    title: 'Registration & Jurisdiction Context',
    result: !input.input.location
      ? 'needs_manual_verification'
      : isUSLocation
        ? 'clear_signal'
        : 'needs_manual_verification',
    severity: 'hard',
    message: !input.input.location
      ? 'Location missing. Confirm local registration rules before application.'
      : isUSLocation
        ? `US location context provided (${input.input.location}).`
        : `Location context provided (${input.input.location}), but automated registration checks are not yet supported for this region. Manual verification required.`,
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      location: input.input.location,
      isUSLocation,
      isNonUSLocation,
    },
  });

  checks.push({
    id: 'crop_stage_use_site',
    title: 'Crop Stage & Use Site Context',
    result:
      input.input.crop && input.input.season
        ? 'clear_signal'
        : 'needs_manual_verification',
    severity: 'hard',
    message:
      input.input.crop && input.input.season
        ? `Crop (${capitalizeFirst(input.input.crop)}) and growth stage (${capitalizeFirst(input.input.season)}) provided.`
        : 'Crop or growth stage missing. Confirm label stage restrictions manually.',
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      crop: input.input.crop,
      season: input.input.season,
    },
  });

  const plannedDate = input.input.plannedApplicationDate;
  const plannedTimestamp = plannedDate ? Date.parse(`${plannedDate}T00:00:00.000Z`) : NaN;
  const now = Date.now();

  checks.push({
    id: 'rei_phi_window',
    title: 'REI/PHI Timing Context',
    result:
      !plannedDate
        ? 'needs_manual_verification'
        : Number.isFinite(plannedTimestamp) && plannedTimestamp < now - 24 * 60 * 60 * 1000
          ? 'potential_conflict'
          : 'clear_signal',
    severity: 'hard',
    message: !plannedDate
      ? 'Planned application date missing. REI/PHI timing requires manual verification.'
      : Number.isFinite(plannedTimestamp) && plannedTimestamp < now - 24 * 60 * 60 * 1000
        ? 'Planned date is in the past. Re-check timing constraints before application.'
        : 'Planned date is available for REI/PHI timing review.',
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      plannedApplicationDate: plannedDate,
    },
  });

  const parsedRates = input.products
    .map((product) => ({
      productId: product.productId,
      productName: product.productName,
      rate: parseNumberFromRate(product.applicationRate),
    }))
    .filter((entry) => entry.rate !== null);

  const maxRate =
    parsedRates.length > 0 ? Math.max(...parsedRates.map((entry) => entry.rate ?? 0)) : null;
  checks.push({
    id: 'max_single_rate',
    title: 'Single Application Rate Context',
    result:
      maxRate === null
        ? 'needs_manual_verification'
        : maxRate > 10
          ? 'potential_conflict'
          : 'clear_signal',
    severity: 'hard',
    message:
      maxRate === null
        ? 'One or more rates are missing or non-numeric. Manual rate validation required.'
        : maxRate > 10
          ? `One product rate appears high (${maxRate}). Check label max rate before application.`
          : 'Rates appear within conservative planning thresholds.',
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      maxRate,
      parsedRates,
    },
  });

  const acreage = input.input.fieldAcreage;
  const totalDose =
    acreage && maxRate !== null
      ? parsedRates.reduce((sum, entry) => sum + (entry.rate ?? 0) * acreage, 0)
      : null;

  checks.push({
    id: 'max_seasonal_dose',
    title: 'Seasonal Dose Context',
    result:
      acreage === null || maxRate === null
        ? 'needs_manual_verification'
        : totalDose !== null && totalDose > 25000
          ? 'potential_conflict'
          : 'clear_signal',
    severity: 'soft',
    message:
      acreage === null || maxRate === null
        ? 'Acreage or numeric rates missing. Seasonal total requires manual verification.'
        : totalDose !== null && totalDose > 25000
          ? 'Estimated seasonal total looks high. Confirm cumulative label maximums.'
          : 'Estimated seasonal total appears within conservative planning thresholds.',
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      acreage,
      totalDose,
    },
  });

  checks.push({
    id: 'endangered_species_bulletin',
    title: 'Endangered Species Bulletin Context',
    result: input.input.location ? 'clear_signal' : 'needs_manual_verification',
    severity: 'soft',
    message: !input.input.location
      ? 'Location missing. Confirm endangered species bulletin requirements manually.'
      : isUSLocation
        ? 'US location detected. Verify Bulletin Live! only when the selected product label requires it.'
        : 'Endangered species bulletin check not applicable for non-US context.',
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      location: input.input.location,
    },
  });

  return {
    checks,
    riskReview: deriveRiskReviewDecision(checks),
  };
}
