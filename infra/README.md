# Infrastructure (AWS CDK)

This package provisions the AWS foundation stack for Crop Copilot.

## What this stack creates

- S3 artifacts bucket (encrypted, SSL enforced, versioned)
- SNS billing alerts topic
- AWS Budget with 50/80/100% monthly spend thresholds
- SQS recommendation job queue + DLQ
- SQS ingestion queue + DLQ
- SNS mobile push events topic
- CloudWatch ops dashboard (queue depth, DLQ, latency, cost metrics)
- CloudWatch alarms for queue backlog, DLQ depth, failures, and per-recommendation cost
- SSM parameter namespace for platform runtime config
- Cognito user pool + app client for first-party auth
- API runtime stack (HTTP API + Lambda handlers + SQS workers)
- PostgreSQL stack (RDS instance + credentials + SSM metadata)

## Environment variables

Copy `.env.example` and set values before running deploy commands.

Required values:

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `CROP_ENV` (`dev` or `prod`)

Optional values:

- `MONTHLY_BUDGET_USD`
- `MAX_RECOMMENDATION_COST_USD`
- `METRICS_NAMESPACE`
- `COST_ALERT_EMAIL`
- `DATA_BACKEND`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `RECOMMENDATION_COST_USD`
- `RECOMMENDATION_COST_BY_MODEL_JSON`
- `API_DATABASE_MODE` (`external` or `aws`)
- `PROVISION_AWS_DATABASE` (`true` by default)
- `ALLOW_LEGACY_ENV_FALLBACK` (`false` by default)
- `DB_NAME`
- `DB_USERNAME`

Database cutover controls:
- `API_DATABASE_MODE=external`: API runtime uses `DATABASE_URL` from env (current Supabase-compatible mode).
- `API_DATABASE_MODE=aws`: API runtime uses the URL generated from the AWS RDS stack.

Auth controls:
- Foundation now provisions Cognito in AWS and passes `COGNITO_REGION`, `COGNITO_USER_POOL_ID`,
  and `COGNITO_APP_CLIENT_ID` to the API runtime automatically.
- Keep Supabase env only during migration/fallback; web should move to
  `NEXT_PUBLIC_AUTH_PROVIDER=cognito` once Vercel env is updated.

## Commands

```bash
# From repository root
pnpm --filter infra build
pnpm --filter infra synth
pnpm --filter infra diff
pnpm --filter infra bootstrap
pnpm --filter infra deploy
pnpm infra:deploy:github-ops
```

## Dev/Prod env separation

Use env-scoped files instead of a shared `.env`:

```bash
cp infra/.env.dev.example infra/.env.dev
cp infra/.env.prod.example infra/.env.prod
```

Then deploy with explicit environment:

```bash
# from repository root
CROP_ENV=dev pnpm infra:deploy:compliance
CROP_ENV=prod pnpm infra:deploy:compliance
```

GitHub OIDC ops bootstrap:

```bash
aws sso login --profile cropcopilot-deploy
export AWS_PROFILE=cropcopilot-deploy
export AWS_REGION=us-west-2

pnpm infra:deploy:github-ops
pnpm github:sync:aws-oidc-vars
```

CDK entrypoint (`infra/bin/crop-copilot.ts`) prefers env-scoped files
(`.env.dev*`, `.env.prod*`). Legacy `.env` fallback is disabled by default and
must be explicitly enabled with `ALLOW_LEGACY_ENV_FALLBACK=true`.

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
