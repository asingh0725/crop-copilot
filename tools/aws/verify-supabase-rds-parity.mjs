#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sourceUrl =
  process.env.SUPABASE_SOURCE_DATABASE_URL ??
  process.env.SOURCE_DATABASE_URL ??
  readEnvValue(path.resolve(process.cwd(), 'apps/web/.env'), 'DIRECT_URL') ??
  readEnvValue(path.resolve(process.cwd(), 'apps/web/.env'), 'DATABASE_URL');

const targetUrl = process.env.TARGET_DATABASE_URL;

if (!sourceUrl) {
  throw new Error(
    'Missing source database URL. Set SUPABASE_SOURCE_DATABASE_URL or SOURCE_DATABASE_URL.'
  );
}

if (!targetUrl) {
  throw new Error('Missing target database URL. Set TARGET_DATABASE_URL.');
}

const sourceCounts = getPublicTableCounts(sourceUrl);
const targetCounts = getPublicTableCounts(targetUrl);
const tableNames = Array.from(new Set([...sourceCounts.keys(), ...targetCounts.keys()])).sort();

let mismatchCount = 0;
for (const tableName of tableNames) {
  const sourceCount = sourceCounts.get(tableName) ?? -1;
  const targetCount = targetCounts.get(tableName) ?? -1;
  if (sourceCount !== targetCount) {
    mismatchCount += 1;
    console.log(
      `MISMATCH ${tableName}: source=${sourceCount.toString()} target=${targetCount.toString()}`
    );
  }
}

if (mismatchCount > 0) {
  throw new Error(`Row-count mismatch on ${mismatchCount.toString()} table(s).`);
}

console.log(`OK: row-count parity confirmed for ${tableNames.length.toString()} tables.`);

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

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
