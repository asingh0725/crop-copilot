# Infrastructure (AWS CDK)

This package provisions the AWS foundation stack for Crop Copilot.

## What this stack creates

- S3 artifacts bucket (encrypted, SSL enforced, versioned)
- SNS billing alerts topic
- AWS Budget with 50/80/100% monthly spend thresholds
- SQS recommendation job queue + DLQ
- SQS ingestion queue + DLQ
- SNS mobile push events topic
- Step Functions recommendation pipeline scaffold
- Step Functions ingestion pipeline scaffold + EventBridge schedule trigger
- CloudWatch ops dashboard (queue depth, DLQ, latency, cost metrics)
- CloudWatch alarms for queue backlog, DLQ depth, failures, and per-recommendation cost
- SSM parameter namespace for platform runtime config
- API runtime stack (HTTP API + Lambda handlers + SQS workers)
- PostgreSQL stack (RDS instance + credentials + SSM metadata)

## Environment variables

Copy `.env.example` and set values before running deploy commands.

Required values:

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `CROP_ENV` (`dev`, `staging`, or `prod`)

Optional values:

- `MONTHLY_BUDGET_USD`
- `MAX_RECOMMENDATION_COST_USD`
- `METRICS_NAMESPACE`
- `COST_ALERT_EMAIL`
- `DATA_BACKEND`
- `DATABASE_URL`
- `COGNITO_REGION`
- `COGNITO_USER_POOL_ID`
- `COGNITO_APP_CLIENT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `RECOMMENDATION_COST_USD`
- `RECOMMENDATION_COST_BY_MODEL_JSON`
- `API_DATABASE_MODE` (`external` or `aws`)
- `PROVISION_AWS_DATABASE` (`true` by default)
- `DB_NAME`
- `DB_USERNAME`

Database cutover controls:
- `API_DATABASE_MODE=external`: API runtime uses `DATABASE_URL` from env (current Supabase-compatible mode).
- `API_DATABASE_MODE=aws`: API runtime uses the URL generated from the AWS RDS stack.

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
