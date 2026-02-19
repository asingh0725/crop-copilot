#!/usr/bin/env node

const requiredEnv = ['LEGACY_API_BASE_URL', 'AWS_API_BASE_URL', 'API_PARITY_BEARER_TOKEN'];
const missing = requiredEnv.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
  console.error(
    'Example: LEGACY_API_BASE_URL=https://app.example.com AWS_API_BASE_URL=https://api.example.com API_PARITY_BEARER_TOKEN=... pnpm cutover:parity'
  );
  process.exit(1);
}

const LEGACY_BASE = trimTrailingSlash(process.env.LEGACY_API_BASE_URL);
const AWS_BASE = trimTrailingSlash(process.env.AWS_API_BASE_URL);
const token = process.env.API_PARITY_BEARER_TOKEN;

const defaultChecks = [
  'GET:/api/v1/profile',
  'GET:/api/v1/inputs?limit=5',
  'GET:/api/v1/recommendations?pageSize=5',
  'GET:/api/v1/products?limit=5',
];

const checks = (process.env.API_PARITY_ENDPOINTS || defaultChecks.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => parseCheck(value));

const mismatches = [];

for (const check of checks) {
  const legacy = await requestEndpoint(LEGACY_BASE, check, token);
  const aws = await requestEndpoint(AWS_BASE, check, token);

  if (legacy.status !== aws.status) {
    mismatches.push({
      endpoint: `${check.method} ${check.path}`,
      reason: `status mismatch (${legacy.status} vs ${aws.status})`,
    });
    continue;
  }

  const legacyShape = toShape(legacy.body);
  const awsShape = toShape(aws.body);
  if (JSON.stringify(legacyShape) !== JSON.stringify(awsShape)) {
    mismatches.push({
      endpoint: `${check.method} ${check.path}`,
      reason: 'response shape mismatch',
      legacyShape,
      awsShape,
    });
  }
}

if (mismatches.length > 0) {
  console.error('API parity check failed.');
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch.endpoint}: ${mismatch.reason}`);
    if (mismatch.legacyShape) {
      console.error(`  legacy shape: ${JSON.stringify(mismatch.legacyShape)}`);
      console.error(`  aws shape:    ${JSON.stringify(mismatch.awsShape)}`);
    }
  }
  process.exit(1);
}

console.log(`API parity check passed for ${checks.length} endpoint(s).`);

function parseCheck(raw) {
  const [method, ...rest] = raw.split(':');
  if (!method || rest.length === 0) {
    throw new Error(`Invalid check format "${raw}". Use METHOD:/path`);
  }

  return {
    method: method.toUpperCase(),
    path: rest.join(':'),
  };
}

async function requestEndpoint(baseUrl, check, bearerToken) {
  const url = `${baseUrl}${check.path}`;
  const response = await fetch(url, {
    method: check.method,
    headers: {
      authorization: `Bearer ${bearerToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'x-request-id': `parity-${Date.now()}`,
    },
  });

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for shape comparison.
  }

  return {
    status: response.status,
    body: stripVolatileFields(body),
  };
}

function stripVolatileFields(value) {
  if (Array.isArray(value)) {
    return value.map(stripVolatileFields);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      key === 'traceId' ||
      key === 'requestedAt' ||
      key === 'acceptedAt' ||
      key === 'updatedAt' ||
      key === 'serverTimestamp'
    ) {
      continue;
    }

    result[key] = stripVolatileFields(child);
  }

  return result;
}

function toShape(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ['empty'];
    }

    return ['array', toShape(value[0])];
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    const shaped = {};
    for (const [key, child] of entries) {
      shaped[key] = toShape(child);
    }
    return shaped;
  }

  return typeof value;
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
