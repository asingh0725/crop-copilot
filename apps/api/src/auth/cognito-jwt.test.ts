import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  getBearerToken,
  verifyAccessTokenFromEvent,
  verifyJwtToken,
} from './cognito-jwt';

const REGION = 'ca-west-1';
const USER_POOL_ID = 'ca-west-1_testpool';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const CLIENT_ID = 'test-client-id';

async function createSigner() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'local-key';
  jwk.use = 'sig';
  jwk.alg = 'RS256';

  return {
    privateKey,
    localJwks: createLocalJWKSet({ keys: [jwk] }),
  };
}

test('extracts bearer token from authorization header', () => {
  const token = getBearerToken({ authorization: 'Bearer token-123' });
  assert.equal(token, 'token-123');
});

test('verifies access token with client_id claim when app client is configured', async () => {
  const { privateKey, localJwks } = await createSigner();
  const token = await new SignJWT({
    email: 'grower@example.com',
    scope: 'recommendation:read recommendation:write',
    token_use: 'access',
    client_id: CLIENT_ID,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-key' })
    .setSubject('11111111-1111-1111-1111-111111111111')
    .setIssuer(ISSUER)
    .setExpirationTime('5m')
    .setIssuedAt()
    .sign(privateKey);

  const auth = await verifyJwtToken(
    token,
    {
      region: REGION,
      userPoolId: USER_POOL_ID,
      clientId: CLIENT_ID,
    },
    localJwks
  );

  assert.equal(auth.userId, '11111111-1111-1111-1111-111111111111');
  assert.equal(auth.email, 'grower@example.com');
  assert.deepEqual(auth.scopes, ['recommendation:read', 'recommendation:write']);
});

test('verifyAccessTokenFromEvent rejects id tokens', async () => {
  const { privateKey, localJwks } = await createSigner();
  const token = await new SignJWT({
    token_use: 'id',
    email: 'grower@example.com',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-key' })
    .setSubject('11111111-1111-1111-1111-111111111111')
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setExpirationTime('5m')
    .setIssuedAt()
    .sign(privateKey);

  const previousRegion = process.env.COGNITO_REGION;
  const previousUserPoolId = process.env.COGNITO_USER_POOL_ID;
  const previousClientId = process.env.COGNITO_APP_CLIENT_ID;

  process.env.COGNITO_REGION = REGION;
  process.env.COGNITO_USER_POOL_ID = USER_POOL_ID;
  process.env.COGNITO_APP_CLIENT_ID = CLIENT_ID;

  try {
    await assert.rejects(
      () =>
        verifyAccessTokenFromEvent(
          {
            headers: { authorization: `Bearer ${token}` },
          } as any,
          localJwks
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'INVALID_TOKEN_USE');
        return true;
      }
    );
  } finally {
    process.env.COGNITO_REGION = previousRegion;
    process.env.COGNITO_USER_POOL_ID = previousUserPoolId;
    process.env.COGNITO_APP_CLIENT_ID = previousClientId;
  }
});

test('verifyAccessTokenFromEvent accepts access tokens', async () => {
  const { privateKey, localJwks } = await createSigner();
  const token = await new SignJWT({
    token_use: 'access',
    client_id: CLIENT_ID,
    scope: 'recommendation:read',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-key' })
    .setSubject('11111111-1111-1111-1111-111111111111')
    .setIssuer(ISSUER)
    .setExpirationTime('5m')
    .setIssuedAt()
    .sign(privateKey);

  const previousRegion = process.env.COGNITO_REGION;
  const previousUserPoolId = process.env.COGNITO_USER_POOL_ID;
  const previousClientId = process.env.COGNITO_APP_CLIENT_ID;

  process.env.COGNITO_REGION = REGION;
  process.env.COGNITO_USER_POOL_ID = USER_POOL_ID;
  process.env.COGNITO_APP_CLIENT_ID = CLIENT_ID;

  try {
    const auth = await verifyAccessTokenFromEvent(
      {
        headers: { authorization: `Bearer ${token}` },
      } as any,
      localJwks
    );
    assert.equal(auth.userId, '11111111-1111-1111-1111-111111111111');
    assert.equal(auth.tokenUse, 'access');
    assert.deepEqual(auth.scopes, ['recommendation:read']);
  } finally {
    process.env.COGNITO_REGION = previousRegion;
    process.env.COGNITO_USER_POOL_ID = previousUserPoolId;
    process.env.COGNITO_APP_CLIENT_ID = previousClientId;
  }
});
