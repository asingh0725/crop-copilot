import * as path from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config';
import type { DatabaseStack } from './database-stack';
import type { FoundationStack } from './foundation-stack';

export interface ApiRuntimeStackProps extends StackProps {
  config: EnvironmentConfig;
  foundation: FoundationStack;
  database?: DatabaseStack;
}

export class ApiRuntimeStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiRuntimeStackProps) {
    super(scope, id, props);

    const { config, foundation, database } = props;
    const environment = buildApiEnvironment(config, foundation, database);

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
    const getUploadViewUrlHandler = createApiFunction(this, {
      id: 'GetUploadViewUrlHandler',
      entry: 'handlers/get-upload-view-url.ts',
      environment,
    });
    const submitFeedbackHandler = createApiFunction(this, {
      id: 'SubmitFeedbackHandler',
      entry: 'handlers/submit-feedback.ts',
      environment,
    });
    const getFeedbackHandler = createApiFunction(this, {
      id: 'GetFeedbackHandler',
      entry: 'handlers/get-feedback.ts',
      environment,
    });
    const getSubscriptionHandler = createApiFunction(this, {
      id: 'GetSubscriptionHandler',
      entry: 'handlers/get-subscription.ts',
      environment,
    });
    const getUsageHandler = createApiFunction(this, {
      id: 'GetUsageHandler',
      entry: 'handlers/get-usage.ts',
      environment,
    });
    const createSubscriptionCheckoutHandler = createApiFunction(this, {
      id: 'CreateSubscriptionCheckoutHandler',
      entry: 'handlers/create-subscription-checkout.ts',
      environment,
    });
    const createCreditsCheckoutHandler = createApiFunction(this, {
      id: 'CreateCreditsCheckoutHandler',
      entry: 'handlers/create-credits-checkout.ts',
      environment,
    });
    const createSubscriptionPortalHandler = createApiFunction(this, {
      id: 'CreateSubscriptionPortalHandler',
      entry: 'handlers/create-subscription-portal.ts',
      environment,
    });
    const billingWebhookHandler = createApiFunction(this, {
      id: 'BillingWebhookHandler',
      entry: 'handlers/billing-webhook.ts',
      environment,
    });
    const profileHandler = createApiFunction(this, {
      id: 'ProfileHandler',
      entry: 'handlers/profile.ts',
      environment,
    });
    const listRecommendationsHandler = createApiFunction(this, {
      id: 'ListRecommendationsHandler',
      entry: 'handlers/list-recommendations.ts',
      environment,
    });
    const getRecommendationHandler = createApiFunction(this, {
      id: 'GetRecommendationHandler',
      entry: 'handlers/get-recommendation.ts',
      environment,
    });
    const getRecommendationPremiumHandler = createApiFunction(this, {
      id: 'GetRecommendationPremiumHandler',
      entry: 'handlers/get-recommendation-premium.ts',
      environment,
    });
    const refreshRecommendationPremiumHandler = createApiFunction(this, {
      id: 'RefreshRecommendationPremiumHandler',
      entry: 'handlers/refresh-recommendation-premium.ts',
      environment,
    });
    const createApplicationReportHandler = createApiFunction(this, {
      id: 'CreateApplicationReportHandler',
      entry: 'handlers/create-application-report.ts',
      environment,
    });
    const deleteRecommendationHandler = createApiFunction(this, {
      id: 'DeleteRecommendationHandler',
      entry: 'handlers/delete-recommendation.ts',
      environment,
    });
    const registerPushDeviceHandler = createApiFunction(this, {
      id: 'RegisterPushDeviceHandler',
      entry: 'handlers/register-push-device.ts',
      environment,
    });
    const listProductsHandler = createApiFunction(this, {
      id: 'ListProductsHandler',
      entry: 'handlers/list-products.ts',
      environment,
    });
    const getProductHandler = createApiFunction(this, {
      id: 'GetProductHandler',
      entry: 'handlers/get-product.ts',
      environment,
    });
    const compareProductsHandler = createApiFunction(this, {
      id: 'CompareProductsHandler',
      entry: 'handlers/compare-products.ts',
      environment,
    });
    const getProductPricingBatchHandler = createApiFunction(this, {
      id: 'GetProductPricingBatchHandler',
      entry: 'handlers/get-product-pricing-batch.ts',
      environment,
    });

    const syncPullHandler = createApiFunction(this, {
      id: 'SyncPullHandler',
      entry: 'handlers/sync-pull.ts',
      environment,
    });

    const trackEventHandler = createApiFunction(this, {
      id: 'TrackEventHandler',
      entry: 'handlers/track-event.ts',
      environment,
    });
    const adminSetSubscriptionHandler = createApiFunction(this, {
      id: 'AdminSetSubscriptionHandler',
      entry: 'handlers/admin-set-subscription.ts',
      environment,
    });
    const adminRunPipelineStepHandler = createApiFunction(this, {
      id: 'AdminRunPipelineStepHandler',
      entry: 'handlers/admin-run-pipeline-step.ts',
      environment,
      timeout: Duration.minutes(5),
      memorySize: 1024,
    });

    const processRecommendationJobWorker = createApiFunction(this, {
      id: 'ProcessRecommendationJobWorker',
      entry: 'workers/process-recommendation-job.ts',
      environment,
      memorySize: 1024,
      timeout: Duration.seconds(120),
    });
    const processPremiumEnrichmentWorker = createApiFunction(this, {
      id: 'ProcessPremiumEnrichmentWorker',
      entry: 'workers/process-premium-enrichment-job.ts',
      environment,
      memorySize: 768,
      timeout: Duration.seconds(180),
    });

    const processIngestionBatchWorker = createApiFunction(this, {
      id: 'ProcessIngestionBatchWorker',
      entry: 'workers/process-ingestion-batch.ts',
      environment,
      memorySize: 768,
      timeout: Duration.seconds(300),
    });

    // Orchestrates which sources are due and enqueues them for processing
    const runIngestionBatchWorker = createApiFunction(this, {
      id: 'RunIngestionBatchWorker',
      entry: 'workers/run-ingestion-batch.ts',
      environment,
      timeout: Duration.seconds(60),
    });

    // Nightly ML model retraining: exports training data to S3, submits SageMaker job
    const retrainTriggerWorker = createApiFunction(this, {
      id: 'RetrainTriggerWorker',
      entry: 'ml/training/retrain-trigger.ts',
      environment,
      memorySize: 512,
      timeout: Duration.minutes(10),
    });

    // Triggered by SageMaker training completion event — promotes new model to endpoint
    const endpointUpdaterWorker = createApiFunction(this, {
      id: 'EndpointUpdaterWorker',
      entry: 'ml/training/endpoint-updater.ts',
      environment,
      memorySize: 256,
      timeout: Duration.seconds(60),
    });

    // Runs every 30 minutes — discovers new agricultural URLs via Gemini search grounding
    const discoverSourcesWorker = createApiFunction(this, {
      id: 'DiscoverSourcesWorker',
      entry: 'workers/discover-sources.ts',
      environment,
      memorySize: 512,
      timeout: Duration.minutes(15), // monthly run must drain all 510 crop×region combinations
    });

    const discoverComplianceSourcesWorker = createApiFunction(this, {
      id: 'DiscoverComplianceSourcesWorker',
      entry: 'workers/discover-compliance-sources.ts',
      environment,
      memorySize: 768,
      timeout: Duration.minutes(15),
    });

    const runComplianceIngestionBatchWorker = createApiFunction(this, {
      id: 'RunComplianceIngestionBatchWorker',
      entry: 'workers/run-compliance-ingestion-batch.ts',
      environment,
      timeout: Duration.seconds(90),
    });

    const processComplianceIngestionBatchWorker = createApiFunction(this, {
      id: 'ProcessComplianceIngestionBatchWorker',
      entry: 'workers/process-compliance-ingestion-batch.ts',
      environment,
      memorySize: 1024,
      timeout: Duration.seconds(600),
    });

    foundation.recommendationQueue.grantSendMessages(createInputHandler);
    foundation.premiumEnrichmentQueue.grantSendMessages(processRecommendationJobWorker);
    foundation.premiumEnrichmentQueue.grantSendMessages(refreshRecommendationPremiumHandler);
    foundation.artifactsBucket.grantPut(createUploadUrlHandler);
    foundation.artifactsBucket.grantRead(getUploadViewUrlHandler);
    foundation.pushEventsTopic.grantPublish(processRecommendationJobWorker);
    foundation.pushEventsTopic.grantPublish(processPremiumEnrichmentWorker);

    // RunIngestionBatchWorker enqueues due sources for scraping
    foundation.ingestionQueue.grantSendMessages(runIngestionBatchWorker);

    // RetrainTriggerWorker reads/writes training data and model artifacts
    foundation.artifactsBucket.grantReadWrite(retrainTriggerWorker);
    retrainTriggerWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sagemaker:CreateTrainingJob', 'iam:PassRole'],
        resources: ['*'],
      }),
    );

    // EndpointUpdaterWorker creates SageMaker model/endpoint resources
    endpointUpdaterWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'sagemaker:DescribeTrainingJob',
          'sagemaker:CreateModel',
          'sagemaker:CreateEndpointConfig',
          'sagemaker:CreateEndpoint',
          'sagemaker:UpdateEndpoint',
          'sagemaker:DescribeEndpoint',
          'iam:PassRole',
        ],
        resources: ['*'],
      }),
    );

    // DiscoverSourcesWorker enqueues newly found sources for ingestion
    foundation.ingestionQueue.grantSendMessages(discoverSourcesWorker);

    // Compliance ingestion orchestration
    foundation.complianceIngestionQueue.grantSendMessages(runComplianceIngestionBatchWorker);

    // Ingestion orchestration: fires every hour to maximize LlamaParse free-tier throughput
    const runIngestionScheduleRule = new events.Rule(this, 'RunIngestionBatchScheduleRule', {
      ruleName: `${config.projectSlug}-${config.envName}-run-ingestion-schedule`,
      schedule: events.Schedule.rate(Duration.hours(1)),
      description: 'Triggers ingestion batch orchestration every hour.',
    });
    runIngestionScheduleRule.addTarget(new eventsTargets.LambdaFunction(runIngestionBatchWorker));

    // ML retraining: fires nightly at 02:00 UTC, exports CSV + submits SageMaker job
    const retrainScheduleRule = new events.Rule(this, 'RetrainTriggerScheduleRule', {
      ruleName: `${config.projectSlug}-${config.envName}-ml-retrain-schedule`,
      schedule: events.Schedule.cron({ minute: '0', hour: '2' }),
      description: 'Triggers LambdaRank model retraining check nightly at 02:00 UTC.',
    });
    retrainScheduleRule.addTarget(new eventsTargets.LambdaFunction(retrainTriggerWorker));

    // SageMaker training completion: automatically promotes new model to inference endpoint
    const sageMakerCompleteRule = new events.Rule(this, 'SageMakerTrainingCompleteRule', {
      ruleName: `${config.projectSlug}-${config.envName}-sagemaker-training-complete`,
      description: 'Triggers endpoint update when a CropCopilot SageMaker training job completes.',
      eventPattern: {
        source: ['aws.sagemaker'],
        detailType: ['SageMaker Training Job State Change'],
        detail: { TrainingJobStatus: ['Completed'] },
      },
    });
    sageMakerCompleteRule.addTarget(new eventsTargets.LambdaFunction(endpointUpdaterWorker));

    // Crop × region discovery: runs on the 1st of each month — agricultural sources change slowly
    const discoverScheduleRule = new events.Rule(this, 'DiscoverSourcesScheduleRule', {
      ruleName: `${config.projectSlug}-${config.envName}-discover-sources-schedule`,
      schedule: events.Schedule.cron({ minute: '0', hour: '0', day: '1', month: '*', year: '*' }),
      description: 'Triggers crop × region source discovery on the 1st of each month at 00:00 UTC.',
    });
    discoverScheduleRule.addTarget(new eventsTargets.LambdaFunction(discoverSourcesWorker));

    // Compliance source discovery: frequent refresh for faster regulatory coverage updates.
    const discoverComplianceScheduleRule = new events.Rule(
      this,
      'DiscoverComplianceSourcesScheduleRule',
      {
        ruleName: `${config.projectSlug}-${config.envName}-discover-compliance-sources-schedule`,
        schedule: events.Schedule.rate(Duration.minutes(15)),
        description: 'Triggers compliance source discovery every 15 minutes.',
      }
    );
    discoverComplianceScheduleRule.addTarget(
      new eventsTargets.LambdaFunction(discoverComplianceSourcesWorker)
    );

    // Compliance ingestion runner: frequent queueing of due compliance sources.
    const runComplianceIngestionScheduleRule = new events.Rule(
      this,
      'RunComplianceIngestionBatchScheduleRule',
      {
        ruleName: `${config.projectSlug}-${config.envName}-run-compliance-ingestion-schedule`,
        schedule: events.Schedule.rate(Duration.minutes(15)),
        description: 'Triggers compliance ingestion orchestration every 15 minutes.',
      }
    );
    runComplianceIngestionScheduleRule.addTarget(
      new eventsTargets.LambdaFunction(runComplianceIngestionBatchWorker, {
        event: events.RuleTargetInput.fromObject({
          trigger: 'scheduled',
          maxSources: Number(process.env.COMPLIANCE_INGESTION_MAX_SOURCES ?? 120),
        }),
      })
    );

    processRecommendationJobWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(foundation.recommendationQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      })
    );
    processPremiumEnrichmentWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(foundation.premiumEnrichmentQueue, {
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

    processComplianceIngestionBatchWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(foundation.complianceIngestionQueue, {
        batchSize: 3,
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
      path: '/api/v1/upload/view',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetUploadViewUrlIntegration',
        getUploadViewUrlHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/feedback',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'SubmitFeedbackIntegration',
        submitFeedbackHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/feedback',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetFeedbackIntegration',
        getFeedbackHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/subscription',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetSubscriptionIntegration',
        getSubscriptionHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/usage',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('GetUsageIntegration', getUsageHandler),
    });
    httpApi.addRoutes({
      path: '/api/v1/subscription/checkout',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'CreateSubscriptionCheckoutIntegration',
        createSubscriptionCheckoutHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/credits/checkout',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'CreateCreditsCheckoutIntegration',
        createCreditsCheckoutHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/subscription/portal',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'CreateSubscriptionPortalIntegration',
        createSubscriptionPortalHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/billing/webhook',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'BillingWebhookIntegration',
        billingWebhookHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/profile',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration('ProfileIntegration', profileHandler),
    });

    httpApi.addRoutes({
      path: '/api/v1/recommendations',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'ListRecommendationsIntegration',
        listRecommendationsHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/recommendations/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetRecommendationIntegration',
        getRecommendationHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/recommendations/{id}/premium',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetRecommendationPremiumIntegration',
        getRecommendationPremiumHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/recommendations/{id}/premium',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'RefreshRecommendationPremiumIntegration',
        refreshRecommendationPremiumHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/recommendations/{id}/report',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'CreateApplicationReportIntegration',
        createApplicationReportHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/recommendations/{id}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration(
        'DeleteRecommendationIntegration',
        deleteRecommendationHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/products',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'ListProductsIntegration',
        listProductsHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/products/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetProductIntegration',
        getProductHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/products/compare',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'CompareProductsIntegration',
        compareProductsHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/products/pricing/batch',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'GetProductPricingBatchIntegration',
        getProductPricingBatchHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/sync/pull',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('SyncPullIntegration', syncPullHandler),
    });

    httpApi.addRoutes({
      path: '/api/v1/events',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'TrackEventIntegration',
        trackEventHandler,
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/admin/subscription/override',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AdminSetSubscriptionIntegration',
        adminSetSubscriptionHandler
      ),
    });
    httpApi.addRoutes({
      path: '/api/v1/admin/pipeline/run',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AdminRunPipelineStepIntegration',
        adminRunPipelineStepHandler
      ),
    });

    httpApi.addRoutes({
      path: '/api/v1/push/register',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'RegisterPushDeviceIntegration',
        registerPushDeviceHandler
      ),
    });

    // Admin: discovery pipeline status dashboard
    const getDiscoveryStatusHandler = createApiFunction(this, {
      id: 'GetDiscoveryStatusHandler',
      entry: 'handlers/get-discovery-status.ts',
      environment,
    });

    httpApi.addRoutes({
      path: '/api/v1/admin/discovery/status',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'GetDiscoveryStatusIntegration',
        getDiscoveryStatusHandler,
      ),
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
  foundation: FoundationStack,
  database?: DatabaseStack
): Record<string, string> {
  const dataBackend = process.env.DATA_BACKEND ?? 'postgres';
  const databaseMode = process.env.API_DATABASE_MODE ?? 'external';
  const databaseUrl =
    databaseMode === 'aws' ? database?.runtimeDatabaseUrl : process.env.DATABASE_URL;
  if (dataBackend === 'postgres' && !databaseUrl) {
    throw new Error(
      'DATABASE_URL is required when DATA_BACKEND=postgres (or enable API_DATABASE_MODE=aws with PROVISION_AWS_DATABASE).'
    );
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
    SQS_PREMIUM_ENRICHMENT_QUEUE_URL: foundation.premiumEnrichmentQueue.queueUrl,
    SQS_INGESTION_QUEUE_URL: foundation.ingestionQueue.queueUrl,
    SQS_COMPLIANCE_INGESTION_QUEUE_URL: foundation.complianceIngestionQueue.queueUrl,
    SNS_PUSH_EVENTS_TOPIC_ARN: foundation.pushEventsTopic.topicArn,
    METRICS_NAMESPACE: config.metricsNamespace,
    RECOMMENDATION_COST_USD: process.env.RECOMMENDATION_COST_USD ?? '0.81',
    RECOMMENDATION_COST_BY_MODEL_JSON: process.env.RECOMMENDATION_COST_BY_MODEL_JSON ?? '{}',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL ?? '',
    RAG_RETRIEVAL_LIMIT: process.env.RAG_RETRIEVAL_LIMIT ?? '18',
    PG_POOL_MAX: process.env.PG_POOL_MAX ?? '6',
    // SageMaker reranker (leave empty to disable; reranker falls back to hybrid ranking)
    SAGEMAKER_ENDPOINT_NAME: process.env.SAGEMAKER_ENDPOINT_NAME ?? '',
    // ML retraining (leave empty to skip SageMaker job submission)
    S3_TRAINING_BUCKET: foundation.artifactsBucket.bucketName,
    SAGEMAKER_ROLE_ARN: process.env.SAGEMAKER_ROLE_ARN ?? '',
    SAGEMAKER_TRAINING_IMAGE: process.env.SAGEMAKER_TRAINING_IMAGE ?? '',
    SAGEMAKER_TRAINING_JOB_NAME: process.env.SAGEMAKER_TRAINING_JOB_NAME ?? 'cropcopilot-ltr',
    RETRAINING_MIN_FEEDBACK: process.env.RETRAINING_MIN_FEEDBACK ?? '50',
    // PDF parsing via LlamaParse (1000 free pages/day; leave empty to skip PDFs)
    LLAMA_CLOUD_API_KEY: process.env.LLAMA_CLOUD_API_KEY ?? '',
    // Gemini-powered source discovery
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY ?? '',
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY ?? '',
    OPENWEATHER_PRICE_PER_CALL_USD: process.env.OPENWEATHER_PRICE_PER_CALL_USD ?? '0.0015',
    OPENWEATHER_DAILY_FREE_CALLS: process.env.OPENWEATHER_DAILY_FREE_CALLS ?? '1000',
    OPENWEATHER_DAILY_HARD_CAP: process.env.OPENWEATHER_DAILY_HARD_CAP ?? '2000',
    ENABLE_PREMIUM_ENRICHMENT: process.env.ENABLE_PREMIUM_ENRICHMENT ?? 'true',
    ENABLE_USAGE_GUARD: process.env.ENABLE_USAGE_GUARD ?? 'true',
    APP_BASE_URL: process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    STRIPE_PRICE_GROWER_FREE: process.env.STRIPE_PRICE_GROWER_FREE ?? '',
    STRIPE_PRICE_GROWER: process.env.STRIPE_PRICE_GROWER ?? '',
    STRIPE_PRICE_GROWER_PRO: process.env.STRIPE_PRICE_GROWER_PRO ?? '',
    STRIPE_PRICE_CREDIT_PACK_10: process.env.STRIPE_PRICE_CREDIT_PACK_10 ?? '',
    STRIPE_AUTO_PROVISION_CATALOG: process.env.STRIPE_AUTO_PROVISION_CATALOG ?? 'true',
    STRIPE_CHECKOUT_URL_BASE: process.env.STRIPE_CHECKOUT_URL_BASE ?? '',
    STRIPE_PORTAL_URL_BASE: process.env.STRIPE_PORTAL_URL_BASE ?? '',
    BILLING_PORTAL_RETURN_URL: process.env.BILLING_PORTAL_RETURN_URL ?? '',
    BILLING_WEBHOOK_SECRET: process.env.BILLING_WEBHOOK_SECRET ?? '',
    ALLOW_BILLING_SIMULATION: process.env.ALLOW_BILLING_SIMULATION ?? 'true',
    DISCOVERY_BATCH_SIZE: process.env.DISCOVERY_BATCH_SIZE ?? '10',
    COMPLIANCE_DISCOVERY_BATCH_SIZE: process.env.COMPLIANCE_DISCOVERY_BATCH_SIZE ?? '25',
    COGNITO_REGION: cognitoRegion ?? '',
    COGNITO_USER_POOL_ID: cognitoUserPoolId ?? '',
    COGNITO_APP_CLIENT_ID: process.env.COGNITO_APP_CLIENT_ID ?? '',
    SUPABASE_URL: supabaseUrl ?? '',
    SUPABASE_ANON_KEY: supabaseAnonKey ?? '',
    ADMIN_USER_IDS: process.env.ADMIN_USER_IDS ?? '',
    ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? '',
  };

  return environment;
}
