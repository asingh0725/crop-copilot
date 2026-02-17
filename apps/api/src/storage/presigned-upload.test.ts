import test from 'node:test';
import assert from 'node:assert/strict';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  createPresignedUploadUrl,
  createPresignedViewUrl,
} from './presigned-upload';

test('createPresignedUploadUrl returns upload metadata with deterministic timestamp', async () => {
  process.env.S3_UPLOAD_BUCKET = 'crop-copilot-dev-uploads';
  let observedContentLength: number | undefined;

  const response = await createPresignedUploadUrl(
    '11111111-1111-4111-8111-111111111111',
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
  assert.match(response.objectKey, /^11111111-1111-4111-8111-111111111111\/1700000000000-/);
  assert.match(response.objectKey, /leaf_photo.jpg$/);
  assert.equal(observedContentLength, 2048);
});

test('createPresignedViewUrl returns signed download URL for same-user object', async () => {
  process.env.S3_UPLOAD_BUCKET = 'crop-copilot-dev-uploads';

  const response = await createPresignedViewUrl(
    '11111111-1111-4111-8111-111111111111',
    'https://crop-copilot-dev-uploads.s3.ca-west-1.amazonaws.com/11111111-1111-4111-8111-111111111111/1700000000000-photo.jpg',
    {
      client: {} as S3Client,
      downloadSigner: async () => 'https://example.com/download-url',
    }
  );

  assert.equal(response.downloadUrl, 'https://example.com/download-url');
  assert.equal(response.expiresInSeconds, 900);
});

test('createPresignedViewUrl rejects object access for different users', async () => {
  process.env.S3_UPLOAD_BUCKET = 'crop-copilot-dev-uploads';

  await assert.rejects(
    createPresignedViewUrl(
      '11111111-1111-4111-8111-111111111111',
      'https://crop-copilot-dev-uploads.s3.ca-west-1.amazonaws.com/22222222-2222-4222-8222-222222222222/1700000000000-photo.jpg',
      {
        client: {} as S3Client,
        downloadSigner: async () => 'https://example.com/download-url',
      }
    ),
    /Forbidden object key access/
  );
});
