export interface SyncCursorPayload {
  createdAt: string;
  inputId: string;
}

export function encodeSyncCursor(payload: SyncCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeSyncCursor(cursor: string): SyncCursorPayload {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as SyncCursorPayload;

    if (!parsed.createdAt || !parsed.inputId) {
      throw new Error('Missing cursor fields');
    }

    return parsed;
  } catch (error) {
    throw new Error(`Invalid sync cursor: ${(error as Error).message}`);
  }
}
