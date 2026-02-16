# AWS Backend Implementation Plan

## Objective

Build a production-ready AWS backend for Crop Copilot that supports web + native iOS, advanced RAG, and offline-first mobile workflows while keeping early fixed costs low.

## PR Breakdown

1. PR-01 Infra Foundation
- CDK workspace (`infra/`)
- Environment-aware stack (`dev`, `staging`, `prod`)
- Budget alerts, configuration namespace, shared artifact storage

2. PR-02 Shared Contracts and Domain Modules
- Add `packages/contracts` and `packages/domain`
- Move API request/response schemas and core business types into shared packages

3. PR-03 API Service Skeleton
- Add `apps/api` (Lambda handlers)
- Keep contract-compatible `/api/v1` interface for web and iOS

4. PR-04 Auth Adapter and Token Model
- Cognito JWT verification
- Transitional compatibility for existing auth during migration

5. PR-05 Data and Storage Migration Layer
- Aurora PostgreSQL + pgvector migration plan and adapters
- S3 presigned upload flow

6. PR-06 Async Recommendation Pipeline
- SQS queues
- Step Functions orchestration for retrieval, generation, validation, and persistence

7. PR-07 Advanced RAG v2
- Hybrid retrieval, reranking, authority weighting
- Improved chunking and multimodal indexing

8. PR-08 Automated Source Ingestion
- EventBridge schedules
- Fargate scrape jobs + parse/chunk/embed workers

9. PR-09 Offline-First Sync APIs
- Idempotent write commands
- Cursor-based sync endpoints
- Push notification events for async job completion

10. PR-10 Observability and FinOps
- CloudWatch dashboards and alerts
- Trace correlation and cost-per-recommendation metrics

11. PR-11 Production Cutover
- Canary rollout
- Supabase dependency removal after parity checks

## Test and Release Strategy

- Local: unit tests + contract tests + worker tests
- Dev AWS: deploy each PR and run smoke tests
- Staging AWS: load and reliability testing
- Prod: canary cutover with rollback controls
