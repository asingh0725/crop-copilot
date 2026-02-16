import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { getBearerToken, verifyJwtToken } from './cognito-jwt';

test('extracts bearer token from authorization header', () => {
  const token = getBearerToken({ authorization: 'Bearer token-123' });
  assert.equal(token, 'token-123');
});

test('verifies Cognito-compatible JWT payload with local keyset', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'local-key';
  jwk.use = 'sig';
  jwk.alg = 'RS256';

  const issuer = 'https://cognito-idp.ca-west-1.amazonaws.com/ca-west-1_testpool';

  const token = await new SignJWT({
    email: 'grower@example.com',
    scope: 'recommendation:read recommendation:write',
    token_use: 'access',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-key' })
    .setSubject('11111111-1111-1111-1111-111111111111')
    .setIssuer(issuer)
    .setAudience('test-client-id')
    .setExpirationTime('5m')
    .setIssuedAt()
    .sign(privateKey);

  const localJwks = createLocalJWKSet({ keys: [jwk] });

  const auth = await verifyJwtToken(
    token,
    {
      region: 'ca-west-1',
      userPoolId: 'ca-west-1_testpool',
      clientId: 'test-client-id',
    },
    localJwks
  );

  assert.equal(auth.userId, '11111111-1111-1111-1111-111111111111');
  assert.equal(auth.email, 'grower@example.com');
  assert.deepEqual(auth.scopes, ['recommendation:read', 'recommendation:write']);
});
