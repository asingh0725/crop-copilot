import test from 'node:test';
import assert from 'node:assert/strict';
import { NoopPushEventPublisher, SnsPushEventPublisher } from './push-events';

test('NoopPushEventPublisher accepts recommendation-ready events', async () => {
  const publisher = new NoopPushEventPublisher();

  await publisher.publishRecommendationReady({
    eventType: 'recommendation.ready',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    inputId: 'd3d62e25-5a03-4691-aa42-6de8ce6f0b5b',
    jobId: 'f412cbaf-2f60-414b-9804-715f5c3b89ef',
    recommendationId: '8b679b28-877f-48db-b3c6-b4e50273ef79',
  });

  await publisher.publishRecommendationPremiumReady({
    eventType: 'recommendation.premium_ready',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    recommendationId: '8b679b28-877f-48db-b3c6-b4e50273ef79',
    status: 'ready',
    riskReview: 'needs_manual_verification',
  });

  await publisher.publishSubscriptionUpdated({
    eventType: 'subscription.updated',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    status: 'active',
    tier: 'grower',
    periodStart: '2026-02-01T00:00:00.000Z',
    periodEnd: '2026-03-01T00:00:00.000Z',
  });

  await publisher.publishCreditsUpdated({
    eventType: 'credits.updated',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    deltaUsd: 12,
    reason: 'credit_pack_purchase',
    balanceUsd: 13.2,
  });
});

test('SnsPushEventPublisher publishes recommendation-ready payload', async () => {
  const sent: Array<Record<string, unknown>> = [];
  const publisher = new SnsPushEventPublisher('arn:aws:sns:ca-west-1:123456789012:push-events', {
    send: async (command: { input: Record<string, unknown> }) => {
      sent.push(command.input);
      return { MessageId: 'msg-1' };
    },
  } as any);

  await publisher.publishRecommendationReady({
    eventType: 'recommendation.ready',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    inputId: 'd3d62e25-5a03-4691-aa42-6de8ce6f0b5b',
    jobId: 'f412cbaf-2f60-414b-9804-715f5c3b89ef',
    recommendationId: '8b679b28-877f-48db-b3c6-b4e50273ef79',
  });

  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].TopicArn,
    'arn:aws:sns:ca-west-1:123456789012:push-events'
  );
  assert.equal(sent[0].Subject, 'recommendation.ready');
});

test('SnsPushEventPublisher publishes recommendation-premium-ready payload', async () => {
  const sent: Array<Record<string, unknown>> = [];
  const publisher = new SnsPushEventPublisher('arn:aws:sns:ca-west-1:123456789012:push-events', {
    send: async (command: { input: Record<string, unknown> }) => {
      sent.push(command.input);
      return { MessageId: 'msg-1' };
    },
  } as any);

  await publisher.publishRecommendationPremiumReady({
    eventType: 'recommendation.premium_ready',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    recommendationId: '8b679b28-877f-48db-b3c6-b4e50273ef79',
    status: 'ready',
    riskReview: 'needs_manual_verification',
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].Subject, 'recommendation.premium_ready');
});

test('SnsPushEventPublisher publishes subscription-updated payload', async () => {
  const sent: Array<Record<string, unknown>> = [];
  const publisher = new SnsPushEventPublisher('arn:aws:sns:ca-west-1:123456789012:push-events', {
    send: async (command: { input: Record<string, unknown> }) => {
      sent.push(command.input);
      return { MessageId: 'msg-1' };
    },
  } as any);

  await publisher.publishSubscriptionUpdated({
    eventType: 'subscription.updated',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    status: 'active',
    tier: 'grower',
    periodStart: '2026-02-01T00:00:00.000Z',
    periodEnd: '2026-03-01T00:00:00.000Z',
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].Subject, 'subscription.updated');
});

test('SnsPushEventPublisher publishes credits-updated payload', async () => {
  const sent: Array<Record<string, unknown>> = [];
  const publisher = new SnsPushEventPublisher('arn:aws:sns:ca-west-1:123456789012:push-events', {
    send: async (command: { input: Record<string, unknown> }) => {
      sent.push(command.input);
      return { MessageId: 'msg-1' };
    },
  } as any);

  await publisher.publishCreditsUpdated({
    eventType: 'credits.updated',
    eventVersion: '1',
    occurredAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    deltaUsd: -1.2,
    reason: 'recommendation_overage',
    balanceUsd: 6.8,
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].Subject, 'credits.updated');
});
