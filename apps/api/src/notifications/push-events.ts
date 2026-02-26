import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  CreditsUpdatedEventSchema,
  RecommendationPremiumReadyEventSchema,
  RecommendationReadyEventSchema,
  SubscriptionUpdatedEventSchema,
  type CreditsUpdatedEvent,
  type RecommendationPremiumReadyEvent,
  type RecommendationReadyEvent,
  type SubscriptionUpdatedEvent,
} from '@crop-copilot/contracts';

export interface PushEventPublisher {
  publishRecommendationReady(event: RecommendationReadyEvent): Promise<void>;
  publishRecommendationPremiumReady(event: RecommendationPremiumReadyEvent): Promise<void>;
  publishSubscriptionUpdated(event: SubscriptionUpdatedEvent): Promise<void>;
  publishCreditsUpdated(event: CreditsUpdatedEvent): Promise<void>;
}

export class NoopPushEventPublisher implements PushEventPublisher {
  async publishRecommendationReady(_event: RecommendationReadyEvent): Promise<void> {
    // Intentionally empty in local/dev mode.
  }

  async publishRecommendationPremiumReady(
    _event: RecommendationPremiumReadyEvent
  ): Promise<void> {
    // Intentionally empty in local/dev mode.
  }

  async publishSubscriptionUpdated(_event: SubscriptionUpdatedEvent): Promise<void> {
    // Intentionally empty in local/dev mode.
  }

  async publishCreditsUpdated(_event: CreditsUpdatedEvent): Promise<void> {
    // Intentionally empty in local/dev mode.
  }
}

export class SnsPushEventPublisher implements PushEventPublisher {
  constructor(
    private readonly topicArn: string,
    private readonly client: SNSClient = new SNSClient({
      region: process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? 'ca-west-1',
    })
  ) {}

  async publishRecommendationReady(event: RecommendationReadyEvent): Promise<void> {
    const payload = RecommendationReadyEventSchema.parse(event);

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: 'recommendation.ready',
        Message: JSON.stringify(payload),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: payload.eventType,
          },
          userId: {
            DataType: 'String',
            StringValue: payload.userId,
          },
        },
      })
    );
  }

  async publishRecommendationPremiumReady(
    event: RecommendationPremiumReadyEvent
  ): Promise<void> {
    const payload = RecommendationPremiumReadyEventSchema.parse(event);

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: 'recommendation.premium_ready',
        Message: JSON.stringify(payload),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: payload.eventType,
          },
          userId: {
            DataType: 'String',
            StringValue: payload.userId,
          },
        },
      })
    );
  }

  async publishSubscriptionUpdated(event: SubscriptionUpdatedEvent): Promise<void> {
    const payload = SubscriptionUpdatedEventSchema.parse(event);

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: 'subscription.updated',
        Message: JSON.stringify(payload),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: payload.eventType,
          },
          userId: {
            DataType: 'String',
            StringValue: payload.userId,
          },
        },
      })
    );
  }

  async publishCreditsUpdated(event: CreditsUpdatedEvent): Promise<void> {
    const payload = CreditsUpdatedEventSchema.parse(event);

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: 'credits.updated',
        Message: JSON.stringify(payload),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: payload.eventType,
          },
          userId: {
            DataType: 'String',
            StringValue: payload.userId,
          },
        },
      })
    );
  }
}

let singletonPublisher: PushEventPublisher | null = null;

export function getPushEventPublisher(): PushEventPublisher {
  if (!singletonPublisher) {
    const topicArn = process.env.SNS_PUSH_EVENTS_TOPIC_ARN;
    singletonPublisher = topicArn
      ? new SnsPushEventPublisher(topicArn)
      : new NoopPushEventPublisher();
  }

  return singletonPublisher;
}

export function setPushEventPublisher(publisher: PushEventPublisher | null): void {
  singletonPublisher = publisher;
}
