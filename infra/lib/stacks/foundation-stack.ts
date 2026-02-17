import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config';

export interface FoundationStackProps extends StackProps {
  config: EnvironmentConfig;
}

export class FoundationStack extends Stack {
  readonly artifactsBucket: s3.IBucket;
  readonly recommendationQueue: sqs.IQueue;
  readonly ingestionQueue: sqs.IQueue;
  readonly pushEventsTopic: sns.ITopic;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const { config } = props;

    for (const [key, value] of Object.entries(config.tags)) {
      Tags.of(this).add(key, value);
    }

    const shouldRetainData = config.envName === 'prod';

    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: shouldRetainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !shouldRetainData,
    });
    this.artifactsBucket = artifactsBucket;

    const billingAlertsTopic = new sns.Topic(this, 'BillingAlertsTopic', {
      displayName: `Crop Copilot ${config.envName} billing alerts`,
      topicName: `${config.projectSlug}-${config.envName}-billing-alerts`,
    });

    billingAlertsTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowBudgetsToPublish',
        actions: ['sns:Publish'],
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        resources: [billingAlertsTopic.topicArn],
      })
    );

    if (config.costAlertEmail) {
      billingAlertsTopic.addSubscription(
        new subscriptions.EmailSubscription(config.costAlertEmail)
      );
    }

    // AWS Budgets CloudFormation is only available in selected regions.
    if (config.region === 'us-east-1') {
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: `${config.projectSlug}-${config.envName}-monthly`,
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: {
            amount: config.monthlyBudgetUsd,
            unit: 'USD',
          },
        },
        notificationsWithSubscribers: [50, 80, 100].map((threshold) => ({
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: billingAlertsTopic.topicArn,
            },
            ...(config.costAlertEmail
              ? [
                  {
                    subscriptionType: 'EMAIL',
                    address: config.costAlertEmail,
                  },
                ]
              : []),
          ],
        })),
      });
    }

    const parameterPrefix = `/${config.projectSlug}/${config.envName}`;

    const recommendationDlq = new sqs.Queue(this, 'RecommendationJobDlq', {
      queueName: `${config.projectSlug}-${config.envName}-recommendation-dlq`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    });

    const recommendationQueue = new sqs.Queue(this, 'RecommendationJobQueue', {
      queueName: `${config.projectSlug}-${config.envName}-recommendation-jobs`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(120),
      deadLetterQueue: {
        queue: recommendationDlq,
        maxReceiveCount: 5,
      },
    });
    this.recommendationQueue = recommendationQueue;

    const mobilePushEventsTopic = new sns.Topic(this, 'MobilePushEventsTopic', {
      displayName: `Crop Copilot ${config.envName} mobile push events`,
      topicName: `${config.projectSlug}-${config.envName}-mobile-push-events`,
    });
    this.pushEventsTopic = mobilePushEventsTopic;

    const ingestionDlq = new sqs.Queue(this, 'IngestionDlq', {
      queueName: `${config.projectSlug}-${config.envName}-ingestion-dlq`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    });

    const ingestionQueue = new sqs.Queue(this, 'IngestionQueue', {
      queueName: `${config.projectSlug}-${config.envName}-ingestion-batches`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(300),
      deadLetterQueue: {
        queue: ingestionDlq,
        maxReceiveCount: 5,
      },
    });
    this.ingestionQueue = ingestionQueue;

    const recommendationLatencyMetric = new cloudwatch.Metric({
      namespace: config.metricsNamespace,
      metricName: 'RecommendationDurationMs',
      statistic: 'Average',
      period: Duration.minutes(5),
      dimensionsMap: {
        Service: 'api',
        Environment: config.envName,
        Pipeline: 'recommendation',
        Status: 'completed',
      },
    });

    const recommendationCostMetric = new cloudwatch.Metric({
      namespace: config.metricsNamespace,
      metricName: 'RecommendationEstimatedCostUsd',
      statistic: 'Average',
      period: Duration.minutes(5),
      dimensionsMap: {
        Service: 'api',
        Environment: config.envName,
        Pipeline: 'recommendation',
        Status: 'completed',
      },
    });

    const recommendationFailureMetric = new cloudwatch.Metric({
      namespace: config.metricsNamespace,
      metricName: 'RecommendationFailedCount',
      statistic: 'Sum',
      period: Duration.minutes(5),
      dimensionsMap: {
        Service: 'api',
        Environment: config.envName,
        Pipeline: 'recommendation',
        Status: 'failed',
      },
    });

    const queueBacklogAlarm = new cloudwatch.Alarm(this, 'RecommendationQueueBacklogAlarm', {
      alarmName: `${config.projectSlug}-${config.envName}-recommendation-queue-backlog`,
      alarmDescription: 'Recommendation queue backlog exceeded expected threshold.',
      metric: recommendationQueue.metricApproximateNumberOfMessagesVisible({
        statistic: 'Average',
        period: Duration.minutes(5),
      }),
      threshold: 25,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const recommendationDlqAlarm = new cloudwatch.Alarm(this, 'RecommendationDlqAlarm', {
      alarmName: `${config.projectSlug}-${config.envName}-recommendation-dlq-depth`,
      alarmDescription: 'Recommendation DLQ has pending messages.',
      metric: recommendationDlq.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const recommendationFailureAlarm = new cloudwatch.Alarm(
      this,
      'RecommendationFailureRateAlarm',
      {
        alarmName: `${config.projectSlug}-${config.envName}-recommendation-failures`,
        alarmDescription: 'Recommendation pipeline reported failed runs.',
        metric: recommendationFailureMetric,
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    const recommendationCostAlarm = new cloudwatch.Alarm(this, 'RecommendationCostAlarm', {
      alarmName: `${config.projectSlug}-${config.envName}-recommendation-cost`,
      alarmDescription: 'Average recommendation cost exceeded configured target.',
      metric: recommendationCostMetric,
      threshold: config.maxRecommendationCostUsd,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const opsDashboard = new cloudwatch.Dashboard(this, 'OpsDashboard', {
      dashboardName: `${config.projectSlug}-${config.envName}-ops`,
    });

    opsDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Queue backlog',
        left: [
          recommendationQueue.metricApproximateNumberOfMessagesVisible({
            statistic: 'Average',
            period: Duration.minutes(5),
          }),
          ingestionQueue.metricApproximateNumberOfMessagesVisible({
            statistic: 'Average',
            period: Duration.minutes(5),
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Dead-letter queues',
        left: [
          recommendationDlq.metricApproximateNumberOfMessagesVisible({
            statistic: 'Maximum',
            period: Duration.minutes(5),
          }),
          ingestionDlq.metricApproximateNumberOfMessagesVisible({
            statistic: 'Maximum',
            period: Duration.minutes(5),
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Recommendation performance and cost',
        left: [recommendationLatencyMetric, recommendationCostMetric],
        right: [recommendationFailureMetric],
      })
    );

    for (const alarm of [
      queueBacklogAlarm,
      recommendationDlqAlarm,
      recommendationFailureAlarm,
      recommendationCostAlarm,
    ]) {
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(billingAlertsTopic));
    }

    const pipelineDefinition = new sfn.Pass(this, 'RetrievingContext')
      .next(new sfn.Pass(this, 'GeneratingRecommendation'))
      .next(new sfn.Pass(this, 'ValidatingOutput'))
      .next(new sfn.Pass(this, 'PersistingResult'))
      .next(new sfn.Succeed(this, 'RecommendationCompleted'));

    const recommendationPipelineStateMachine = new sfn.StateMachine(
      this,
      'RecommendationPipelineStateMachine',
      {
        stateMachineName: `${config.projectSlug}-${config.envName}-recommendation-pipeline`,
        definitionBody: sfn.DefinitionBody.fromChainable(pipelineDefinition),
      }
    );

    const ingestionPipelineDefinition = new sfn.Pass(this, 'DiscoverSources')
      .next(new sfn.Pass(this, 'ScrapeSources'))
      .next(new sfn.Pass(this, 'ParseAndChunk'))
      .next(new sfn.Pass(this, 'EmbedAndUpsert'))
      .next(new sfn.Succeed(this, 'IngestionCompleted'));

    const ingestionPipelineStateMachine = new sfn.StateMachine(
      this,
      'IngestionPipelineStateMachine',
      {
        stateMachineName: `${config.projectSlug}-${config.envName}-ingestion-pipeline`,
        definitionBody: sfn.DefinitionBody.fromChainable(ingestionPipelineDefinition),
      }
    );

    const ingestionScheduleRule = new events.Rule(this, 'IngestionScheduleRule', {
      ruleName: `${config.projectSlug}-${config.envName}-ingestion-schedule`,
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '6',
      }),
      description: 'Triggers ingestion orchestration every day at 06:00 UTC.',
    });

    ingestionScheduleRule.addTarget(
      new targets.SfnStateMachine(ingestionPipelineStateMachine, {
        input: events.RuleTargetInput.fromObject({
          trigger: 'scheduled',
          source: 'eventbridge',
        }),
      })
    );

    new ssm.StringParameter(this, 'ParameterApiBaseUrl', {
      parameterName: `${parameterPrefix}/platform/api/base-url`,
      stringValue: 'https://api.example.com',
      description: 'Base URL consumed by web and iOS clients.',
    });

    new ssm.StringParameter(this, 'ParameterWebBaseUrl', {
      parameterName: `${parameterPrefix}/platform/web/base-url`,
      stringValue: 'https://app.example.com',
      description: 'Public web application URL.',
    });

    new ssm.StringParameter(this, 'ParameterBedrockModelId', {
      parameterName: `${parameterPrefix}/ai/bedrock/model-id`,
      stringValue: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      description: 'Primary Bedrock generation model identifier.',
    });

    new ssm.StringParameter(this, 'ParameterRecommendationQueueUrl', {
      parameterName: `${parameterPrefix}/pipeline/recommendation-queue-url`,
      stringValue: recommendationQueue.queueUrl,
      description: 'SQS queue URL for recommendation job requests.',
    });

    new ssm.StringParameter(this, 'ParameterRecommendationStateMachineArn', {
      parameterName: `${parameterPrefix}/pipeline/recommendation-state-machine-arn`,
      stringValue: recommendationPipelineStateMachine.stateMachineArn,
      description: 'Step Functions ARN for recommendation pipeline orchestration.',
    });

    new ssm.StringParameter(this, 'ParameterPushEventsTopicArn', {
      parameterName: `${parameterPrefix}/notifications/push-events-topic-arn`,
      stringValue: mobilePushEventsTopic.topicArn,
      description: 'SNS topic ARN for recommendation-ready push event fanout.',
    });

    new ssm.StringParameter(this, 'ParameterOpsDashboardName', {
      parameterName: `${parameterPrefix}/ops/dashboard/name`,
      stringValue: opsDashboard.dashboardName,
      description: 'CloudWatch dashboard for queue, pipeline, and FinOps metrics.',
    });

    new ssm.StringParameter(this, 'ParameterIngestionQueueUrl', {
      parameterName: `${parameterPrefix}/pipeline/ingestion-queue-url`,
      stringValue: ingestionQueue.queueUrl,
      description: 'SQS queue URL for ingestion batch requests.',
    });

    new ssm.StringParameter(this, 'ParameterIngestionStateMachineArn', {
      parameterName: `${parameterPrefix}/pipeline/ingestion-state-machine-arn`,
      stringValue: ingestionPipelineStateMachine.stateMachineArn,
      description: 'Step Functions ARN for ingestion pipeline orchestration.',
    });

    if (config.costAlertEmail) {
      new ssm.StringParameter(this, 'ParameterCostAlertEmail', {
        parameterName: `${parameterPrefix}/ops/cost-alert-email`,
        stringValue: config.costAlertEmail,
        description: 'Billing alert destination email.',
      });
    }

    new CfnOutput(this, 'ArtifactsBucketName', {
      value: artifactsBucket.bucketName,
      description: 'S3 bucket for shared artifacts and uploads.',
    });

    new CfnOutput(this, 'BillingAlertsTopicArn', {
      value: billingAlertsTopic.topicArn,
      description: 'SNS topic ARN for billing alarms and budget alerts.',
    });

    new CfnOutput(this, 'SsmParameterPrefix', {
      value: parameterPrefix,
      description: 'Prefix for environment-scoped runtime configuration.',
    });

    new CfnOutput(this, 'RecommendationQueueUrl', {
      value: recommendationQueue.queueUrl,
      description: 'SQS queue URL for recommendation job requests.',
    });

    new CfnOutput(this, 'RecommendationStateMachineArn', {
      value: recommendationPipelineStateMachine.stateMachineArn,
      description: 'Step Functions state machine ARN for async recommendation pipeline.',
    });

    new CfnOutput(this, 'PushEventsTopicArn', {
      value: mobilePushEventsTopic.topicArn,
      description: 'SNS topic ARN for recommendation-ready push event fanout.',
    });

    new CfnOutput(this, 'OpsDashboardName', {
      value: opsDashboard.dashboardName,
      description: 'CloudWatch dashboard name for operational and cost monitoring.',
    });

    new CfnOutput(this, 'IngestionQueueUrl', {
      value: ingestionQueue.queueUrl,
      description: 'SQS queue URL for ingestion batch processing.',
    });

    new CfnOutput(this, 'IngestionStateMachineArn', {
      value: ingestionPipelineStateMachine.stateMachineArn,
      description: 'Step Functions state machine ARN for ingestion orchestration.',
    });
  }
}
