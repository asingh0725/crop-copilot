# GitHub OIDC Ops Runbook

This removes the recurring AWS SSO bottleneck by letting GitHub Actions assume
short-lived AWS roles through OIDC.

## Roles

The `crop-copilot-prod-github-ops` stack creates three roles:

- `crop-copilot-prod-github-audit-role`
  - read-only AWS audit access
  - trusted only for `.github/workflows/aws-ops-audit.yml` on `main`
- `crop-copilot-prod-github-app-deploy-role`
  - production app/foundation deploy access
  - trusted only for `.github/workflows/deploy-prod.yml` on `main`
  - explicitly denied from mutating RDS
- `crop-copilot-prod-github-db-ops-role`
  - snapshot-first DB operations
  - trusted only for `.github/workflows/prod-db-ops.yml` on `main`
  - explicitly denied from destructive RDS restore/delete/modify actions

## One-time bootstrap

Requires one valid AWS admin session.

```bash
aws sso login --profile cropcopilot-deploy
export AWS_PROFILE=cropcopilot-deploy
export AWS_REGION=us-west-2
aws sts get-caller-identity

pnpm aws:bootstrap:github-oidc
```

This deploys the OIDC provider + roles and then writes the role ARNs into the
GitHub `production` environment variables.

## Required GitHub production environment values

The sync script sets these automatically:

- `AWS_AUDIT_ROLE_ARN`
- `AWS_APP_DEPLOY_ROLE_ARN`
- `AWS_DB_OPS_ROLE_ARN`
- `AWS_REGION`
- `AWS_AUDIT_REGIONS`

These still need to exist separately:

- vars:
  - `AWS_ACCOUNT_ID`
  - `APP_BASE_URL`
  - `ADMIN_EMAILS`
  - `COGNITO_REGION`
  - `COGNITO_USER_POOL_ID`
  - `COGNITO_APP_CLIENT_ID`
- secrets:
  - `DATABASE_URL`
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_AI_API_KEY`
  - `OPENWEATHER_API_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `PERPLEXITY_API_KEY`
  - `BRAVE_SEARCH_API_KEY`
  - `LLAMA_CLOUD_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

## Workflows

- [aws-ops-audit.yml](/Users/avi/Desktop/Github/crop-copilot/.github/workflows/aws-ops-audit.yml)
  - scheduled daily and manual
  - assumes `AWS_AUDIT_ROLE_ARN`
- [deploy-prod.yml](/Users/avi/Desktop/Github/crop-copilot/.github/workflows/deploy-prod.yml)
  - runs from `main`
  - assumes `AWS_APP_DEPLOY_ROLE_ARN`
- [prod-db-ops.yml](/Users/avi/Desktop/Github/crop-copilot/.github/workflows/prod-db-ops.yml)
  - manual only
  - creates fresh snapshot + logical dump before applying SQL
  - assumes `AWS_DB_OPS_ROLE_ARN`

## DB mutation guardrail

Every production DB workflow run must satisfy:

- fresh RDS snapshot
- fresh `pg_dump`
- non-empty dry-run summary
- explicit approval flag `YES`

This is enforced by:

- [require-prod-data-guard.mjs](/Users/avi/Desktop/Github/crop-copilot/tools/scripts/require-prod-data-guard.mjs)

## Notes

- The OIDC trust is limited to this repo and `refs/heads/main`.
- Each role is further pinned to a single workflow file via `job_workflow_ref`.
- After bootstrap, normal AWS audits/deploys should no longer require local SSO.
