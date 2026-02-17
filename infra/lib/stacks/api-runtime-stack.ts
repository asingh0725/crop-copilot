import * as path from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config';
import type { FoundationStack } from './foundation-stack';

export interface ApiRuntimeStackProps extends StackProps {
  config: EnvironmentConfig;
  foundation: FoundationStack;
}

export class ApiRuntimeStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiRuntimeStackProps) {
    super(scope, id, props);

    const { config, foundation } = props;
    const environment = buildApiEnvironment(config, foundation);

    const httpApi = new apigwv2.HttpApi(this, 'ApiGateway', {
      apiName: `${config.projectSlug}-${config.envName}-api`,
      corsPreflight: {
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['authorization', 'content-type', 'x-request-id', 'x-correlation-id'],
        allowOrigins: ['*'],
      },
    });

    const healthHandler = createApiFunction(this, {
      id: 'HealthHandler',
      entry: 'handlers/health.ts',
      environment,
    });

    const createInputHandler = createApiFunction(this, {
      id: 'CreateInputHandler',
      entry: 'handlers/create-input.ts',
      environment,
    });

    const getJobStatusHandler = createApiFunction(this, {
      id: 'GetJobStatusHandler',
      entry: 'handlers/get-job-status.ts',
      environment,
    });

    const createUploadUrlHandler = createApiFunction(this, {
      id: 'CreateUploadUrlHandler',
      entry: 'handlers/create-upload-url.ts',
      environment,
    });

    const syncPullHandler = createApiFunction(this, {
      id: 'SyncPullHandler',
      entry: 'handlers/sync-pull.ts',
      environment,
    });

    const processRecommendationJobWorker = createApiFunction(this, {
      id: 'ProcessRecommendationJobWorker',
      entry: 'workers/process-recommendation-job.ts',
      environment,
      memorySize: 1024,
      timeout: Duration.seconds(120),
    });

    const processIngestionBatchWorker = createApiFunction(this, {
      id: 'ProcessIngestionBatchWorker',
      entry: 'workers/process-ingestion-batch.ts',
      environment,
      memorySize: 768,
      timeout: Duration.seconds(120),
    });

    foundation.recommendationQueue.grantSendMessages(createInputHandler);
    foundation.artifactsBucket.grantPut(createUploadUrlHandler);
    foundation.pushEventsTopic.grantPublish(processRecommendationJobWorker);

    processRecommendationJobWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(foundation.recommendationQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      })
    );

    processIngestionBatchWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(foundation.ingestionQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      })
    );

    httpApi.addRoutes({
      path: '/api/v1/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('HealthIntegration', healthHandler),
    });

    httpApi.addRoutes({
      path: '/api/v1/inputs',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'CreateInputIntegration',
        createInputHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/jobs/{jobId}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetJobStatusIntegration',
        getJobStatusHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/upload',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'CreateUploadUrlIntegration',
        createUploadUrlHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/sync/pull',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('SyncPullIntegration', syncPullHandler),
    });

    const runtimeUrlParameterName = `/${config.projectSlug}/${config.envName}/platform/api/runtime-url`;
    new ssm.StringParameter(this, 'ParameterRuntimeApiBaseUrl', {
      parameterName: runtimeUrlParameterName,
      stringValue: httpApi.apiEndpoint,
      description: 'AWS API runtime base URL for cutover validation and mobile clients.',
    });

    new CfnOutput(this, 'ApiBaseUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API base URL for Crop Copilot AWS runtime.',
    });

    new CfnOutput(this, 'RuntimeApiBaseUrlParameter', {
      value: runtimeUrlParameterName,
      description: 'SSM parameter storing AWS runtime API base URL.',
    });
  }
}

interface ApiFunctionProps {
  id: string;
  entry: string;
  environment: Record<string, string>;
  timeout?: Duration;
  memorySize?: number;
}

function createApiFunction(scope: Construct, props: ApiFunctionProps): lambdaNodejs.NodejsFunction {
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

  return new lambdaNodejs.NodejsFunction(scope, props.id, {
    runtime: lambda.Runtime.NODEJS_22_X,
    architecture: lambda.Architecture.ARM_64,
    entry: path.join(workspaceRoot, 'apps', 'api', 'src', props.entry),
    handler: 'handler',
    timeout: props.timeout ?? Duration.seconds(30),
    memorySize: props.memorySize ?? 512,
    environment: props.environment,
    depsLockFilePath: path.join(workspaceRoot, 'pnpm-lock.yaml'),
    projectRoot: workspaceRoot,
    bundling: {
      target: 'node22',
      sourceMap: true,
      minify: true,
      tsconfig: path.join(workspaceRoot, 'apps', 'api', 'tsconfig.json'),
    },
  });
}

function buildApiEnvironment(
  config: EnvironmentConfig,
  foundation: FoundationStack
): Record<string, string> {
  const dataBackend = process.env.DATA_BACKEND ?? 'postgres';
  const databaseUrl = process.env.DATABASE_URL;
  if (dataBackend === 'postgres' && !databaseUrl) {
    throw new Error('DATABASE_URL is required when DATA_BACKEND=postgres.');
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const cognitoRegion = process.env.COGNITO_REGION;
  const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;
  const hasCognitoVerifier = Boolean(cognitoRegion && cognitoUserPoolId);
  const hasSupabaseVerifier = Boolean(supabaseUrl && supabaseAnonKey);

  if (!hasCognitoVerifier && !hasSupabaseVerifier) {
    throw new Error(
      'Authentication is not configured. Provide Cognito settings or SUPABASE_URL + SUPABASE_ANON_KEY.'
    );
  }

  const environment: Record<string, string> = {
    CROP_ENV: config.envName,
    DATA_BACKEND: dataBackend,
    DATABASE_URL: databaseUrl ?? '',
    S3_UPLOAD_BUCKET: foundation.artifactsBucket.bucketName,
    SQS_RECOMMENDATION_QUEUE_URL: foundation.recommendationQueue.queueUrl,
    SQS_INGESTION_QUEUE_URL: foundation.ingestionQueue.queueUrl,
    SNS_PUSH_EVENTS_TOPIC_ARN: foundation.pushEventsTopic.topicArn,
    METRICS_NAMESPACE: config.metricsNamespace,
    RECOMMENDATION_COST_USD: process.env.RECOMMENDATION_COST_USD ?? '0.81',
    RECOMMENDATION_COST_BY_MODEL_JSON: process.env.RECOMMENDATION_COST_BY_MODEL_JSON ?? '{}',
    COGNITO_REGION: cognitoRegion ?? '',
    COGNITO_USER_POOL_ID: cognitoUserPoolId ?? '',
    COGNITO_APP_CLIENT_ID: process.env.COGNITO_APP_CLIENT_ID ?? '',
    SUPABASE_URL: supabaseUrl ?? '',
    SUPABASE_ANON_KEY: supabaseAnonKey ?? '',
  };

  return environment;
}
