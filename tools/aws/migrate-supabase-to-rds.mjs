#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profile = process.env.AWS_PROFILE ?? 'cropcopilot-dev';
const region = process.env.AWS_REGION ?? 'ca-west-1';
const envName = process.env.CROP_ENV ?? 'prod';
const projectSlug = process.env.CROP_PROJECT_SLUG ?? 'crop-copilot';

const sourceUrl =
  process.env.SUPABASE_SOURCE_DATABASE_URL ??
  process.env.SOURCE_DATABASE_URL ??
  readEnvValue(path.resolve(process.cwd(), 'apps/web/.env'), 'DIRECT_URL') ??
  readEnvValue(path.resolve(process.cwd(), 'apps/web/.env'), 'DATABASE_URL');

const targetUrl = process.env.TARGET_DATABASE_URL ?? buildTargetUrlFromAws();

if (!sourceUrl) {
  throw new Error(
    'Missing source database URL. Set SUPABASE_SOURCE_DATABASE_URL or SOURCE_DATABASE_URL.'
  );
}

if (!targetUrl) {
  throw new Error(
    'Missing target database URL. Set TARGET_DATABASE_URL or configure AWS DB SSM parameters/secrets.'
  );
}

requireBinary('pg_dump');
requireBinary('pg_restore');
requireBinary('psql');

const dumpPath = path.join(
  os.tmpdir(),
  `crop-copilot-public-${envName}-${Date.now()}.dump`
);

try {
  log('Creating public schema/data dump from source database...');
  run('pg_dump', [
    sourceUrl,
    '--schema=public',
    '--format=custom',
    '--file',
    dumpPath,
    '--no-owner',
    '--no-privileges',
  ]);

  log('Ensuring pgvector extension exists on target database...');
  run('psql', [targetUrl, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE EXTENSION IF NOT EXISTS vector;']);

  log('Restoring public schema/data into target database...');
  restoreDump(targetUrl, dumpPath);

  log('Re-applying pgvector extension safeguard...');
  run('psql', [targetUrl, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE EXTENSION IF NOT EXISTS vector;']);

  log('Comparing source/target row counts on public tables...');
  const diff = compareRowCounts(sourceUrl, targetUrl);
  if (diff.length > 0) {
    for (const line of diff) {
      console.log(line);
    }
    throw new Error(
      `Row-count mismatch detected across ${diff.length} table(s). Inspect output and rerun.`
    );
  }

  log('Migration complete. Public schema and row counts match.');
} finally {
  if (fs.existsSync(dumpPath)) {
    fs.rmSync(dumpPath, { force: true });
  }
}

function compareRowCounts(sourceDatabaseUrl, targetDatabaseUrl) {
  const sourceCounts = getPublicTableCounts(sourceDatabaseUrl);
  const targetCounts = getPublicTableCounts(targetDatabaseUrl);
  const tableNames = Array.from(new Set([...sourceCounts.keys(), ...targetCounts.keys()])).sort();

  const diffs = [];
  for (const tableName of tableNames) {
    const sourceCount = sourceCounts.get(tableName) ?? -1;
    const targetCount = targetCounts.get(tableName) ?? -1;
    if (sourceCount !== targetCount) {
      diffs.push(
        `- ${tableName}: source=${sourceCount.toString()} target=${targetCount.toString()}`
      );
    }
  }

  return diffs;
}

function getPublicTableCounts(databaseUrl) {
  const tableNames = run('psql', [
    databaseUrl,
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;",
  ])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const counts = new Map();
  for (const tableName of tableNames) {
    const countOutput = run('psql', [
      databaseUrl,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `SELECT COUNT(*) FROM public.${quoteIdent(tableName)};`,
    ]);
    counts.set(tableName, Number(countOutput.trim()));
  }
  return counts;
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildTargetUrlFromAws() {
  const prefix = `/${projectSlug}/${envName}/db/postgres`;
  const host = getSsm(`${prefix}/host`);
  const port = getSsm(`${prefix}/port`);
  const database = getSsm(`${prefix}/database`);
  const username = getSsm(`${prefix}/username`);
  const secretArn = getSsm(`${prefix}/secret-arn`);
  const password = getSecretField(secretArn, 'password');

  if (!host || !port || !database || !username || !password) {
    return null;
  }

  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
}

function getSsm(name) {
  try {
    return run('aws', [
      'ssm',
      'get-parameter',
      '--name',
      name,
      '--query',
      'Parameter.Value',
      '--output',
      'text',
      '--profile',
      profile,
      '--region',
      region,
    ]).trim();
  } catch {
    return null;
  }
}

function getSecretField(secretArn, fieldName) {
  const secretString = run('aws', [
    'secretsmanager',
    'get-secret-value',
    '--secret-id',
    secretArn,
    '--query',
    'SecretString',
    '--output',
    'text',
    '--profile',
    profile,
    '--region',
    region,
  ]);

  const parsed = JSON.parse(secretString);
  const value = parsed[fieldName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Secret field "${fieldName}" is missing in ${secretArn}.`);
  }
  return value;
}

function requireBinary(binary) {
  try {
    run('which', [binary], { quiet: true });
  } catch {
    throw new Error(`Missing required binary: ${binary}`);
  }
}

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const parsedKey = line.slice(0, separator).trim();
    if (parsedKey !== key) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return null;
}

function run(command, args, options = {}) {
  const { quiet = false } = options;
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });
}

function log(message) {
  console.log(`[aws-db-migrate] ${message}`);
}

function restoreDump(databaseUrl, dumpPath) {
  try {
    run('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      databaseUrl,
      dumpPath,
    ]);
    return;
  } catch (error) {
    const stderr = extractStderr(error);
    if (isKnownCrossVersionRestoreWarning(stderr)) {
      log(
        'pg_restore reported a known cross-version warning (`transaction_timeout`). Continuing after verification checks.'
      );
      return;
    }
    throw error;
  }
}

function extractStderr(error) {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = error.stderr;
    if (typeof stderr === 'string') {
      return stderr;
    }
  }
  return '';
}

function isKnownCrossVersionRestoreWarning(stderr) {
  if (!stderr.includes('unrecognized configuration parameter "transaction_timeout"')) {
    return false;
  }

  const allowedFragments = [
    'unrecognized configuration parameter "transaction_timeout"',
    'cannot drop schema public because other objects depend on it',
    'schema "public" already exists',
  ];

  const disallowedErrorLines = stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('pg_restore: error:'))
    .filter((line) => allowedFragments.every((fragment) => !line.includes(fragment)));

  return disallowedErrorLines.length === 0;
}
