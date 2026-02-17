import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGetUploadViewUrlHandler } from './get-upload-view-url';

interface HandlerResponse {
  statusCode: number;
  body?: string;
}

function asHandlerResponse(response: unknown): HandlerResponse {
  assert.ok(response && typeof response === 'object', 'handler did not return an object');
  assert.ok('statusCode' in response, 'handler response is missing statusCode');
  return response as HandlerResponse;
}

test('get upload view url handler returns signed view url payload', async () => {
  const handler = buildGetUploadViewUrlHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['upload:read'],
    }),
    async () => ({
      downloadUrl: 'https://example.com/download',
      expiresInSeconds: 900,
    })
  );

  const response = asHandlerResponse(
    await handler(
      {
        queryStringParameters: {
          objectUrl:
            'https://crop-copilot-dev-uploads.s3.ca-west-1.amazonaws.com/11111111-1111-4111-8111-111111111111/example.jpg',
        },
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body || '{}');
  assert.equal(body.downloadUrl, 'https://example.com/download');
});

test('get upload view url handler returns 403 for forbidden access', async () => {
  const handler = buildGetUploadViewUrlHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['upload:read'],
    }),
    async () => {
      throw new Error('Forbidden object key access');
    }
  );

  const response = asHandlerResponse(
    await handler(
      {
        queryStringParameters: {
          objectUrl:
            'https://crop-copilot-dev-uploads.s3.ca-west-1.amazonaws.com/22222222-2222-4222-8222-222222222222/example.jpg',
        },
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 403);
});
