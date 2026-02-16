import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CreateUploadUrlResponseSchema,
  type CreateUploadUrlRequest,
  type CreateUploadUrlResponse,
} from '@crop-copilot/contracts';

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 900;

export interface UploadSignerDependencies {
  client?: S3Client;
  signer?: UploadSigner;
  now?: () => number;
}

type UploadSigner = (
  client: S3Client,
  command: PutObjectCommand,
  options: { expiresIn: number }
) => Promise<string>;

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resolveBucketName(): string {
  const bucket = process.env.S3_UPLOAD_BUCKET;
  if (!bucket) {
    throw new Error('S3_UPLOAD_BUCKET is not configured');
  }

  return bucket;
}

function resolveS3Client(): S3Client {
  const region = process.env.AWS_REGION || process.env.COGNITO_REGION || 'ca-west-1';
  return new S3Client({ region });
}

export async function createPresignedUploadUrl(
  userId: string,
  payload: CreateUploadUrlRequest,
  dependencies: UploadSignerDependencies = {}
): Promise<CreateUploadUrlResponse> {
  const bucket = resolveBucketName();
  const expiresInSeconds = Number(
    process.env.S3_UPLOAD_URL_EXPIRY_SECONDS ?? DEFAULT_UPLOAD_EXPIRY_SECONDS
  );

  const timestamp = dependencies.now?.() ?? Date.now();
  const objectKey = `${userId}/${timestamp}-${randomUUID()}-${sanitizeFileName(
    payload.fileName
  )}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: payload.contentType,
    ContentLength: payload.contentLength,
    Metadata: {
      uploader: userId,
    },
  });

  const defaultSigner: UploadSigner = async (client, putObjectCommand, options) =>
    getSignedUrl(client as any, putObjectCommand as any, options as any);
  const signer: UploadSigner = dependencies.signer ?? defaultSigner;
  const client = dependencies.client ?? resolveS3Client();

  const uploadUrl = await signer(client, command, {
    expiresIn: expiresInSeconds,
  });

  return CreateUploadUrlResponseSchema.parse({
    uploadUrl,
    objectKey,
    expiresInSeconds,
  });
}
