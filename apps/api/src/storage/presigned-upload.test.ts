import test from 'node:test';
import assert from 'node:assert/strict';
import type { S3Client } from '@aws-sdk/client-s3';
import { createPresignedUploadUrl } from './presigned-upload';

test('createPresignedUploadUrl returns upload metadata with deterministic timestamp', async () => {
  process.env.S3_UPLOAD_BUCKET = 'crop-copilot-dev-uploads';
  let observedContentLength: number | undefined;

  const response = await createPresignedUploadUrl(
    '11111111-1111-1111-1111-111111111111',
    {
      fileName: 'leaf photo.jpg',
      contentType: 'image/jpeg',
      contentLength: 2048,
    },
    {
      now: () => 1700000000000,
      client: {} as S3Client,
      signer: async (_client, command) => {
        observedContentLength = command.input.ContentLength;
        return 'https://example.com/upload-url';
      },
    }
  );

  assert.equal(response.uploadUrl, 'https://example.com/upload-url');
  assert.equal(response.expiresInSeconds, 900);
  assert.match(response.objectKey, /^11111111-1111-1111-1111-111111111111\/1700000000000-/);
  assert.match(response.objectKey, /leaf_photo.jpg$/);
  assert.equal(observedContentLength, 2048);
});
