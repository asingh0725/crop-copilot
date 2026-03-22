#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const workspaceRoot = process.cwd();

function exists(relativePath) {
  return fs.existsSync(path.resolve(workspaceRoot, relativePath));
}

function fileIncludes(relativePath, needle) {
  const targetPath = path.resolve(workspaceRoot, relativePath);
  if (!fs.existsSync(targetPath)) {
    return false;
  }
  return fs.readFileSync(targetPath, 'utf8').includes(needle);
}

function hasBranch(branchName) {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
      stdio: 'ignore',
      cwd: workspaceRoot,
    });
    return true;
  } catch {
    return false;
  }
}

function workflowContains(relativePath, needle) {
  return exists(relativePath) && fileIncludes(relativePath, needle);
}
const checks = [
  {
    id: 'workflow_env',
    description: 'Env deploy workflow exists',
    pass: exists('.github/workflows/deploy-env.yml'),
  },
  {
    id: 'workflow_prod',
    description: 'Prod deploy workflow exists',
    pass: exists('.github/workflows/deploy-prod.yml'),
  },
  {
    id: 'branch_env',
    description: 'Local env branch exists',
    pass: hasBranch('env') || hasBranch('codex/env'),
  },
  {
    id: 'branch_prod',
    description: 'Local prod branch exists',
    pass: hasBranch('prod') || hasBranch('codex/prod'),
  },
  {
    id: 'infra_env_dev_template',
    description: 'infra/.env.dev.example exists',
    pass: exists('infra/.env.dev.example'),
  },
  {
    id: 'infra_env_prod_template',
    description: 'infra/.env.prod.example exists',
    pass: exists('infra/.env.prod.example'),
  },
  {
    id: 'api_env_dev_template',
    description: 'apps/api/.env.dev.example exists',
    pass: exists('apps/api/.env.dev.example'),
  },
  {
    id: 'api_env_prod_template',
    description: 'apps/api/.env.prod.example exists',
    pass: exists('apps/api/.env.prod.example'),
  },
  {
    id: 'web_env_dev_template',
    description: 'apps/web/.env.dev.example exists',
    pass: exists('apps/web/.env.dev.example'),
  },
  {
    id: 'web_env_prod_template',
    description: 'apps/web/.env.prod.example exists',
    pass: exists('apps/web/.env.prod.example'),
  },
  {
    id: 'no_staging_selector',
    description: 'infra/.env.example no longer advertises staging',
    pass:
      exists('infra/.env.example') &&
      !fileIncludes('infra/.env.example', 'staging'),
  },
  {
    id: 'gitignore_env_wildcard',
    description: '.gitignore protects .env.* files',
    pass:
      fileIncludes('.gitignore', '.env.*') &&
      fileIncludes('.gitignore', '!.env.*.example'),
  },
  {
    id: 'env_workflow_database_secret',
    description: 'Env workflow injects DATABASE_URL secret',
    pass: workflowContains('.github/workflows/deploy-env.yml', 'DATABASE_URL: ${{ secrets.DATABASE_URL }}'),
  },
  {
    id: 'prod_workflow_database_secret',
    description: 'Prod workflow injects DATABASE_URL secret',
    pass: workflowContains('.github/workflows/deploy-prod.yml', 'DATABASE_URL: ${{ secrets.DATABASE_URL }}'),
  },
  {
    id: 'env_workflow_disables_legacy_fallback',
    description: 'Env workflow disables legacy .env fallback',
    pass: workflowContains('.github/workflows/deploy-env.yml', 'ALLOW_LEGACY_ENV_FALLBACK: "false"'),
  },
  {
    id: 'prod_workflow_disables_legacy_fallback',
    description: 'Prod workflow disables legacy .env fallback',
    pass: workflowContains('.github/workflows/deploy-prod.yml', 'ALLOW_LEGACY_ENV_FALLBACK: "false"'),
  },
  {
    id: 'env_workflow_external_db_mode',
    description: 'Env workflow deploys API in external DB mode',
    pass: workflowContains('.github/workflows/deploy-env.yml', 'API_DATABASE_MODE: external'),
  },
  {
    id: 'prod_workflow_external_db_mode',
    description: 'Prod workflow deploys API in external DB mode',
    pass: workflowContains('.github/workflows/deploy-prod.yml', 'API_DATABASE_MODE: external'),
  },
  {
    id: 'env_workflow_model_output_guard',
    description: 'Env workflow leaves model output guard disabled for iteration',
    pass: workflowContains('.github/workflows/deploy-env.yml', 'REQUIRE_MODEL_OUTPUT: "false"'),
  },
  {
    id: 'prod_workflow_model_output_guard',
    description: 'Prod workflow enforces model output guard',
    pass: workflowContains('.github/workflows/deploy-prod.yml', 'REQUIRE_MODEL_OUTPUT: "true"'),
  },
];

const gaps = checks
  .filter((check) => !check.pass)
  .map((check) => ({ id: check.id, message: check.description }));

const report = {
  auditedAt: new Date().toISOString(),
  overallStatus: gaps.length === 0 ? 'PASS' : 'FAIL',
  checks: checks.map((check) => ({
    id: check.id,
    description: check.description,
    status: check.pass ? 'PASS' : 'FAIL',
  })),
  gapCount: gaps.length,
  gaps,
};

console.log(JSON.stringify(report, null, 2));

if (gaps.length > 0) {
  process.exitCode = 1;
}
