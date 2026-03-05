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
    description: 'Local codex/env branch exists',
    pass: hasBranch('codex/env'),
  },
  {
    id: 'branch_prod',
    description: 'Local codex/prod branch exists',
    pass: hasBranch('codex/prod'),
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
