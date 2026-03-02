import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  PremiumEnrichmentRequestedSchema,
  type PremiumEnrichmentRequested,
} from '@crop-copilot/contracts';

export interface PremiumEnrichmentQueue {
  publishPremiumEnrichment(message: PremiumEnrichmentRequested): Promise<void>;
}

export class NoopPremiumEnrichmentQueue implements PremiumEnrichmentQueue {
  async publishPremiumEnrichment(_message: PremiumEnrichmentRequested): Promise<void> {
    // Intentionally no-op for local development and tests without SQS.
  }
}

export class SqsPremiumEnrichmentQueue implements PremiumEnrichmentQueue {
  constructor(
    private readonly queueUrl: string,
    private readonly client: SQSClient = new SQSClient({
      region: process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? 'ca-west-1',
    })
  ) {}

  async publishPremiumEnrichment(message: PremiumEnrichmentRequested): Promise<void> {
    const payload = PremiumEnrichmentRequestedSchema.parse(message);

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }
}

let sharedQueue: PremiumEnrichmentQueue | null = null;

export function getPremiumEnrichmentQueue(): PremiumEnrichmentQueue {
  if (!sharedQueue) {
    const queueUrl = process.env.SQS_PREMIUM_ENRICHMENT_QUEUE_URL;
    sharedQueue = queueUrl
      ? new SqsPremiumEnrichmentQueue(queueUrl)
      : new NoopPremiumEnrichmentQueue();
  }

  return sharedQueue;
}

export function setPremiumEnrichmentQueue(queue: PremiumEnrichmentQueue | null): void {
  sharedQueue = queue;
}
