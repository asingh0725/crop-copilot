import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGetFeedbackHandler } from './get-feedback';

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

test('get feedback handler returns 200 with feedback payload', async () => {
  const handler = buildGetFeedbackHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['feedback:read'],
    }),
    async (userId, recommendationId) => ({
      feedback: {
        id: 'feedback-id',
        recommendationId,
        userId,
        helpful: true,
        rating: 4,
        accuracy: 4,
        comments: 'Helpful baseline recommendation.',
        issues: [],
        detailedCompletedAt: null,
        outcomeApplied: true,
        outcomeSuccess: true,
        outcomeNotes: 'Applied after scouting two days later.',
        outcomeReported: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
  );

  const response = asHandlerResponse(
    await handler(
      {
        queryStringParameters: {
          recommendationId: 'deab17cf-f109-43f2-b95b-7d2f328a7720',
        },
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 200);
  const body = parseBody<{ feedback: { id: string; outcomeReported: boolean } }>(response.body);
  assert.equal(body.feedback.id, 'feedback-id');
  assert.equal(body.feedback.outcomeReported, true);
});

test('get feedback handler returns 400 when recommendationId is missing', async () => {
  const handler = buildGetFeedbackHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['feedback:read'],
    }),
    async () => {
      throw new Error('should not be called');
    }
  );

  const response = asHandlerResponse(
    await handler(
      {
        queryStringParameters: {},
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
