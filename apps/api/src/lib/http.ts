import type { APIGatewayProxyResultV2 } from 'aws-lambda';

export interface JsonResponseInit {
  statusCode: number;
  headers?: Record<string, string>;
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export function isBadRequestError(error: unknown): error is BadRequestError {
  return error instanceof BadRequestError;
}

export function jsonResponse<T>(
  payload: T,
  init: JsonResponseInit
): APIGatewayProxyResultV2 {
  return {
    statusCode: init.statusCode,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    body: JSON.stringify(payload),
  };
}

export function parseJsonBody<T>(body: string | undefined | null): T {
  if (!body) {
    throw new BadRequestError('Request body is required');
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
}
