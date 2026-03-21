#!/usr/bin/env node

import { execSync } from 'node:child_process';

const devRegion = process.env.DEV_REGION ?? 'ca-west-1';
const prodRegion = process.env.PROD_REGION ?? process.env.AWS_REGION ?? 'us-west-1';
const devStack = process.env.DEV_RUNTIME_STACK ?? 'crop-copilot-dev-api-runtime';
const prodStack = process.env.PROD_RUNTIME_STACK ?? 'crop-copilot-prod-api-runtime';
const awsProfile = process.env.AWS_PROFILE?.trim();
const auditRegions = [
  ...(process.env.AUDIT_REGIONS ?? `${devRegion},${prodRegion},us-west-2`)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
];

function awsBaseArgs(region) {
  const args = [];
  if (awsProfile) {
    args.push(`--profile ${shellEscape(awsProfile)}`);
  }
  if (region) {
    args.push(`--region ${shellEscape(region)}`);
  }
  return args.join(' ');
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runAws(region, command) {
  const full = `aws ${awsBaseArgs(region)} ${command}`.trim();
  return execSync(full, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function stackExists(region, stackName) {
  try {
    runAws(
      region,
      `cloudformation describe-stacks --stack-name ${shellEscape(stackName)} --query 'Stacks[0].StackName' --output text`
    );
    return true;
  } catch {
    return false;
  }
}

function getFirstLambdaFunctionName(region, stackName) {
  const query = "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId | [0]";
  const output = runAws(
    region,
    `cloudformation list-stack-resources --stack-name ${shellEscape(stackName)} --query ${shellEscape(query)} --output text`
  );
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== 'None' && line !== 'null');
  if (!firstLine) {
    throw new Error(`No Lambda functions found in stack ${stackName} (${region})`);
  }
  return firstLine;
}

function getFunctionEnv(region, functionName) {
  const query = 'Environment.Variables';
  const output = runAws(
    region,
    `lambda get-function-configuration --function-name ${shellEscape(functionName)} --query ${shellEscape(query)} --output json`
  );
  return JSON.parse(output);
}

function parseDatabaseHost(databaseUrl) {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).host;
  } catch {
    return null;
  }
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function auditRuntime() {
  const devFunction = getFirstLambdaFunctionName(devRegion, devStack);
  const prodFunction = getFirstLambdaFunctionName(prodRegion, prodStack);
  const duplicateProdRegions = Array.from(new Set(auditRegions)).filter(
    (region) => region !== prodRegion && stackExists(region, prodStack)
  );

  const devEnv = getFunctionEnv(devRegion, devFunction);
  const prodEnv = getFunctionEnv(prodRegion, prodFunction);

  const devDbHost = parseDatabaseHost(devEnv.DATABASE_URL);
  const prodDbHost = parseDatabaseHost(prodEnv.DATABASE_URL);
  const prodHostLooksDev =
    /crop-copilot-dev|dev-database|supabase\.co|ca-west-1/i.test(prodDbHost ?? '');

  const checks = [
    {
      id: 'dev_database_url_present',
      description: 'Dev runtime DATABASE_URL is present and parseable',
      status: devDbHost ? 'PASS' : 'FAIL',
      metric: devDbHost,
    },
    {
      id: 'prod_database_url_present',
      description: 'Prod runtime DATABASE_URL is present and parseable',
      status: prodDbHost ? 'PASS' : 'FAIL',
      metric: prodDbHost,
    },
    {
      id: 'prod_model_output_guard',
      description: 'Prod runtime enforces REQUIRE_MODEL_OUTPUT=true',
      status: isTruthy(prodEnv.REQUIRE_MODEL_OUTPUT) ? 'PASS' : 'FAIL',
      metric: String(prodEnv.REQUIRE_MODEL_OUTPUT ?? ''),
    },
    {
      id: 'runtime_database_separation',
      description: 'Dev and prod runtimes do not share the same DB host',
      status: devDbHost && prodDbHost && devDbHost !== prodDbHost ? 'PASS' : 'FAIL',
      metric: `dev=${devDbHost ?? 'missing'} prod=${prodDbHost ?? 'missing'}`,
    },
    {
      id: 'prod_runtime_db_not_dev',
      description: 'Prod runtime is not wired to a dev database host',
      status: prodDbHost && !prodHostLooksDev ? 'PASS' : 'FAIL',
      metric: prodDbHost ?? 'missing',
    },
    {
      id: 'single_prod_runtime_region',
      description: 'Prod runtime stack is deployed in only one region',
      status: duplicateProdRegions.length === 0 ? 'PASS' : 'FAIL',
      metric:
        duplicateProdRegions.length === 0
          ? `canonical=${prodRegion}`
          : `canonical=${prodRegion} duplicates=${duplicateProdRegions.join(',')}`,
    },
  ];

  const failed = checks.filter((check) => check.status === 'FAIL');

  const report = {
    auditedAt: new Date().toISOString(),
    overallStatus: failed.length === 0 ? 'PASS' : 'FAIL',
    runtime: {
      dev: {
        region: devRegion,
        stack: devStack,
        function: devFunction,
      },
      prod: {
        region: prodRegion,
        stack: prodStack,
        function: prodFunction,
      },
    },
    checks,
    gapCount: failed.length,
    gaps: failed.map((check) => ({
      id: check.id,
      message: check.description,
      metric: check.metric,
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

try {
  auditRuntime();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        auditedAt: new Date().toISOString(),
        overallStatus: 'FAIL',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
