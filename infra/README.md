# Infrastructure (AWS CDK)

This package provisions the AWS foundation stack for Crop Copilot.

## What this stack creates

- S3 artifacts bucket (encrypted, SSL enforced, versioned)
- SNS billing alerts topic
- AWS Budget with 50/80/100% monthly spend thresholds
- SSM parameter namespace for platform runtime config

## Environment variables

Copy `.env.example` and set values before running deploy commands.

Required values:

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `CROP_ENV` (`dev`, `staging`, or `prod`)

Optional values:

- `MONTHLY_BUDGET_USD`
- `COST_ALERT_EMAIL`

## Commands

```bash
# From repository root
pnpm --filter infra build
pnpm --filter infra synth
pnpm --filter infra diff
pnpm --filter infra bootstrap
pnpm --filter infra deploy
```

## Example (dev)

```bash
export AWS_PROFILE=cropcopilot-dev
export AWS_ACCOUNT_ID=325460142505
export AWS_REGION=ca-west-1
export CROP_ENV=dev
export MONTHLY_BUDGET_USD=150

pnpm --filter infra bootstrap
pnpm --filter infra deploy
```
