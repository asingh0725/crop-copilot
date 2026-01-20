import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";

// Cloudflare R2 configuration
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
const PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
}

/**
 * Upload a file to Cloudflare R2
 *
 * @param buffer - File buffer to upload
 * @param key - Object key (path) in R2 bucket
 * @param contentType - MIME type of the file
 * @returns Upload result with key and URL
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<UploadResult> {
  if (!BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME environment variable is not set");
  }

  if (!process.env.R2_ACCOUNT_ID) {
    throw new Error("R2_ACCOUNT_ID environment variable is not set");
  }

  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables must be set"
    );
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await r2Client.send(command);

  // Construct public URL
  const url = PUBLIC_URL
    ? `${PUBLIC_URL}/${key}`
    : `https://${BUCKET_NAME}/${key}`;

  return {
    key,
    url,
    bucket: BUCKET_NAME,
  };
}

/**
 * Generate a deterministic key for an image in R2.
 * - Same URL → same key (idempotent)
 * - Safe for retries / reprocessing
 * - Avoids duplicate uploads & DB rows
 */
export function generateImageKey(
  originalUrl: string,
  prefix: string = "images"
): string {
  // Strip query params so cache-busting tokens don't change the key
  const cleanUrl = originalUrl.split("?")[0];

  // Extract extension (fallback to jpg)
  const filename = cleanUrl.split("/").pop() || "";
  const ext = filename.includes(".")
    ? filename.split(".").pop()
    : "jpg";

  // Stable, collision-resistant hash of the URL
  const hash = createHash("sha256")
    .update(cleanUrl)
    .digest("hex")
    .slice(0, 32); // short but safe

  return `${prefix}/${hash}.${ext}`;
}
