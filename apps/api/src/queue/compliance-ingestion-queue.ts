import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  ComplianceIngestionBatchMessageSchema,
  type ComplianceIngestionBatchMessage,
} from '@crop-copilot/contracts';

export interface ComplianceIngestionQueue {
  publishComplianceIngestionBatch(message: ComplianceIngestionBatchMessage): Promise<void>;
}

export class NoopComplianceIngestionQueue implements ComplianceIngestionQueue {
  async publishComplianceIngestionBatch(
    _message: ComplianceIngestionBatchMessage
  ): Promise<void> {
    // Intentionally no-op for local development and tests without SQS.
  }
}

export class SqsComplianceIngestionQueue implements ComplianceIngestionQueue {
  constructor(
    private readonly queueUrl: string,
    private readonly client: SQSClient = new SQSClient({
      region: process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? 'ca-west-1',
    })
  ) {}

  async publishComplianceIngestionBatch(
    message: ComplianceIngestionBatchMessage
  ): Promise<void> {
    const payload = ComplianceIngestionBatchMessageSchema.parse(message);

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }
}

let sharedQueue: ComplianceIngestionQueue | null = null;

export function getComplianceIngestionQueue(): ComplianceIngestionQueue {
  if (!sharedQueue) {
    const queueUrl = process.env.SQS_COMPLIANCE_INGESTION_QUEUE_URL;
    sharedQueue = queueUrl
      ? new SqsComplianceIngestionQueue(queueUrl)
      : new NoopComplianceIngestionQueue();
  }

  return sharedQueue;
}

export function setComplianceIngestionQueue(queue: ComplianceIngestionQueue | null): void {
  sharedQueue = queue;
}
