#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const workspaceRoot = process.cwd();
const scanRoots = ['apps/web', 'apps/ios', 'apps/api', 'packages', 'infra'];
const skipDirs = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'cdk.out',
  'DerivedData',
]);
const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.swift',
  '.plist',
  '.xcconfig',
  '.json',
  '.yml',
  '.yaml',
]);

const findings = {
  web: [],
  ios: [],
  api: [],
  packages: [],
  infra: [],
  other: [],
};

const allowedApiSupabaseRefs = new Set([
  'apps/api/src/auth/supabase-auth.ts',
  'apps/api/src/auth/supabase-auth.test.ts',
  'apps/api/src/auth/with-auth.ts',
  'apps/api/src/index.ts',
]);

for (const root of scanRoots) {
  await walk(join(workspaceRoot, root), root);
}

const unexpectedApi = findings.api.filter((path) => !allowedApiSupabaseRefs.has(path));
const unexpected = [...unexpectedApi, ...findings.packages, ...findings.infra, ...findings.other];

console.log('Supabase audit summary:');
console.log(`- apps/web: ${findings.web.length}`);
console.log(`- apps/ios: ${findings.ios.length}`);
console.log(`- apps/api: ${findings.api.length}`);
console.log(`- packages: ${findings.packages.length}`);
console.log(`- infra: ${findings.infra.length}`);

if (unexpected.length > 0) {
  console.error('Unexpected Supabase references found outside legacy clients:');
  for (const file of unexpected) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('No unexpected Supabase references found in AWS backend packages.');

async function walk(absDir, rootKey) {
  let entries = [];
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (skipDirs.has(entry.name)) {
      continue;
    }

    const absPath = join(absDir, entry.name);
    const relPath = absPath.replace(`${workspaceRoot}/`, '');

    if (entry.isDirectory()) {
      await walk(absPath, rootKey);
      continue;
    }

    if (!isAllowedFile(relPath)) {
      continue;
    }

    const content = await readFile(absPath, 'utf8');
    if (!/\bsupabase\b/i.test(content)) {
      continue;
    }

    if (rootKey.startsWith('apps/web')) {
      findings.web.push(relPath);
    } else if (rootKey.startsWith('apps/ios')) {
      findings.ios.push(relPath);
    } else if (rootKey.startsWith('apps/api')) {
      findings.api.push(relPath);
    } else if (rootKey.startsWith('packages')) {
      findings.packages.push(relPath);
    } else if (rootKey.startsWith('infra')) {
      findings.infra.push(relPath);
    } else {
      findings.other.push(relPath);
    }
  }
}

function isAllowedFile(path) {
  for (const ext of allowedExtensions) {
    if (path.endsWith(ext)) {
      return true;
    }
  }

  return false;
}
