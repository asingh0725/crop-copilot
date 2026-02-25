/**
 * Automatic SageMaker endpoint updater (EventBridge Lambda)
 *
 * Triggered by: SageMaker Training Job State Change events from EventBridge.
 * Fires whenever any SageMaker training job in the account completes; the
 * handler filters to only CropCopilot LTR jobs by job-name prefix.
 *
 * On a Completed job it:
 *   1. Describes the training job to get the S3 model artifact URI
 *   2. Creates a new SageMaker Model resource
 *   3. Creates a new EndpointConfig pointing at that model
 *   4. Updates (or creates) the inference endpoint with the new config
 *   5. Marks the MLModelVersion row as 'deployed'
 *
 * Environment variables:
 *   SAGEMAKER_ENDPOINT_NAME    — name of the inference endpoint to update/create
 *   SAGEMAKER_TRAINING_IMAGE   — container image for both training and inference
 *   SAGEMAKER_ROLE_ARN         — IAM role SageMaker assumes for the endpoint
 *   SAGEMAKER_TRAINING_JOB_NAME — base name prefix used to filter jobs (default: cropcopilot-ltr)
 *   DATABASE_URL               — Postgres connection string
 *   AWS_REGION                 — defaults to us-east-1
 */

import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../../lib/store';

interface SageMakerTrainingEvent {
  TrainingJobName: string;
  TrainingJobStatus: string;
  ModelArtifacts?: {
    S3ModelArtifacts: string;
  };
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 2,
      ssl: resolvePoolSslConfig(),
    });
  }
  return pool;
}

export const handler: EventBridgeHandler<
  'SageMaker Training Job State Change',
  SageMakerTrainingEvent,
  void
> = async (event) => {
  const jobName = event.detail?.TrainingJobName ?? '';
  const status = event.detail?.TrainingJobStatus ?? '';
  const jobPrefix = process.env.SAGEMAKER_TRAINING_JOB_NAME ?? 'cropcopilot-ltr';

  // Only act on our own jobs
  if (!jobName.startsWith(jobPrefix)) {
    console.log(`[EndpointUpdater] Ignoring unrelated job: ${jobName}`);
    return;
  }

  if (status !== 'Completed') {
    console.log(`[EndpointUpdater] Job ${jobName} status is ${status} — nothing to do`);
    return;
  }

  const endpointName = process.env.SAGEMAKER_ENDPOINT_NAME;
  const trainingImage = process.env.SAGEMAKER_TRAINING_IMAGE;
  const roleArn = process.env.SAGEMAKER_ROLE_ARN;
  const region = process.env.AWS_REGION ?? 'us-east-1';

  if (!endpointName || !trainingImage || !roleArn) {
    console.warn(
      '[EndpointUpdater] Missing SAGEMAKER_ENDPOINT_NAME / SAGEMAKER_TRAINING_IMAGE / SAGEMAKER_ROLE_ARN — skipping endpoint update',
    );
    return;
  }

  const {
    SageMakerClient,
    DescribeTrainingJobCommand,
    CreateModelCommand,
    CreateEndpointConfigCommand,
    CreateEndpointCommand,
    UpdateEndpointCommand,
    DescribeEndpointCommand,
  } = await import('@aws-sdk/client-sagemaker');

  const sm = new SageMakerClient({ region });

  // 1. Get the model artifact URI from the training job
  const describeResult = await sm.send(
    new DescribeTrainingJobCommand({ TrainingJobName: jobName }),
  );
  const modelArtifactUri = describeResult.ModelArtifacts?.S3ModelArtifacts;
  if (!modelArtifactUri) {
    throw new Error(`[EndpointUpdater] No model artifacts found for job ${jobName}`);
  }
  console.log(`[EndpointUpdater] Model artifact: ${modelArtifactUri}`);

  // 2. Create a new SageMaker Model
  const modelName = `${jobName}-model`;
  await sm.send(
    new CreateModelCommand({
      ModelName: modelName,
      ExecutionRoleArn: roleArn,
      PrimaryContainer: {
        Image: trainingImage,
        ModelDataUrl: modelArtifactUri,
        Environment: {
          SAGEMAKER_PROGRAM: 'inference.py',
          SAGEMAKER_SUBMIT_DIRECTORY: '/opt/ml/model/code',
        },
      },
      Tags: [
        { Key: 'Project', Value: 'CropCopilot' },
        { Key: 'TrainingJob', Value: jobName },
      ],
    }),
  );
  console.log(`[EndpointUpdater] Created model: ${modelName}`);

  // 3. Create a new EndpointConfig
  const configName = `${jobName}-config`;
  await sm.send(
    new CreateEndpointConfigCommand({
      EndpointConfigName: configName,
      ProductionVariants: [
        {
          VariantName: 'AllTraffic',
          ModelName: modelName,
          InstanceType: 'ml.t2.medium',
          InitialInstanceCount: 1,
          InitialVariantWeight: 1,
        },
      ],
      Tags: [{ Key: 'Project', Value: 'CropCopilot' }],
    }),
  );
  console.log(`[EndpointUpdater] Created endpoint config: ${configName}`);

  // 4. Update existing endpoint or create a new one
  let endpointExists = false;
  try {
    await sm.send(new DescribeEndpointCommand({ EndpointName: endpointName }));
    endpointExists = true;
  } catch {
    // DescribeEndpoint throws if endpoint doesn't exist — that's expected on first deploy
  }

  if (endpointExists) {
    await sm.send(
      new UpdateEndpointCommand({
        EndpointName: endpointName,
        EndpointConfigName: configName,
      }),
    );
    console.log(`[EndpointUpdater] Updating endpoint ${endpointName} with config ${configName}`);
  } else {
    await sm.send(
      new CreateEndpointCommand({
        EndpointName: endpointName,
        EndpointConfigName: configName,
        Tags: [{ Key: 'Project', Value: 'CropCopilot' }],
      }),
    );
    console.log(`[EndpointUpdater] Created new endpoint ${endpointName}`);
  }

  // 5. Mark the MLModelVersion row as deployed
  if (process.env.DATABASE_URL) {
    try {
      const db = getPool();
      await db.query(
        `UPDATE "MLModelVersion"
         SET status = 'deployed', "updatedAt" = NOW()
         WHERE "s3Uri" LIKE $1
           AND status = 'training'`,
        [`%${jobName}%`],
      );
      console.log(`[EndpointUpdater] MLModelVersion marked as deployed for job ${jobName}`);
    } catch (err) {
      // Non-fatal — endpoint is updated regardless
      console.warn('[EndpointUpdater] Failed to update MLModelVersion:', (err as Error).message);
    }
  }
};
