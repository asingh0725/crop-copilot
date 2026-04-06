#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

function latestMatchingFile(dir, prefix) {
  const entries = readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort((left, right) => right.localeCompare(left));
  if (entries.length === 0) {
    return null;
  }
  return resolve(dir, entries[0]);
}

function currency(value) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function pct(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function main() {
  const reportsDir = resolve(process.cwd(), 'reports');
  const awsPath = latestMatchingFile(reportsDir, 'aws-ops-audit-');
  const readinessPath = latestMatchingFile(reportsDir, 'release-readiness-');

  if (!awsPath && !readinessPath) {
    throw new Error(`No audit inputs found in ${reportsDir}`);
  }

  const aws = awsPath ? JSON.parse(readFileSync(awsPath, 'utf8')) : {};
  const readiness = readinessPath ? JSON.parse(readFileSync(readinessPath, 'utf8')) : {};

  const topCosts = (aws.costLast30DaysByService ?? []).slice(0, 6);
  const findings = aws.findings ?? [];
  const blockers = (readiness.gaps ?? []).filter((gap) => gap.severity === 'blocker');
  const warnings = (readiness.gaps ?? []).filter((gap) => gap.severity === 'warning');
  const inventory = aws.inventory?.['us-west-2'] ?? {};
  const dbInstances = inventory.dbInstances ?? [];
  const elasticIps = inventory.elasticIps ?? [];

  const md = `# Ops Daily Digest

- Generated: ${new Date().toISOString()}
- AWS audit source: ${awsPath ? basename(awsPath) : 'missing'}
- Release audit source: ${readinessPath ? basename(readinessPath) : 'missing'}

## Cost Snapshot

${topCosts.length > 0 ? topCosts.map((entry) => `- ${entry.key}: ${currency(entry.amountUsd)}`).join('\n') : '- No AWS cost data'}

## Forward Run Rate

- Estimated AWS monthly floor: ${currency(aws.estimatedForwardMonthlyRunRate?.totalAmountUsd ?? 0)}
${(aws.estimatedForwardMonthlyRunRate?.components ?? [])
  .map((entry) => `- ${entry.key}: ${currency(entry.amountUsd)}`)
  .join('\n') || '- No forward estimate'}

## Live Inventory

- us-west-2 stacks: ${inventory.stacks?.length ?? 0}
- prod DB instances: ${dbInstances.length}
- active SageMaker endpoints: ${(inventory.sagemakerEndpoints ?? []).length}
- elastic IPs: ${elasticIps.length}

${dbInstances
  .map(
    (db) =>
      `- DB ${db.id}: ${db.class}, public=${db.public}, backupRetention=${db.backupRetention}d, storage=${db.allocated}GB`
  )
  .join('\n')}

## Audit Findings

${findings.length > 0 ? findings.map((finding) => `- [${finding.severity}] ${finding.message}`).join('\n') : '- None'}

## Release Readiness

- Blockers: ${blockers.length}
- Warnings: ${warnings.length}

${blockers.map((gap) => `- [blocker] ${gap.area}: ${gap.message}`).join('\n') || '- No blockers'}

${warnings.map((gap) => `- [warning] ${gap.area}: ${gap.message}`).join('\n') || '- No warnings'}

## Model Usage

${(readiness.metrics?.recommendationModelUsage30d ?? [])
  .map((entry) => `- ${entry.modelUsed}: ${entry.count}`)
  .join('\n') || '- No model usage data'}

## Premium Coverage

- Ready insights: ${readiness.metrics?.premiumSummary?.ready_count ?? 0}
- Live weather coverage: ${pct(
    Number(readiness.metrics?.premiumSummary?.weather_live ?? 0) /
      Math.max(1, Number(readiness.metrics?.premiumSummary?.weather_eligible ?? 0))
  )}
- Cost totals coverage: ${pct(
    Number(readiness.metrics?.premiumSummary?.cost_totals ?? 0) /
      Math.max(1, Number(readiness.metrics?.premiumSummary?.cost_eligible ?? 0))
  )}
- Learned premium quality check coverage: ${pct(
    Number(readiness.metrics?.premiumSummary?.quality_check_present ?? 0) /
      Math.max(1, Number(readiness.metrics?.premiumSummary?.ready_count ?? 0))
  )}
`;

  const outputPath = resolve(
    reportsDir,
    `ops-daily-digest-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`
  );
  writeFileSync(outputPath, md, 'utf8');
  console.log(outputPath);
}

main();
