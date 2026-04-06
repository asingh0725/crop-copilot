import assert from 'node:assert/strict';
import test from 'node:test';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  getLocalAuthContext,
  isLocalAuthEnabled,
  isLocalRequestEvent,
  verifyLocalAccessTokenFromEvent,
} from './local-auth';

function buildEvent(
  headers: Record<string, string> = {},
  sourceIp = '127.0.0.1'
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /api/v1/test',
    rawPath: '/api/v1/test',
    rawQueryString: '',
    headers,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: {
        method: 'GET',
        path: '/api/v1/test',
        protocol: 'HTTP/1.1',
        sourceIp,
        userAgent: 'test',
      },
      requestId: 'req',
      routeKey: 'GET /api/v1/test',
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
  };
}

test('local auth is disabled by default', () => {
  const previous = process.env.AUTH_PROVIDER;
  delete process.env.AUTH_PROVIDER;
  try {
    assert.equal(isLocalAuthEnabled(), false);
  } finally {
    process.env.AUTH_PROVIDER = previous;
  }
});

test('local request detection only allows localhost-like hosts', () => {
  assert.equal(isLocalRequestEvent(buildEvent({ host: 'localhost:3000' })), true);
  assert.equal(isLocalRequestEvent(buildEvent({ host: 'cropcopilot.app' }, '203.0.113.9')), false);
});

test('verifyLocalAccessTokenFromEvent returns the configured local auth context', () => {
  const previousProvider = process.env.AUTH_PROVIDER;
  const previousToken = process.env.LOCAL_AUTH_BEARER_TOKEN;

  process.env.AUTH_PROVIDER = 'local';
  process.env.LOCAL_AUTH_BEARER_TOKEN = 'test-local-token';

  try {
    const auth = verifyLocalAccessTokenFromEvent(
      buildEvent({
        host: 'localhost:3000',
        authorization: 'Bearer test-local-token',
      })
    );

    assert.equal(auth.authProvider, 'local');
    assert.equal(auth.userId, getLocalAuthContext().userId);
    assert.equal(auth.email, getLocalAuthContext().email);
  } finally {
    process.env.AUTH_PROVIDER = previousProvider;
    process.env.LOCAL_AUTH_BEARER_TOKEN = previousToken;
  }
});
