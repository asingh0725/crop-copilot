import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config';

export interface DatabaseStackProps extends StackProps {
  config: EnvironmentConfig;
}

const DEFAULT_DATABASE_NAME = 'cropcopilot';
const DEFAULT_DATABASE_USERNAME = 'cropcopilot_admin';

export class DatabaseStack extends Stack {
  readonly database: rds.DatabaseInstance;
  readonly credentialsSecret: secretsmanager.ISecret;
  readonly runtimeDatabaseUrl: string;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { config } = props;
    for (const [key, value] of Object.entries(config.tags)) {
      Tags.of(this).add(key, value);
    }

    const shouldRetainData = config.envName === 'prod';
    const parameterPrefix = `/${config.projectSlug}/${config.envName}/db/postgres`;
    const databaseName = process.env.DB_NAME ?? DEFAULT_DATABASE_NAME;
    const databaseUsername = process.env.DB_USERNAME ?? DEFAULT_DATABASE_USERNAME;
    const secretName = `${config.projectSlug}/${config.envName}/postgres/credentials`;

    const vpc = new ec2.Vpc(this, 'DatabaseVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'PostgreSQL access for Crop Copilot runtime and migration tooling.',
      allowAllOutbound: true,
    });
    databaseSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access (restricted by credentials and TLS).'
    );

    const credentials = rds.Credentials.fromGeneratedSecret(databaseUsername, {
      secretName,
    });

    const database = new rds.DatabaseInstance(this, 'PostgresDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_10,
      }),
      credentials,
      databaseName,
      port: 5432,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroups: [databaseSecurityGroup],
      publiclyAccessible: true,
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      backupRetention: shouldRetainData ? Duration.days(7) : Duration.days(1),
      autoMinorVersionUpgrade: true,
      deleteAutomatedBackups: !shouldRetainData,
      deletionProtection: shouldRetainData,
      removalPolicy: shouldRetainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.database = database;
    this.credentialsSecret = database.secret ?? credentials.secret!;
    this.runtimeDatabaseUrl = [
      'postgresql://',
      databaseUsername,
      ':',
      this.credentialsSecret.secretValueFromJson('password').toString(),
      '@',
      database.instanceEndpoint.hostname,
      ':',
      database.instanceEndpoint.port.toString(),
      '/',
      databaseName,
      '?sslmode=require',
    ].join('');

    new ssm.StringParameter(this, 'DbHostParameter', {
      parameterName: `${parameterPrefix}/host`,
      stringValue: database.instanceEndpoint.hostname,
      description: 'AWS PostgreSQL host for Crop Copilot runtime.',
    });

    new ssm.StringParameter(this, 'DbPortParameter', {
      parameterName: `${parameterPrefix}/port`,
      stringValue: database.instanceEndpoint.port.toString(),
      description: 'AWS PostgreSQL port for Crop Copilot runtime.',
    });

    new ssm.StringParameter(this, 'DbNameParameter', {
      parameterName: `${parameterPrefix}/database`,
      stringValue: databaseName,
      description: 'AWS PostgreSQL database name for Crop Copilot runtime.',
    });

    new ssm.StringParameter(this, 'DbUsernameParameter', {
      parameterName: `${parameterPrefix}/username`,
      stringValue: databaseUsername,
      description: 'AWS PostgreSQL username for Crop Copilot runtime.',
    });

    new ssm.StringParameter(this, 'DbSecretArnParameter', {
      parameterName: `${parameterPrefix}/secret-arn`,
      stringValue: this.credentialsSecret.secretArn,
      description: 'Secrets Manager ARN containing PostgreSQL credentials.',
    });

    new CfnOutput(this, 'DatabaseHost', {
      value: database.instanceEndpoint.hostname,
      description: 'PostgreSQL host endpoint.',
    });

    new CfnOutput(this, 'DatabasePort', {
      value: database.instanceEndpoint.port.toString(),
      description: 'PostgreSQL port.',
    });

    new CfnOutput(this, 'DatabaseName', {
      value: databaseName,
      description: 'PostgreSQL database name.',
    });

    new CfnOutput(this, 'DatabaseUsername', {
      value: databaseUsername,
      description: 'PostgreSQL username.',
    });

    new CfnOutput(this, 'DatabaseSecretArn', {
      value: this.credentialsSecret.secretArn,
      description: 'Secrets Manager ARN for PostgreSQL credentials.',
    });
  }
}
