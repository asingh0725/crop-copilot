import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  ModelTrainingTriggerRequestedSchema,
  type ModelTrainingTriggerRequested,
} from '@crop-copilot/contracts';

export interface ModelTrainingTriggerQueue {
  publishTrainingTrigger(message: ModelTrainingTriggerRequested): Promise<void>;
}

export class NoopModelTrainingTriggerQueue implements ModelTrainingTriggerQueue {
  async publishTrainingTrigger(_message: ModelTrainingTriggerRequested): Promise<void> {
    // Intentionally no-op for local development without configured SQS.
  }
}

export class SqsModelTrainingTriggerQueue implements ModelTrainingTriggerQueue {
  constructor(
    private readonly queueUrl: string,
    private readonly client: SQSClient = new SQSClient({
      region: process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? 'ca-west-1',
    })
  ) {}

  async publishTrainingTrigger(message: ModelTrainingTriggerRequested): Promise<void> {
    const payload = ModelTrainingTriggerRequestedSchema.parse(message);
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }
}

let sharedQueue: ModelTrainingTriggerQueue | null = null;

export function getModelTrainingTriggerQueue(): ModelTrainingTriggerQueue {
  if (!sharedQueue) {
    const queueUrl = process.env.SQS_MODEL_TRAINING_TRIGGER_QUEUE_URL;
    sharedQueue = queueUrl
      ? new SqsModelTrainingTriggerQueue(queueUrl)
      : new NoopModelTrainingTriggerQueue();
  }
  return sharedQueue;
}

export function setModelTrainingTriggerQueue(queue: ModelTrainingTriggerQueue | null): void {
  sharedQueue = queue;
}
