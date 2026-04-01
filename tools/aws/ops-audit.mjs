#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REGIONS = (process.env.AWS_AUDIT_REGIONS ?? 'us-west-2,us-west-1,ca-west-1')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function runAws(args, region) {
  const env = {
    ...process.env,
    AWS_PAGER: '',
  };
  if (region) {
    env.AWS_REGION = region;
  }

  const output = execFileSync('aws', args, {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.trim();
}

function runAwsJson(args, region) {
  const output = runAws([...args, '--output', 'json'], region);
  return output ? JSON.parse(output) : null;
}

function toErrorMessage(error) {
  return `${error?.stderr ?? error?.message ?? error}`.trim();
}

function runAwsJsonSafe(args, region, fallbackValue) {
  try {
    return {
      value: runAwsJson(args, region),
      error: null,
    };
  } catch (error) {
    return {
      value: fallbackValue,
      error: {
        command: ['aws', ...args].join(' '),
        message: toErrorMessage(error),
      },
    };
  }
}

function tomorrowIso() {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function monthStartIso() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function daysAgoIso(days) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function currency(value) {
  return Number.parseFloat(value ?? '0');
}

function summarizeCostGroups(groups) {
  return (groups ?? [])
    .map((group) => ({
      key: group.Keys?.[0] ?? 'unknown',
      amountUsd: currency(group.Metrics?.UnblendedCost?.Amount),
    }))
    .filter((row) => row.amountUsd !== 0)
    .sort((a, b) => b.amountUsd - a.amountUsd);
}

function summarizeAcrossTime(resultsByTime) {
  const totals = new Map();
  for (const window of resultsByTime ?? []) {
    for (const group of window.Groups ?? []) {
      const key = group.Keys?.[0] ?? 'unknown';
      const amountUsd = currency(group.Metrics?.UnblendedCost?.Amount);
      totals.set(key, (totals.get(key) ?? 0) + amountUsd);
    }
  }
  return [...totals.entries()]
    .map(([key, amountUsd]) => ({ key, amountUsd }))
    .filter((row) => row.amountUsd !== 0)
    .sort((a, b) => b.amountUsd - a.amountUsd);
}

function detectRuntimeRegion(inventory) {
  for (const [region, data] of Object.entries(inventory)) {
    if ((data.apis ?? []).some((api) => `${api.name ?? ''}`.includes('crop-copilot-prod-api'))) {
      return region;
    }
  }
  return null;
}

function detectProdDbRegion(inventory) {
  for (const [region, data] of Object.entries(inventory)) {
    if ((data.dbInstances ?? []).some((db) => `${db.id ?? ''}`.includes('crop-copilot-prod'))) {
      return region;
    }
  }
  return null;
}

function buildFindings({ inventory, serviceCosts, rdsUsageCosts }) {
  const findings = [];

  const runtimeRegion = detectRuntimeRegion(inventory);
  const prodDbRegion = detectProdDbRegion(inventory);
  if (runtimeRegion && prodDbRegion && runtimeRegion !== prodDbRegion) {
    findings.push({
      severity: 'high',
      code: 'prod_region_drift',
      message: `Prod runtime is in ${runtimeRegion} while prod database is in ${prodDbRegion}.`,
    });
  }

  const dbRegions = Object.entries(inventory)
    .filter(([, data]) => (data.dbInstances ?? []).length > 0)
    .map(([region]) => region);
  if (dbRegions.length > 1) {
    findings.push({
      severity: 'high',
      code: 'multiple_rds_regions',
      message: `Crop Copilot databases exist in multiple regions: ${dbRegions.join(', ')}.`,
    });
  }

  const activeEndpoints = Object.entries(inventory).flatMap(([region, data]) =>
    (data.sagemakerEndpoints ?? []).map((endpoint) => ({ region, endpoint }))
  );
  if (activeEndpoints.length > 0) {
    findings.push({
      severity: 'high',
      code: 'active_sagemaker_endpoints',
      message: `Active SageMaker endpoints found: ${activeEndpoints
        .map((item) => `${item.endpoint.EndpointName}@${item.region}`)
        .join(', ')}.`,
    });
  }

  const rdsCost = rdsUsageCosts.reduce((sum, item) => sum + item.amountUsd, 0);
  const vpcCost =
    serviceCosts.find((item) => item.key === 'Amazon Virtual Private Cloud')?.amountUsd ?? 0;
  if (rdsCost > 0 || vpcCost > 0) {
    findings.push({
      severity: 'medium',
      code: 'database_cost_shape',
      message: `RDS is $${rdsCost.toFixed(2)} MTD and VPC is $${vpcCost.toFixed(2)} MTD, which likely includes public IPv4 charges for publicly accessible RDS instances.`,
    });
  }

  const auditErrors = Object.entries(inventory).flatMap(([region, data]) =>
    (data.auditErrors ?? []).map((error) => ({ region, error }))
  );
  if (auditErrors.length > 0) {
    findings.push({
      severity: 'low',
      code: 'inventory_permission_gaps',
      message: `Some optional inventory probes were skipped due to access limits: ${auditErrors
        .map((item) => `${item.region}: ${item.error.command}`)
        .join(', ')}.`,
    });
  }

  return findings;
}

function main() {
  const identity = runAwsJson(['sts', 'get-caller-identity']);
  const costByService = runAwsJson(
    [
      'ce',
      'get-cost-and-usage',
      '--time-period',
      `Start=${daysAgoIso(30)},End=${tomorrowIso()}`,
      '--granularity',
      'MONTHLY',
      '--metrics',
      'UnblendedCost',
      '--group-by',
      'Type=DIMENSION,Key=SERVICE',
    ],
    process.env.AWS_REGION ?? 'us-west-2'
  );

  const rdsUsage = runAwsJson(
    [
      'ce',
      'get-cost-and-usage',
      '--time-period',
      `Start=${monthStartIso()},End=${tomorrowIso()}`,
      '--granularity',
      'MONTHLY',
      '--metrics',
      'UnblendedCost',
      '--filter',
      '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Relational Database Service"]}}',
      '--group-by',
      'Type=DIMENSION,Key=USAGE_TYPE',
    ],
    process.env.AWS_REGION ?? 'us-west-2'
  );

  const inventory = {};
  for (const region of REGIONS) {
    const stacks = runAwsJsonSafe(
      [
        'cloudformation',
        'list-stacks',
        '--stack-status-filter',
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_COMPLETE',
        '--query',
        'StackSummaries[?contains(StackName, `crop-copilot`)]',
      ],
      region,
      { StackSummaries: [] }
    );
    const dbInstances = runAwsJsonSafe(
      [
        'rds',
        'describe-db-instances',
        '--query',
        'DBInstances[].{id:DBInstanceIdentifier,status:DBInstanceStatus,class:DBInstanceClass,public:PubliclyAccessible,backupRetention:BackupRetentionPeriod,allocated:AllocatedStorage,region:AvailabilityZone}',
      ],
      region,
      []
    );
    const sagemakerEndpoints = runAwsJsonSafe(['sagemaker', 'list-endpoints'], region, {
      Endpoints: [],
    });
    const apis = runAwsJsonSafe(
      [
        'apigatewayv2',
        'get-apis',
        '--query',
        'Items[?contains(Name, `crop-copilot`)].{name:Name,id:ApiId,endpoint:ApiEndpoint}',
      ],
      region,
      []
    );

    inventory[region] = {
      auditErrors: [stacks.error, dbInstances.error, sagemakerEndpoints.error, apis.error].filter(
        Boolean
      ),
      stacks: stacks.value?.StackSummaries ?? [],
      dbInstances: dbInstances.value ?? [],
      sagemakerEndpoints: sagemakerEndpoints.value?.Endpoints ?? [],
      apis: apis.value ?? [],
    };
  }

  const serviceCosts = summarizeAcrossTime(costByService?.ResultsByTime);
  const rdsUsageCosts = summarizeAcrossTime(rdsUsage?.ResultsByTime);
  const findings = buildFindings({ inventory, serviceCosts, rdsUsageCosts });

  const report = {
    generatedAt: new Date().toISOString(),
    identity,
    regions: REGIONS,
    costLast30DaysByService: serviceCosts,
    monthToDateRdsUsage: rdsUsageCosts,
    inventory,
    findings,
  };

  const reportsDir = resolve(process.cwd(), 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const filename = resolve(
    reportsDir,
    `aws-ops-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  writeFileSync(filename, JSON.stringify(report, null, 2));

  const summary = {
    account: identity?.Account ?? null,
    reportFile: filename,
    topServices: serviceCosts.slice(0, 8),
    findings,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
