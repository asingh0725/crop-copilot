# Dev/Prod Environment Separation Checklist

## 1) Git branch lanes

- `codex/env`: integration branch for env/dev deploys.
- `codex/prod`: release branch for production deploys.

## 2) GitHub Actions workflows

- `.github/workflows/deploy-env.yml` deploys using environment `development`.
- `.github/workflows/deploy-prod.yml` deploys using environment `production`.

## 3) GitHub Environments (required)

Create both environments in GitHub repo settings:

- `development`
- `production`

Set environment protection on `production`:

- required reviewers enabled
- optional wait timer before deploy

## 4) GitHub environment secrets

Configure these in **both** `development` and `production` (with different values):

- `AWS_ROLE_TO_ASSUME`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_AI_API_KEY`
- `OPENWEATHER_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PERPLEXITY_API_KEY` (if used)
- `BRAVE_SEARCH_API_KEY` (if used)
- `LLAMA_CLOUD_API_KEY` (if used)

## 5) GitHub environment vars

Configure these in both environments:

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `APP_BASE_URL`
- `ADMIN_EMAILS`
- `COGNITO_REGION` (if Cognito auth enabled)
- `COGNITO_USER_POOL_ID` (if Cognito auth enabled)
- `COGNITO_APP_CLIENT_ID` (if Cognito auth enabled)

## 6) Local env files

Use separate files by environment:

- `infra/.env.dev` and `infra/.env.prod`
- `apps/api/.env.dev` and `apps/api/.env.prod`
- `apps/web/.env.dev` and `apps/web/.env.prod`

Templates:

- `infra/.env.dev.example`, `infra/.env.prod.example`
- `apps/api/.env.dev.example`, `apps/api/.env.prod.example`
- `apps/web/.env.dev.example`, `apps/web/.env.prod.example`

## 7) Deploy commands

From repo root:

```bash
CROP_ENV=dev pnpm infra:deploy:dev
CROP_ENV=prod pnpm infra:deploy:prod
```

## 8) Guardrails to keep enabled

- `REQUIRE_MODEL_OUTPUT=true` in production.
- `ALLOW_BILLING_SIMULATION=false` in production.
- live Stripe keys only in `production` environment.
