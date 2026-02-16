#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { loadEnvironmentConfig } from '../lib/config';
import { FoundationStack } from '../lib/stacks/foundation-stack';

const app = new App();
const config = loadEnvironmentConfig();

new FoundationStack(app, `${config.projectSlug}-${config.envName}-foundation`, {
  env: {
    account: config.accountId,
    region: config.region,
  },
  description: `Crop Copilot foundation infrastructure (${config.envName})`,
  config,
});
