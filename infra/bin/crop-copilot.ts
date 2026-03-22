#!/usr/bin/env node
import 'source-map-support/register';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import { App } from 'aws-cdk-lib';

type DeployEnvironment = 'dev' | 'prod';

function normalizeEnvironment(raw: string | undefined): DeployEnvironment {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'prod') {
    return 'prod';
  }
  return 'dev';
}

function buildEnvCandidates(workspaceRoot: string, envName: DeployEnvironment): string[] {
  return [
    path.resolve(workspaceRoot, `.env.${envName}.local`),
    path.resolve(workspaceRoot, 'infra', `.env.${envName}.local`),
    path.resolve(workspaceRoot, 'apps', 'api', `.env.${envName}.local`),
    path.resolve(workspaceRoot, 'apps', 'web', `.env.${envName}.local`),
    path.resolve(workspaceRoot, `.env.${envName}`),
    path.resolve(workspaceRoot, 'infra', `.env.${envName}`),
    path.resolve(workspaceRoot, 'apps', 'api', `.env.${envName}`),
    path.resolve(workspaceRoot, 'apps', 'web', `.env.${envName}`),
  ];
}

function buildLegacyCandidates(workspaceRoot: string): string[] {
  return [
    path.resolve(workspaceRoot, '.env.local'),
    path.resolve(workspaceRoot, 'infra', '.env.local'),
    path.resolve(workspaceRoot, 'apps', 'api', '.env.local'),
    path.resolve(workspaceRoot, 'apps', 'web', '.env.local'),
    path.resolve(workspaceRoot, '.env'),
    path.resolve(workspaceRoot, 'infra', '.env'),
    path.resolve(workspaceRoot, 'apps', 'api', '.env'),
    path.resolve(workspaceRoot, 'apps', 'web', '.env'),
  ];
}

function loadEnvFiles(candidates: string[]): string[] {
  const loaded: string[] = [];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      loaded.push(envPath);
    }
  }
  return loaded;
}

const workspaceRoot = path.resolve(__dirname, '..', '..');
const requestedEnv = normalizeEnvironment(process.env.CROP_ENV ?? process.env.DEPLOY_ENV);
const allowLegacyFallback =
  (process.env.ALLOW_LEGACY_ENV_FALLBACK ?? 'false').trim().toLowerCase() === 'true';

const envSpecificFiles = loadEnvFiles(buildEnvCandidates(workspaceRoot, requestedEnv));
if (envSpecificFiles.length === 0) {
  if (allowLegacyFallback) {
    const legacyFiles = loadEnvFiles(buildLegacyCandidates(workspaceRoot));
    if (legacyFiles.length > 0) {
      console.warn(
        `[infra] Using legacy non-environment env files for ${requestedEnv}. Create env-scoped files to prevent dev/prod bleed.`
      );
    }
  } else {
    console.warn(
      `[infra] No env-scoped file found for ${requestedEnv}. Continuing with process env only; legacy .env fallback is disabled.`
    );
  }
}
import { loadEnvironmentConfig } from '../lib/config';
import { FoundationStack } from '../lib/stacks/foundation-stack';
import { ApiRuntimeStack } from '../lib/stacks/api-runtime-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { BudgetStack } from '../lib/stacks/budget-stack';

const app = new App();
const config = loadEnvironmentConfig();

const foundation = new FoundationStack(app, `${config.projectSlug}-${config.envName}-foundation`, {
  env: {
    account: config.accountId,
    region: config.region,
  },
  description: `Crop Copilot foundation infrastructure (${config.envName})`,
  config,
});

// AWS Budgets CloudFormation resources must be deployed to us-east-1 (N. Virginia)
// regardless of the application region. This is an AWS API requirement.
new BudgetStack(app, `${config.projectSlug}-${config.envName}-budget`, {
  env: {
    account: config.accountId,
    region: 'us-east-1', // HARDCODED — do not change
  },
  description: `Crop Copilot monthly cost budget (${config.envName})`,
  config,
  billingAlertsTopicArn: foundation.billingAlertsTopicArn,
});

const provisionAwsDatabase = process.env.PROVISION_AWS_DATABASE !== 'false';
const database =
  provisionAwsDatabase
    ? new DatabaseStack(app, `${config.projectSlug}-${config.envName}-database`, {
        env: {
          account: config.accountId,
          region: config.region,
        },
        description: `Crop Copilot PostgreSQL database (${config.envName})`,
        config,
      })
    : undefined;

new ApiRuntimeStack(app, `${config.projectSlug}-${config.envName}-api-runtime`, {
  env: {
    account: config.accountId,
    region: config.region,
  },
  description: `Crop Copilot API runtime (${config.envName})`,
  config,
  foundation,
  database,
});
