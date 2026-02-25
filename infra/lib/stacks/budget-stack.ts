/**
 * BudgetStack — must be deployed to us-east-1 (N. Virginia).
 *
 * AWS CloudFormation Budgets resources and the SNS topics they notify are
 * required to be in us-east-1 regardless of where the rest of the application
 * is deployed. This stack is intentionally kept separate and its `env.region`
 * is hardcoded to 'us-east-1' in the app entry point.
 */
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config';

export interface BudgetStackProps extends StackProps {
  config: EnvironmentConfig;
  /** ARN of the FoundationStack billing alerts topic (us-west-2). Stored for
   *  reference / future cross-region fanout; budget notifications use the local
   *  us-east-1 topic created here (AWS Budgets requirement). */
  billingAlertsTopicArn: string;
}

export class BudgetStack extends Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    const { config } = props;

    // AWS Budgets SNS notifications must target a topic in us-east-1.
    const budgetAlertsTopic = new sns.Topic(this, 'BudgetAlertsTopic', {
      displayName: `Crop Copilot ${config.envName} budget alerts`,
      topicName: `${config.projectSlug}-${config.envName}-budget-alerts`,
    });

    // Allow the AWS Budgets service to publish to this topic.
    budgetAlertsTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowBudgetsToPublish',
        actions: ['sns:Publish'],
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        resources: [budgetAlertsTopic.topicArn],
      })
    );

    if (config.costAlertEmail) {
      budgetAlertsTopic.addSubscription(
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
            address: budgetAlertsTopic.topicArn,
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

    new CfnOutput(this, 'BudgetAlertsTopicArn', {
      value: budgetAlertsTopic.topicArn,
      description: 'SNS topic ARN for budget threshold alerts (us-east-1).',
    });
  }
}
