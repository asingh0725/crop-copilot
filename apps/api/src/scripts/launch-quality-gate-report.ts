import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface AuditRecord {
  variant: string;
  recommendationId: string;
  inputId: string;
  scores: {
    overall: number;
    confidence: number;
    cropAlignment: number;
  };
  issues: string[];
  actionCount: number;
  citationCoverage: number;
}

interface GateResult {
  gate: string;
  target: string;
  value: string;
  pass: boolean;
}

interface PipelineHealth {
  discoveryErrors: number;
  complianceErrors: number;
  complianceRunFailures24h: number;
}

function parseArg(flag: string): string | null {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index < 0) return null;
  const value = process.argv[index + 1]?.trim();
  return value && value.length > 0 ? value : null;
}

function resolveLatestAuditReportPath(explicitPath: string | null): string {
  if (explicitPath) {
    return resolve(explicitPath);
  }

  const reportsDir = resolve(process.cwd(), 'reports');
  const files = readdirSync(reportsDir)
    .filter((name) => name.startsWith('recommendation-quality-audit-') && name.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a));

  if (files.length === 0) {
    throw new Error(`No recommendation-quality-audit report found in ${reportsDir}`);
  }

  return resolve(reportsDir, files[0]);
}

function parseNumberArg(flag: string): number | null {
  const value = parseArg(flag);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseAuditReport(path: string): AuditRecord[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    records?: AuditRecord[];
  };
  const records = Array.isArray(raw.records) ? raw.records : [];
  return records.filter((record) => record.variant === 'stored');
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function boolToPass(value: boolean): 'PASS' | 'FAIL' {
  return value ? 'PASS' : 'FAIL';
}

async function fetchPipelineHealth(databaseUrl: string): Promise<PipelineHealth> {
  const client = new Client({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    ssl: resolvePoolSslConfig(),
  });
  await client.connect();
  try {
    const [discovery, compliance, runs] = await Promise.all([
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "Source" WHERE status = 'error'`
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "ComplianceSource" WHERE status = 'error'`
      ),
      client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM "ComplianceIngestionRun"
          WHERE status = 'failed'
            AND "startedAt" >= NOW() - INTERVAL '24 hours'
        `
      ),
    ]);

    return {
      discoveryErrors: Number(discovery.rows[0]?.count ?? 0),
      complianceErrors: Number(compliance.rows[0]?.count ?? 0),
      complianceRunFailures24h: Number(runs.rows[0]?.count ?? 0),
    };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const reportPath = resolveLatestAuditReportPath(parseArg('--report'));
  const maxAgeMinutes = parseNumberArg('--max-report-age-minutes') ?? 120;
  if (maxAgeMinutes > 0) {
    const stats = statSync(reportPath);
    const ageMs = Date.now() - stats.mtimeMs;
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    if (ageMs > maxAgeMs) {
      throw new Error(
        `Audit report is stale (${Math.round(ageMs / 60000)} minutes old). ` +
          `Re-run audit-recommendation-quality or pass --max-report-age-minutes with a higher value.`
      );
    }
  }

  const records = parseAuditReport(reportPath);
  if (records.length === 0) {
    throw new Error('No stored recommendation records found in the audit report.');
  }

  const total = records.length;
  const avgOverall =
    records.reduce((sum, record) => sum + Number(record.scores?.overall ?? 0), 0) / total;
  const unknownCount = records.filter((record) =>
    record.issues.some((issue) => issue.toLowerCase().includes('unknown'))
  ).length;
  const lowConfidenceCount = records.filter(
    (record) => Number(record.scores?.confidence ?? 0) <= 8
  ).length;
  const threeActionCount = records.filter((record) => (record.actionCount ?? 0) >= 3).length;
  const citationPassCount = records.filter(
    (record) => Number(record.citationCoverage ?? 0) >= 0.98
  ).length;
  const cropAlignmentPassCount = records.filter(
    (record) => Number(record.scores?.cropAlignment ?? 0) >= 13.5
  ).length;

  const unknownPct = unknownCount / total;
  const lowConfidencePct = lowConfidenceCount / total;
  const threeActionPct = threeActionCount / total;
  const citationPct = citationPassCount / total;
  const cropAlignmentPct = cropAlignmentPassCount / total;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to evaluate pipeline health gate.');
  }
  const pipeline = await fetchPipelineHealth(databaseUrl);
  const pipelinePass =
    pipeline.discoveryErrors === 0 &&
    pipeline.complianceErrors === 0 &&
    pipeline.complianceRunFailures24h === 0;

  const gates: GateResult[] = [
    {
      gate: 'Overall quality score',
      target: '>= 80.0',
      value: avgOverall.toFixed(1),
      pass: avgOverall >= 80,
    },
    {
      gate: 'Unknown diagnosis rate',
      target: '<= 15.0%',
      value: pct(unknownPct),
      pass: unknownPct <= 0.15,
    },
    {
      gate: 'Low-confidence rate (<0.60)',
      target: '<= 10.0%',
      value: pct(lowConfidencePct),
      pass: lowConfidencePct <= 0.1,
    },
    {
      gate: '3 staged actions present',
      target: '>= 95.0%',
      value: pct(threeActionPct),
      pass: threeActionPct >= 0.95,
    },
    {
      gate: 'Valid citation coverage',
      target: '>= 98.0%',
      value: pct(citationPct),
      pass: citationPct >= 0.98,
    },
    {
      gate: 'Crop-source alignment',
      target: '>= 90.0%',
      value: pct(cropAlignmentPct),
      pass: cropAlignmentPct >= 0.9,
    },
    {
      gate: 'Pipeline health (24h)',
      target: 'error=0 & failures=0',
      value: `discovery_error=${pipeline.discoveryErrors}, compliance_error=${pipeline.complianceErrors}, compliance_failed_24h=${pipeline.complianceRunFailures24h}`,
      pass: pipelinePass,
    },
  ];

  const blockerCount = gates.filter((gate) => !gate.pass).length;
  console.log(
    JSON.stringify(
      {
        reportPath,
        recommendationCount: total,
        gates: gates.map((gate) => ({
          gate: gate.gate,
          target: gate.target,
          value: gate.value,
          status: boolToPass(gate.pass),
        })),
        summary: {
          overallStatus: blockerCount === 0 ? 'PASS' : 'FAIL',
          failedGateCount: blockerCount,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[LaunchQualityGates] fatal', {
    error: (error as Error).message,
  });
  process.exitCode = 1;
});
