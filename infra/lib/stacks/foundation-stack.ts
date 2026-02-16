import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config';

export interface FoundationStackProps extends StackProps {
  config: EnvironmentConfig;
}

export class FoundationStack extends Stack {
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
  }
}
