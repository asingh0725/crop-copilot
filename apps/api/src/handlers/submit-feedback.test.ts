import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmitFeedbackHandler } from './submit-feedback';

interface HandlerResponse {
  statusCode: number;
  body?: string;
}

function asHandlerResponse(response: unknown): HandlerResponse {
  assert.ok(response && typeof response === 'object', 'handler did not return an object');
  assert.ok('statusCode' in response, 'handler response is missing statusCode');
  return response as HandlerResponse;
}

function parseBody<T>(body: string | undefined): T {
  assert.ok(body, 'response body is missing');
  return JSON.parse(body) as T;
}

test('submit feedback handler returns 201 for valid payload', async () => {
  let captured: { userId: string; recommendationId: string } | null = null;
  const handler = buildSubmitFeedbackHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['feedback:write'],
    }),
    async (userId, payload) => {
      captured = {
        userId,
        recommendationId: payload.recommendationId,
      };

      return {
        success: true as const,
        feedback: {
          id: 'feedback-id',
          recommendationId: payload.recommendationId,
          userId,
          helpful: true,
          rating: 5,
          accuracy: 5,
          comments: null,
          issues: [],
          detailedCompletedAt: null,
          outcomeApplied: true,
          outcomeSuccess: true,
          outcomeNotes: null,
          outcomeReported: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    }
  );

  const response = asHandlerResponse(
    await handler(
      {
        body: JSON.stringify({
          recommendationId: 'deab17cf-f109-43f2-b95b-7d2f328a7720',
          helpful: true,
          rating: 5,
          accuracy: 5,
          outcomeSuccess: true,
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 201);
  const body = parseBody<{ success: boolean }>(response.body);
  assert.equal(body.success, true);
  // TypeScript narrows `captured` to null in static analysis (can't trace async closure
  // assignment), so cast back to the declared type before asserting.
  const cap = captured as { userId: string; recommendationId: string } | null;
  assert.ok(cap, 'captured should not be null after successful handler invocation');
  assert.equal(cap.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(cap.recommendationId, 'deab17cf-f109-43f2-b95b-7d2f328a7720');
});

test('submit feedback handler returns 400 for invalid payload', async () => {
  const handler = buildSubmitFeedbackHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['feedback:write'],
    }),
    async () => {
      throw new Error('should not be called');
    }
  );

  const response = asHandlerResponse(
    await handler(
      {
        body: JSON.stringify({
          helpful: true,
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 400);
  const body = parseBody<{ error: { code: string } }>(response.body);
  assert.equal(body.error.code, 'BAD_REQUEST');
});
