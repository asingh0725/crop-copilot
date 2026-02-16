import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreateUploadUrlHandler } from './create-upload-url';

interface HandlerResponse {
  statusCode: number;
  body?: string;
}

function asHandlerResponse(response: unknown): HandlerResponse {
  assert.ok(response && typeof response === 'object', 'handler did not return an object');
  assert.ok('statusCode' in response, 'handler response is missing statusCode');
  return response as HandlerResponse;
}

test('create upload url handler returns signed url payload', async () => {
  process.env.S3_UPLOAD_BUCKET = 'crop-copilot-dev-uploads';

  const handler = buildCreateUploadUrlHandler(
    async () => ({
      userId: '11111111-1111-1111-1111-111111111111',
      scopes: ['upload:write'],
    }),
    async (_userId, _payload) => ({
      uploadUrl: 'https://example.com/upload',
      objectKey: '11111111-1111-1111-1111-111111111111/object.jpg',
      expiresInSeconds: 900,
    })
  );

  const response = asHandlerResponse(
    await handler(
      {
        body: JSON.stringify({
          fileName: 'field-photo.jpg',
          contentType: 'image/jpeg',
          contentLength: 4096,
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body || '{}');
  assert.equal(body.uploadUrl, 'https://example.com/upload');
  assert.equal(body.expiresInSeconds, 900);
});

test('create upload url handler returns 500 for storage failures', async () => {
  const handler = buildCreateUploadUrlHandler(
    async () => ({
      userId: '11111111-1111-1111-1111-111111111111',
      scopes: ['upload:write'],
    }),
    async () => {
      throw new Error('s3 unavailable');
    }
  );

  const response = asHandlerResponse(
    await handler(
      {
        body: JSON.stringify({
          fileName: 'field-photo.jpg',
          contentType: 'image/jpeg',
          contentLength: 4096,
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 500);
  const body = JSON.parse(response.body || '{}');
  assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR');
});

test('create upload url handler returns 400 when contentLength is missing', async () => {
  const handler = buildCreateUploadUrlHandler(
    async () => ({
      userId: '11111111-1111-1111-1111-111111111111',
      scopes: ['upload:write'],
    }),
    async (_userId, _payload) => ({
      uploadUrl: 'https://example.com/upload',
      objectKey: '11111111-1111-1111-1111-111111111111/object.jpg',
      expiresInSeconds: 900,
    })
  );

  const response = asHandlerResponse(
    await handler(
      {
        body: JSON.stringify({
          fileName: 'field-photo.jpg',
          contentType: 'image/jpeg',
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 400);
  const body = JSON.parse(response.body || '{}');
  assert.equal(body.error.code, 'BAD_REQUEST');
});
