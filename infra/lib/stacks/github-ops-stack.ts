import { CfnOutput, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config';

export interface GithubOpsStackProps extends StackProps {
  config: EnvironmentConfig;
}

function shouldCreateGithubProvider(): boolean {
  return (process.env.CREATE_GITHUB_OIDC_PROVIDER ?? 'false').trim().toLowerCase() === 'true';
}

function githubOwner(): string {
  return (process.env.GITHUB_REPO_OWNER ?? 'asingh0725').trim();
}

function githubRepo(): string {
  return (process.env.GITHUB_REPO_NAME ?? 'crop-copilot').trim();
}

function githubRepoSlug(): string {
  return `${githubOwner()}/${githubRepo()}`;
}

function githubRef(): string {
  return (process.env.GITHUB_TRUSTED_REF ?? 'refs/heads/main').trim();
}

function githubEnvironment(): string {
  return (process.env.GITHUB_TRUSTED_ENVIRONMENT ?? 'production').trim();
}

function workflowRef(workflowFile: string): string {
  return `${githubRepoSlug()}/.github/workflows/${workflowFile}@${githubRef()}`;
}

function githubWorkflowPrincipal(
  provider: iam.IOpenIdConnectProvider,
  workflowFile: string
): iam.WebIdentityPrincipal {
  return new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
    StringEquals: {
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    },
    StringLike: {
      'token.actions.githubusercontent.com:sub': [
        `repo:${githubRepoSlug()}:ref:${githubRef()}`,
        `repo:${githubRepoSlug()}:environment:${githubEnvironment()}`,
      ],
      'token.actions.githubusercontent.com:job_workflow_ref': workflowRef(workflowFile),
    },
  });
}

function commonRoleName(config: EnvironmentConfig, suffix: string): string {
  return `${config.projectSlug}-${config.envName}-${suffix}`;
}

export class GithubOpsStack extends Stack {
  readonly githubProvider: iam.IOpenIdConnectProvider;
  readonly auditRole: iam.Role;
  readonly appDeployRole: iam.Role;
  readonly dbOpsRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOpsStackProps) {
    super(scope, id, props);

    const { config } = props;
    for (const [key, value] of Object.entries(config.tags)) {
      Tags.of(this).add(key, value);
    }
    Tags.of(this).add('Purpose', 'github-oidc-ops');

    const providerArn = `arn:aws:iam::${config.accountId}:oidc-provider/token.actions.githubusercontent.com`;
    const provider = shouldCreateGithubProvider()
      ? new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        })
      : iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidcProvider',
          providerArn
        );
    this.githubProvider = provider;

    const auditRole = new iam.Role(this, 'GithubAuditRole', {
      roleName: commonRoleName(config, 'github-audit-role'),
      description: 'Read-only AWS audit role for GitHub Actions on crop-copilot main.',
      assumedBy: githubWorkflowPrincipal(provider, 'aws-ops-audit.yml'),
    });
    this.auditRole = auditRole;

    auditRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AuditReadOnlyAccess',
        actions: [
          'ce:GetCostAndUsage',
          'ce:GetCostForecast',
          'ce:GetDimensionValues',
          'ce:GetReservationCoverage',
          'ce:GetReservationUtilization',
          'ce:GetSavingsPlansCoverage',
          'ce:GetSavingsPlansUtilization',
          'ce:GetUsageForecast',
          'cloudformation:Describe*',
          'cloudformation:Get*',
          'cloudformation:List*',
          'cloudwatch:Describe*',
          'cloudwatch:Get*',
          'cloudwatch:List*',
          'logs:Describe*',
          'logs:Get*',
          'logs:FilterLogEvents',
          'logs:StartQuery',
          'logs:StopQuery',
          'logs:GetQueryResults',
          'lambda:Get*',
          'lambda:List*',
          'apigateway:GET',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
          'sqs:ListQueues',
          'sns:Get*',
          'sns:List*',
          'ssm:Describe*',
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:GetParametersByPath',
          'rds:Describe*',
          'budgets:ViewBudget',
          'budgets:Describe*',
          'secretsmanager:DescribeSecret',
          'secretsmanager:ListSecrets',
          'cognito-idp:Describe*',
          'cognito-idp:List*',
          's3:GetBucketLocation',
          's3:GetBucketPolicyStatus',
          's3:GetBucketVersioning',
          's3:ListAllMyBuckets',
          's3:ListBucket',
          'sts:GetCallerIdentity',
          'tag:GetResources',
        ],
        resources: ['*'],
      })
    );

    const appDeployRole = new iam.Role(this, 'GithubAppDeployRole', {
      roleName: commonRoleName(config, 'github-app-deploy-role'),
      description: 'GitHub Actions app deploy role for crop-copilot production runtime/foundation changes.',
      assumedBy: githubWorkflowPrincipal(provider, 'deploy-prod.yml'),
    });
    this.appDeployRole = appDeployRole;

    appDeployRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
    );

    appDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DenyDatabaseMutations',
        effect: iam.Effect.DENY,
        actions: [
          'rds:AddRoleToDBCluster',
          'rds:CreateDBCluster',
          'rds:CreateDBInstance',
          'rds:CreateDBSubnetGroup',
          'rds:CreateEventSubscription',
          'rds:DeleteDBCluster',
          'rds:DeleteDBInstance',
          'rds:DeleteDBSubnetGroup',
          'rds:DeleteEventSubscription',
          'rds:ModifyDBCluster',
          'rds:ModifyDBInstance',
          'rds:ModifyDBSubnetGroup',
          'rds:PromoteReadReplica',
          'rds:RebootDBInstance',
          'rds:RemoveRoleFromDBCluster',
          'rds:RestoreDBClusterFromSnapshot',
          'rds:RestoreDBClusterToPointInTime',
          'rds:RestoreDBInstanceFromDBSnapshot',
          'rds:RestoreDBInstanceToPointInTime',
        ],
        resources: ['*'],
      })
    );

    appDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DenyUserCredentialMutations',
        effect: iam.Effect.DENY,
        actions: [
          'iam:CreateAccessKey',
          'iam:CreateLoginProfile',
          'iam:CreateUser',
          'iam:DeleteAccessKey',
          'iam:DeleteLoginProfile',
          'iam:DeleteUser',
          'iam:PutUserPolicy',
          'iam:UpdateAccessKey',
          'iam:UpdateLoginProfile',
          'iam:AttachUserPolicy',
          'iam:DetachUserPolicy',
        ],
        resources: ['*'],
      })
    );

    const dbOpsRole = new iam.Role(this, 'GithubDbOpsRole', {
      roleName: commonRoleName(config, 'github-db-ops-role'),
      description: 'Guarded DB operations role for snapshot-first production migrations.',
      assumedBy: githubWorkflowPrincipal(provider, 'prod-db-ops.yml'),
    });
    this.dbOpsRole = dbOpsRole;

    dbOpsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DbSnapshotAccess',
        actions: [
          'rds:AddTagsToResource',
          'cloudformation:DescribeStacks',
          'cloudformation:ListStackResources',
          'rds:CreateDBSnapshot',
          'rds:DescribeDBInstances',
          'rds:DescribeDBSnapshots',
          'rds:ListTagsForResource',
        ],
        resources: ['*'],
      })
    );

    dbOpsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DbOpsReadSupport',
        actions: [
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:GetParametersByPath',
          'sts:GetCallerIdentity',
        ],
        resources: ['*'],
      })
    );

    dbOpsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DenyDbDestructiveOps',
        effect: iam.Effect.DENY,
        actions: [
          'rds:DeleteDBCluster',
          'rds:DeleteDBInstance',
          'rds:ModifyDBCluster',
          'rds:ModifyDBInstance',
          'rds:RebootDBInstance',
          'rds:RestoreDBClusterFromSnapshot',
          'rds:RestoreDBClusterToPointInTime',
          'rds:RestoreDBInstanceFromDBSnapshot',
          'rds:RestoreDBInstanceToPointInTime',
        ],
        resources: ['*'],
      })
    );

    new CfnOutput(this, 'GitHubRepositoryTrust', {
      value: `${githubRepoSlug()} @ ${githubRef()}`,
      description: 'GitHub repo/ref trusted by the OIDC roles.',
    });

    new CfnOutput(this, 'GitHubAuditRoleArn', {
      value: auditRole.roleArn,
      description: 'Role ARN for GitHub AWS audit workflow.',
    });

    new CfnOutput(this, 'GitHubAppDeployRoleArn', {
      value: appDeployRole.roleArn,
      description: 'Role ARN for GitHub prod deploy workflow.',
    });

    new CfnOutput(this, 'GitHubDbOpsRoleArn', {
      value: dbOpsRole.roleArn,
      description: 'Role ARN for GitHub guarded DB ops workflow.',
    });
  }
}
