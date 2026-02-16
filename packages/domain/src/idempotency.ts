import { randomUUID, createHash } from 'node:crypto';

export function buildIdempotencyKey(deviceId: string, seed?: string): string {
  const trimmed = deviceId.trim();
  if (!trimmed) {
    throw new Error('deviceId is required for idempotency key generation');
  }

  const entropy = seed ?? randomUUID();
  const hash = createHash('sha256').update(`${trimmed}:${entropy}`).digest('hex');

  return `${trimmed}:${hash.slice(0, 20)}`;
}

export function normalizeIdempotencyKey(value: string): string {
  return value.trim().toLowerCase();
}
