#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { loadEnvironmentConfig } from '../lib/config';
import { FoundationStack } from '../lib/stacks/foundation-stack';
import { ApiRuntimeStack } from '../lib/stacks/api-runtime-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';

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
