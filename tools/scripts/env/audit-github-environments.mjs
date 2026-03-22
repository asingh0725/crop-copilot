#!/usr/bin/env node

import { execSync } from 'node:child_process';

const repo = process.env.GITHUB_REPO ?? 'asingh0725/crop-copilot';
const environments = ['development', 'production'];

const requiredSecrets = [
  'AWS_ROLE_TO_ASSUME',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'OPENWEATHER_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const requiredVariables = [
  'AWS_ACCOUNT_ID',
  'AWS_REGION',
  'APP_BASE_URL',
  'ADMIN_EMAILS',
];

function ghJson(endpoint) {
  const output = execSync(`gh api ${endpoint}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function namesFromCollection(payload, key) {
  const rows = Array.isArray(payload[key]) ? payload[key] : [];
  return new Set(
    rows
      .map((row) => row?.name)
      .filter((name) => typeof name === 'string' && name.length > 0)
  );
}

const environmentReports = [];

for (const environment of environments) {
  const envPayload = ghJson(`repos/${repo}/environments/${environment}`);
  const secretPayload = ghJson(`repos/${repo}/environments/${environment}/secrets`);
  const variablePayload = ghJson(`repos/${repo}/environments/${environment}/variables`);

  const secretNames = namesFromCollection(secretPayload, 'secrets');
  const variableNames = namesFromCollection(variablePayload, 'variables');

  const missingSecrets = requiredSecrets.filter((name) => !secretNames.has(name));
  const missingVariables = requiredVariables.filter((name) => !variableNames.has(name));

  environmentReports.push({
    environment: envPayload.name ?? environment,
    missingSecrets,
    missingVariables,
    secretCount: secretNames.size,
    variableCount: variableNames.size,
  });
}

const totalMissing = environmentReports.reduce(
  (sum, env) => sum + env.missingSecrets.length + env.missingVariables.length,
  0
);

const report = {
  auditedAt: new Date().toISOString(),
  repository: repo,
  overallStatus: totalMissing === 0 ? 'PASS' : 'FAIL',
  environments: environmentReports,
  totalMissing,
};

console.log(JSON.stringify(report, null, 2));

if (totalMissing > 0) {
  process.exitCode = 1;
}
