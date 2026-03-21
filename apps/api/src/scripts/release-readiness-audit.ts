import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

type Severity = 'blocker' | 'warning' | 'info';

interface Gap {
  severity: Severity;
  area: string;
  message: string;
  metric?: string;
}

interface AuditReport {
  auditedAt: string;
  environment: string;
  awsCredentialsValid: boolean;
  gaps: Gap[];
  metrics: Record<string, unknown>;
}

type RuntimeEnvironment = 'dev' | 'prod';

function normalizeEnvironment(raw: string | undefined): RuntimeEnvironment {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'prod') {
    return 'prod';
  }
  return 'dev';
}

function loadEnvFile(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, 'utf8');
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function findEnv(): Record<string, string> {
  const cwd = process.cwd();
  const targetEnvironment = normalizeEnvironment(process.env.AUDIT_ENV ?? process.env.CROP_ENV);
  const scopedCandidates = [
    resolve(cwd, `.env.${targetEnvironment}.local`),
    resolve(cwd, `.env.${targetEnvironment}`),
    resolve(cwd, '..', 'web', `.env.${targetEnvironment}.local`),
    resolve(cwd, '..', 'web', `.env.${targetEnvironment}`),
  ];
  const fallbackCandidates = [
    resolve(cwd, '.env.local'),
    resolve(cwd, '.env'),
    resolve(cwd, '..', 'web', '.env.local'),
    resolve(cwd, '..', 'web', '.env'),
  ];

  const allowLegacyFallback =
    (process.env.ALLOW_LEGACY_ENV_FALLBACK ?? 'true').trim().toLowerCase() !== 'false';
  const candidates = scopedCandidates.some((filePath) => existsSync(filePath))
    ? scopedCandidates
    : allowLegacyFallback
      ? fallbackCandidates
      : scopedCandidates;

  const merged: Record<string, string> = {};
  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    Object.assign(merged, loadEnvFile(filePath));
  }
  return merged;
}

function processEnvToRecord(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function checkAwsCredentials(): boolean {
  try {
    execSync('aws sts get-caller-identity --output json', {
      stdio: 'pipe',
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function fetchMetrics(db: Client): Promise<Record<string, unknown>> {
  const [modelUsage, premiumSummary, premiumDecisions, complianceSources, complianceRuns, discoverySources] =
    await Promise.all([
      db.query<{
        modelUsed: string;
        count: string;
      }>(
        `
          SELECT "modelUsed", COUNT(*)::text AS count
          FROM "Recommendation"
          WHERE "createdAt" >= NOW() - INTERVAL '30 days'
          GROUP BY "modelUsed"
          ORDER BY COUNT(*) DESC
        `
      ),
      db.query<{
        ready_count: string;
        weather_eligible: string;
        weather_live: string;
        cost_eligible: string;
        cost_totals: string;
        quality_check_present: string;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE rpi.status = 'ready')::text AS ready_count,
            COUNT(*) FILTER (
              WHERE rpi.status = 'ready'
                AND i."fieldLatitude" IS NOT NULL
                AND i."fieldLongitude" IS NOT NULL
                AND i."plannedApplicationDate" IS NOT NULL
            )::text AS weather_eligible,
            COUNT(*) FILTER (
              WHERE rpi.status = 'ready'
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE(rpi."sprayWindows", '[]'::jsonb)) w
                  WHERE COALESCE(w->>'source', '') <> 'fallback'
                )
            )::text AS weather_live,
            COUNT(*) FILTER (
              WHERE rpi.status = 'ready'
                AND i."fieldAcreage" IS NOT NULL
            )::text AS cost_eligible,
            COUNT(*) FILTER (
              WHERE rpi.status = 'ready'
                AND rpi."costAnalysis" IS NOT NULL
                AND (rpi."costAnalysis"->>'perAcreTotalUsd') IS NOT NULL
            )::text AS cost_totals,
            COUNT(*) FILTER (
              WHERE rpi.status = 'ready'
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE(rpi.checks, '[]'::jsonb)) c
                  WHERE c->>'id' = 'diagnosis_quality'
                )
            )::text AS quality_check_present
          FROM "RecommendationPremiumInsight" rpi
          LEFT JOIN "Recommendation" r ON r.id = rpi."recommendationId"
          LEFT JOIN "Input" i ON i.id = r."inputId"
        `
      ),
      db.query<{ decision: string | null; count: string }>(
        `
          SELECT "complianceDecision"::text AS decision, COUNT(*)::text AS count
          FROM "RecommendationPremiumInsight"
          WHERE status = 'ready'
          GROUP BY "complianceDecision"
          ORDER BY COUNT(*) DESC
        `
      ),
      db.query<{ status: string; count: string }>(
        `
          SELECT status, COUNT(*)::text AS count
          FROM "ComplianceSource"
          GROUP BY status
          ORDER BY status
        `
      ),
      db.query<{ status: string; count: string }>(
        `
          SELECT status, COUNT(*)::text AS count
          FROM "ComplianceIngestionRun"
          WHERE "startedAt" >= NOW() - INTERVAL '24 hours'
          GROUP BY status
          ORDER BY status
        `
      ),
      db.query<{ status: string; count: string }>(
        `
          SELECT status, COUNT(*)::text AS count
          FROM "Source"
          GROUP BY status
          ORDER BY status
        `
      ),
    ]);

  return {
    recommendationModelUsage30d: modelUsage.rows,
    premiumSummary: premiumSummary.rows[0] ?? null,
    premiumDecisions: premiumDecisions.rows,
    complianceSourceStatus: complianceSources.rows,
    complianceRuns24h: complianceRuns.rows,
    discoverySourceStatus: discoverySources.rows,
  };
}

function addGap(gaps: Gap[], gap: Gap): void {
  gaps.push(gap);
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluateGaps(params: {
  env: Record<string, string>;
  awsCredentialsValid: boolean;
  metrics: Record<string, unknown>;
}): Gap[] {
  const gaps: Gap[] = [];
  const { env, awsCredentialsValid, metrics } = params;
  const environment = (env.CROP_ENV ?? '').trim().toLowerCase();
  const modelProviders = (env.RECOMMENDATION_MODEL_PROVIDERS ?? 'anthropic')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const activeProviders = modelProviders.length > 0 ? modelProviders : ['anthropic'];

  const requiredEnv = [
    'OPENWEATHER_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'DATABASE_URL',
    'API_GATEWAY_URL',
    'NEXT_PUBLIC_API_GATEWAY_URL',
  ];

  if (activeProviders.includes('anthropic')) {
    const hasAnthropicCredential = Boolean(
      env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim()
    );
    if (!hasAnthropicCredential) {
      addGap(gaps, {
        severity: 'blocker',
        area: 'configuration',
        message:
          'Missing required Anthropic credential: set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN',
      });
    }
  }

  if (activeProviders.includes('gemini') && (!env.GOOGLE_AI_API_KEY || env.GOOGLE_AI_API_KEY.trim().length === 0)) {
    addGap(gaps, {
      severity: 'blocker',
      area: 'configuration',
      message: 'Missing required env key for Gemini provider: GOOGLE_AI_API_KEY',
    });
  }

  for (const key of requiredEnv) {
    if (!env[key] || env[key].trim().length === 0) {
      addGap(gaps, {
        severity: 'blocker',
        area: 'configuration',
        message: `Missing required env key: ${key}`,
      });
    }
  }

  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.trim().length === 0) {
    addGap(gaps, {
      severity: 'warning',
      area: 'retrieval-quality',
      message:
        'OPENAI_API_KEY is missing; semantic embeddings are disabled and retrieval falls back to lexical matching.',
    });
  }

  if (!awsCredentialsValid) {
    addGap(gaps, {
      severity: 'blocker',
      area: 'deployment',
      message: 'AWS credentials are invalid; deploy/backfill workflows cannot run.',
    });
  }

  const modelUsage = Array.isArray(metrics.recommendationModelUsage30d)
    ? (metrics.recommendationModelUsage30d as Array<{ modelUsed: string; count: string }>)
    : [];
  const totalRecommendations = modelUsage.reduce((sum, row) => sum + asNumber(row.count), 0);
  const heuristicRecommendations = modelUsage
    .filter((row) => row.modelUsed?.toLowerCase().includes('heuristic'))
    .reduce((sum, row) => sum + asNumber(row.count), 0);
  if (totalRecommendations > 0) {
    const heuristicRate = heuristicRecommendations / totalRecommendations;
    if (heuristicRate > 0.01) {
      addGap(gaps, {
        severity: 'blocker',
        area: 'recommendation-quality',
        message: 'Heuristic recommendation rate exceeds release threshold (1%).',
        metric: `${(heuristicRate * 100).toFixed(2)}% (${heuristicRecommendations}/${totalRecommendations})`,
      });
    }
  }

  const premiumSummary =
    (metrics.premiumSummary as
      | {
          ready_count: string;
          weather_eligible: string;
          weather_live: string;
          cost_eligible: string;
          cost_totals: string;
          quality_check_present: string;
        }
      | undefined) ?? null;
  if (premiumSummary) {
    const ready = asNumber(premiumSummary.ready_count);
    const weatherEligible = asNumber(premiumSummary.weather_eligible);
    const weatherLive = asNumber(premiumSummary.weather_live);
    const costEligible = asNumber(premiumSummary.cost_eligible);
    const costTotals = asNumber(premiumSummary.cost_totals);
    const qualityChecks = asNumber(premiumSummary.quality_check_present);
    if (weatherEligible > 0 && weatherLive / weatherEligible < 0.9) {
      addGap(gaps, {
        severity: 'warning',
        area: 'premium-weather',
        message: 'Premium insights are not consistently using live weather data when weather inputs are present.',
        metric: `${weatherLive}/${weatherEligible}`,
      });
    }
    if (costEligible > 0 && costTotals / costEligible < 0.8) {
      addGap(gaps, {
        severity: 'warning',
        area: 'premium-costing',
        message: 'Cost totals are missing for most premium insights where acreage is provided.',
        metric: `${costTotals}/${costEligible}`,
      });
    }
    if (ready > 0 && qualityChecks / ready < 0.9) {
      addGap(gaps, {
        severity: 'warning',
        area: 'premium-backfill',
        message: 'Most premium insights were not regenerated with the latest quality checks.',
        metric: `${qualityChecks}/${ready}`,
      });
    }
  }

  const complianceStatuses = Array.isArray(metrics.complianceSourceStatus)
    ? (metrics.complianceSourceStatus as Array<{ status: string; count: string }>)
    : [];
  const complianceErrors = complianceStatuses
    .filter((row) => row.status === 'error')
    .reduce((sum, row) => sum + asNumber(row.count), 0);
  if (complianceErrors > 0) {
    addGap(gaps, {
      severity: 'warning',
      area: 'compliance-ingestion',
      message: 'Compliance ingestion still has sources in error state.',
      metric: String(complianceErrors),
    });
  }

  const complianceRuns = Array.isArray(metrics.complianceRuns24h)
    ? (metrics.complianceRuns24h as Array<{ status: string; count: string }>)
    : [];
  const failedRuns = complianceRuns
    .filter((row) => row.status === 'failed')
    .reduce((sum, row) => sum + asNumber(row.count), 0);
  if (failedRuns > 0) {
    addGap(gaps, {
      severity: 'warning',
      area: 'compliance-scheduler',
      message: 'Compliance scheduled runs failed in the last 24h.',
      metric: String(failedRuns),
    });
  }

  const discoveryStatuses = Array.isArray(metrics.discoverySourceStatus)
    ? (metrics.discoverySourceStatus as Array<{ status: string; count: string }>)
    : [];
  const discoveryErrors = discoveryStatuses
    .filter((row) => row.status === 'error')
    .reduce((sum, row) => sum + asNumber(row.count), 0);
  const discoveryPending = discoveryStatuses
    .filter((row) => row.status === 'pending')
    .reduce((sum, row) => sum + asNumber(row.count), 0);
  if (discoveryErrors > 0 || discoveryPending > 2000) {
    addGap(gaps, {
      severity: 'warning',
      area: 'discovery-pipeline',
      message: 'Discovery pipeline has a large pending/error backlog.',
      metric: `pending=${discoveryPending}, error=${discoveryErrors}`,
    });
  }

  if (environment === 'prod' && !isTruthy(env.REQUIRE_MODEL_OUTPUT)) {
    addGap(gaps, {
      severity: 'warning',
      area: 'safety-guardrail',
      message: 'REQUIRE_MODEL_OUTPUT is not enabled in prod.',
    });
  }

  return gaps;
}

async function main(): Promise<void> {
  const env = {
    ...findEnv(),
    ...processEnvToRecord(),
  };
  const environment = (env.CROP_ENV ?? 'unknown').toString();
  const awsCredentialsValid = checkAwsCredentials();
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    const report: AuditReport = {
      auditedAt: new Date().toISOString(),
      environment,
      awsCredentialsValid,
      gaps: [
        {
          severity: 'blocker',
          area: 'configuration',
          message: 'DATABASE_URL is missing; cannot run DB-backed readiness checks.',
        },
      ],
      metrics: {},
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const db = new Client({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    ssl: resolvePoolSslConfig(),
  });

  await db.connect();
  const metrics = await fetchMetrics(db);
  await db.end();

  const gaps = evaluateGaps({
    env,
    awsCredentialsValid,
    metrics,
  });

  const report: AuditReport = {
    auditedAt: new Date().toISOString(),
    environment,
    awsCredentialsValid,
    gaps,
    metrics,
  };
  console.log(JSON.stringify(report, null, 2));

  if (gaps.some((gap) => gap.severity === 'blocker')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        auditedAt: new Date().toISOString(),
        fatal: true,
        message: (error as Error).message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
