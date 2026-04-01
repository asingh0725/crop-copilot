#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-cropcopilot-deploy}"
export AWS_SDK_LOAD_CONFIG=1
export AWS_REGION="${AWS_REGION:-us-west-2}"
export CROP_ENV="${CROP_ENV:-prod}"
export ENABLE_GITHUB_OPS_BOOTSTRAP=true
export ALLOW_LEGACY_ENV_FALLBACK=false
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"

pnpm infra:deploy:github-ops
pnpm github:sync:aws-oidc-vars
