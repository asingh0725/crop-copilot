#!/usr/bin/env node

import { execSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY ?? 'asingh0725/crop-copilot';
const environment = process.env.GITHUB_ENVIRONMENT ?? 'production';
const stackName = process.env.GITHUB_OPS_STACK_NAME ?? 'crop-copilot-prod-github-ops';
const region = process.env.AWS_REGION ?? 'us-west-2';

function run(command) {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function aws(command) {
  return run(`aws --region ${shellEscape(region)} ${command}`);
}

function gh(command) {
  return run(`gh ${command}`);
}

const rawOutputs = aws(
  `cloudformation describe-stacks --stack-name ${shellEscape(stackName)} --query 'Stacks[0].Outputs' --output json`
);
const outputs = JSON.parse(rawOutputs);
const map = Object.fromEntries(outputs.map((entry) => [entry.OutputKey, entry.OutputValue]));

const pairs = {
  AWS_AUDIT_ROLE_ARN: map.GitHubAuditRoleArn,
  AWS_APP_DEPLOY_ROLE_ARN: map.GitHubAppDeployRoleArn,
  AWS_DB_OPS_ROLE_ARN: map.GitHubDbOpsRoleArn,
  AWS_REGION: region,
  AWS_AUDIT_REGIONS: process.env.AWS_AUDIT_REGIONS ?? 'us-west-2,us-west-1,ca-west-1',
};

for (const [name, value] of Object.entries(pairs)) {
  if (!value) {
    throw new Error(`Missing required value for ${name} from stack ${stackName}`);
  }

  gh(`variable set ${shellEscape(name)} --env ${shellEscape(environment)} --repo ${shellEscape(repo)} --body ${shellEscape(value)}`);
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      repo,
      environment,
      stackName,
      variables: Object.keys(pairs),
    },
    null,
    2
  )
);
