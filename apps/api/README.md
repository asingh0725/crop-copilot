# Crop Copilot API (AWS)

Lambda-oriented API service that will become the canonical backend for web and iOS clients.

## Current scope (PR-03)

- health endpoint handler
- create input command handler (async recommendation job accepted)
- get recommendation job status handler
- cursor-based sync pull handler for offline clients
- in-memory store abstraction for local testing
- Cognito JWT verification middleware (`Authorization: Bearer <token>`)
- RAG v2 scaffold modules (query expansion, hybrid reranking, semantic chunking, multimodal linking)

## Scripts

```bash
pnpm --filter @crop-copilot/api build
pnpm --filter @crop-copilot/api test
```

Database bootstrap SQL:

- `apps/api/sql/001_async_recommendation_tables.sql`
- `apps/api/sql/002_recommendation_job_result_payload.sql`
- `apps/api/sql/003_sync_cursor_indexes.sql`

Required env for Cognito auth at runtime:

- `COGNITO_REGION`
- `COGNITO_USER_POOL_ID`
- `COGNITO_APP_CLIENT_ID` (optional but recommended)

Storage and persistence env:

- `DATA_BACKEND` (`in-memory` default, `postgres` for Aurora/RDS)
- `DATABASE_URL` (required when `DATA_BACKEND=postgres`)
- `S3_UPLOAD_BUCKET`
- `S3_UPLOAD_URL_EXPIRY_SECONDS` (optional, default 900)
- `SQS_RECOMMENDATION_QUEUE_URL` (optional; if set, create-input publishes async job messages)
- `SQS_INGESTION_QUEUE_URL` (optional; if set, ingestion scheduler publishes ingestion batches)
- `SNS_PUSH_EVENTS_TOPIC_ARN` (optional; if set, recommendation worker emits `recommendation.ready` events)

Upload URL request contract:

- `contentLength` is required and capped at 25MB
- the generated presigned request includes `ContentLength` to enforce size
