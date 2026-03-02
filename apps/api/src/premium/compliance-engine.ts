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

function isLikelyUSLocation(location: string | null): boolean {
  if (!location) {
    return false;
  }

  const normalized = location.toLowerCase();
  return normalized.includes('us') || normalized.includes('united states');
}

function buildRiskReview(checks: ComplianceCheckResult[]): RiskReviewDecision {
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

  checks.push({
    id: 'registration_jurisdiction',
    title: 'Registration & Jurisdiction Context',
    result: input.input.location ? 'clear_signal' : 'needs_manual_verification',
    severity: 'hard',
    message: input.input.location
      ? `Location context provided (${input.input.location}).`
      : 'Location missing. Confirm local registration rules before application.',
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      location: input.input.location,
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
        ? `Crop (${input.input.crop}) and stage (${input.input.season}) provided.`
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
    result: isLikelyUSLocation(input.input.location)
      ? 'needs_manual_verification'
      : 'clear_signal',
    severity: 'soft',
    message: isLikelyUSLocation(input.input.location)
      ? 'US location detected. Confirm Bulletin Live! requirements before application.'
      : 'No US jurisdiction detected for BLT context check.',
    ruleVersion: RULE_VERSION,
    sourceVersion: HEURISTIC_SOURCE_VERSION,
    evidence: {
      location: input.input.location,
    },
  });

  return {
    checks,
    riskReview: buildRiskReview(checks),
  };
}
