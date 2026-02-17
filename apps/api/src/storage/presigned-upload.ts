import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  downloadSigner?: DownloadSigner;
  now?: () => number;
}

type UploadSigner = (
  client: S3Client,
  command: PutObjectCommand,
  options: { expiresIn: number }
) => Promise<string>;
type DownloadSigner = (
  client: S3Client,
  command: GetObjectCommand,
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

export interface CreateViewUrlResult {
  downloadUrl: string;
  expiresInSeconds: number;
}

export async function createPresignedViewUrl(
  userId: string,
  objectUrl: string,
  dependencies: UploadSignerDependencies = {}
): Promise<CreateViewUrlResult> {
  const bucket = resolveBucketName();
  const objectKey = resolveObjectKeyFromUrl(bucket, objectUrl);
  if (!objectKey) {
    throw new Error('Invalid objectUrl for configured upload bucket');
  }

  if (!objectKey.startsWith(`${userId}/`)) {
    throw new Error('Forbidden object key access');
  }

  const expiresInSeconds = Number(
    process.env.S3_DOWNLOAD_URL_EXPIRY_SECONDS ?? DEFAULT_UPLOAD_EXPIRY_SECONDS
  );

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  const defaultSigner: DownloadSigner = async (client, getObjectCommand, options) =>
    getSignedUrl(client as any, getObjectCommand as any, options as any);
  const signer: DownloadSigner = dependencies.downloadSigner ?? defaultSigner;
  const client = dependencies.client ?? resolveS3Client();

  const downloadUrl = await signer(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    downloadUrl,
    expiresInSeconds,
  };
}

function resolveObjectKeyFromUrl(bucket: string, objectUrl: string): string | null {
  if (objectUrl.startsWith('s3://')) {
    const withoutScheme = objectUrl.slice('s3://'.length);
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash <= 0) {
      return null;
    }
    const parsedBucket = withoutScheme.slice(0, firstSlash);
    if (parsedBucket !== bucket) {
      return null;
    }
    return decodeURIComponent(withoutScheme.slice(firstSlash + 1));
  }

  let parsed: URL;
  try {
    parsed = new URL(objectUrl);
  } catch {
    return null;
  }

  const keyFromPath = parsed.pathname.replace(/^\/+/, '');
  if (!keyFromPath) {
    return null;
  }

  // Virtual-hosted-style URL: https://<bucket>.s3.<region>.amazonaws.com/<key>
  if (parsed.hostname === `${bucket}.s3.amazonaws.com` || parsed.hostname.startsWith(`${bucket}.s3.`)) {
    return decodeURIComponent(keyFromPath);
  }

  // Path-style URL: https://s3.<region>.amazonaws.com/<bucket>/<key>
  if (parsed.hostname === 's3.amazonaws.com' || parsed.hostname.startsWith('s3.')) {
    if (!keyFromPath.startsWith(`${bucket}/`)) {
      return null;
    }
    return decodeURIComponent(keyFromPath.slice(bucket.length + 1));
  }

  return null;
}
