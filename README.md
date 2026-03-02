# Crop Copilot

AI-powered agronomic intelligence for farmers — diagnose crop conditions, get tailored treatment recommendations, and track product efficacy across every growing season.

---

## Targeted Users

Crop Copilot is built for:

- **Smallholder farmers** who lack access to local agronomists and need immediate, actionable guidance on crop diseases, pests, and nutrient deficiencies.
- **Commercial growers** managing diverse crops across multiple fields who need consistent, data-driven decision support at scale.
- **Agricultural consultants and extension agents** who want a digital co-pilot to cross-check recommendations and track client outcomes.

The platform supports crops across North America, South America, South Asia, and Australia — with knowledge continuously expanding via automated source discovery.

---

## Project Architecture

Crop Copilot is a monorepo with four workspaces managed by [pnpm](https://pnpm.io):

```
crop-copilot/
├── apps/
│   ├── web/          # Next.js 14 web application (React Server Components)
│   ├── ios/          # Native iOS app (Swift / SwiftUI)
│   └── api/          # AWS Lambda functions (TypeScript / Node.js 22)
└── infra/            # AWS CDK infrastructure (TypeScript)
```

### AWS Infrastructure

```
┌──────────────────────────────────────────────────────────┐
│  User (Web / iOS)                                        │
│       │                                                  │
│       ▼                                                  │
│  API Gateway v2 (HTTP API)                               │
│       │                                                  │
│       ▼                                                  │
│  Lambda Functions (ARM64, Node.js 22)                    │
│  ┌──────────────┬──────────────┬──────────────────────┐  │
│  │  Handlers    │  Workers     │  ML / Discovery      │  │
│  │  (HTTP req)  │  (SQS/cron)  │  (EventBridge)       │  │
│  └──────────────┴──────────────┴──────────────────────┘  │
│       │               │                │                 │
│       ▼               ▼                ▼                 │
│  PostgreSQL RDS   S3 (artifacts,  SageMaker             │
│  (Aurora-compat)   training data)  (LTR reranker)        │
│                                                          │
│  Supporting: SQS · SNS · Step Functions (Express) ·     │
│              EventBridge · SSM · CloudWatch              │
└──────────────────────────────────────────────────────────┘

Regions: us-west-2 (Oregon) · us-east-1 (Budget stack only)
```

### Stacks

| Stack | Purpose |
|-------|---------|
| `foundation` | SQS queues, S3 bucket, SNS topics, Step Functions, CloudWatch, EventBridge schedules |
| `database` | PostgreSQL 16 RDS (t3.micro, 20–100 GB autoscaling) |
| `api-runtime` | API Gateway v2 + 20+ Lambda functions |
| `budget` | AWS Budgets (deployed to us-east-1 per AWS requirement) |

---

## Features

### Crop Diagnosis
Upload a photo or describe symptoms via text. Claude (Anthropic) analyzes the input against a curated knowledge base of agricultural extension literature, government guidance, and peer-reviewed research to identify the most likely condition and its confidence level.

### AI-Powered Recommendations
Each diagnosis generates a structured treatment plan with:
- Ranked product recommendations (pesticides, fungicides, fertilizers)
- Application timing and dosage guidance
- Citations linking back to the source documents used

### Product Intelligence
Browse, compare, and get pricing for crop protection and nutrition products. Product data integrates with real-time pricing APIs for regional market accuracy.

### PDF & Web Ingestion
The ingestion pipeline scrapes and parses both web pages and PDF documents (via [LlamaParse](https://cloud.llamaindex.ai)):
1. Source URLs are discovered automatically (see pipeline section below)
2. Each document is scraped, chunked into semantic sections, and embedded using OpenAI
3. Embeddings are stored in PostgreSQL with `pgvector` for similarity search

### Multi-Platform
- **Web**: Next.js 14 with React Server Components and Supabase auth
- **iOS**: Native SwiftUI app with the same API Gateway backend
- **Push notifications**: SNS fanout when recommendations are ready

---

## Automated Knowledge Pipeline

Crop Copilot runs a fully automated pipeline from source discovery to recommendation improvement:

```
1. DISCOVER ──► 2. INGEST ──► 3. RETRIEVE ──► 4. RECOMMEND ──► 5. LEARN ──► 6. RETRAIN
```

### 1. Discover (every 30 minutes)
An EventBridge-triggered Lambda calls **Gemini 2.5 Flash** with Google Search grounding to find authoritative agricultural URLs for each crop × region combination (30 crops × 20 regions = 600 total). Results from `.edu`, `.gov`, and research institutions are registered as sources.

Track progress at `/admin/discovery` in the web app.

### 2. Ingest (daily at 06:00 UTC + on-demand)
For each pending source:
- HTML pages: scraped and parsed with `cheerio`
- PDF documents: uploaded to LlamaParse → markdown → semantic sections
- Chunks are embedded with OpenAI `text-embedding-3-small` and upserted into `pgvector`

### 3. Retrieve (at recommendation time)
Hybrid retrieval with multiple quality layers:
- **HyDE** (Hypothetical Document Embeddings): generates a synthetic answer first, embeds it, and uses it to retrieve more relevant passages
- **Crop pre-filter**: filters chunks to those tagged with the user's specific crop
- **MMR** (Maximal Marginal Relevance): diversifies results to reduce repetition
- **LTR reranker**: a LightGBM Learning-to-Rank model scores final candidates using 7 features (semantic similarity, source authority, recency, feedback signal, source boost, etc.)

### 4. Recommend
Ranked chunks are assembled into a context window and passed to Claude (via Amazon Bedrock) to generate a structured diagnosis + treatment plan with citations.

### 5. Learn
User interactions are logged as implicit feedback:
- Viewed product = weak positive signal
- Copied/shared recommendation = strong positive signal
- Dismissed or rated poorly = negative signal

### 6. Retrain (nightly at 02:00 UTC)
Once 50+ feedback events accumulate, a Lambda:
1. Exports a 7-feature training CSV to S3
2. Submits a SageMaker training job for the LightGBM LTR model
3. On completion, the `EndpointUpdaterWorker` promotes the new model to the SageMaker inference endpoint

---

## How Recommendations Improve Over Time

| Signal | How it's captured | How it improves recommendations |
|--------|------------------|-------------------------------|
| Source quality | `.gov`/`.edu` domain tagging | Higher-authority sources weighted up in retrieval |
| User feedback | Explicit ratings, implicit clicks | Retraining signal for LTR model |
| Crop specificity | Tags on every chunk | Crop pre-filter reduces irrelevant results |
| Source freshness | `lastScrapedAt` + `freshnessHours` | Stale sources re-scraped and re-embedded |
| Regional relevance | Region tags from discovery pipeline | Retrieval biased toward regionally matched content |
| Model retraining | Nightly LightGBM retraining | Reranker continuously calibrates to actual user preferences |

The net effect: recommendations become measurably more accurate as the knowledge base grows and the model learns from real-world usage.

---

## Local Development

### Prerequisites
- Node.js 22+
- pnpm 9+
- A Supabase project (for auth)
- Optional: AWS account with API Gateway deployed

### Setup

```bash
# Install dependencies
pnpm install

# Configure environment variables
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with your Supabase credentials and API base:
# NEXT_PUBLIC_API_GATEWAY_URL=https://<api-domain> (or http://localhost:<port> if running local API)
```

### Run the web app

```bash
pnpm --filter web dev
```

The app runs at `http://localhost:3000`. Without `API_GATEWAY_URL` set, API calls gracefully return empty data — the UI renders with empty states rather than throwing.

### Populate data on a fresh local copy

1. Sign in as an admin user.
2. Open `/admin/discovery` or `/admin/compliance`.
3. In **Manual Pipeline Controls**, click **Bootstrap Local Data**.

This runs discovery and compliance source scan + inline ingestion processing so local environments without active SQS workers still get indexed data.

### Run the discovery test script

```bash
cd apps/api
DATABASE_URL="..." GOOGLE_AI_API_KEY="..." npx tsx src/scripts/run-discovery-test.ts
```

---

## Deployment

### Environment Variables (CDK)

| Variable | Required | Description |
|----------|----------|-------------|
| `CROP_ENV` | Yes | `dev` or `prod` |
| `AWS_ACCOUNT_ID` | Yes | AWS account ID |
| `AWS_REGION` | No | Defaults to `us-west-2` |
| `COST_ALERT_EMAIL` | No | Email for budget and alarm notifications |
| `MONTHLY_BUDGET_USD` | No | Override monthly budget (dev: $10, prod: $50) |
| `PROVISION_AWS_DATABASE` | No | Set to `false` to skip RDS (use external DB) |

### Environment Variables (Lambda runtime)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude API key (or use Bedrock) |
| `OPENAI_API_KEY` | For text embeddings |
| `GOOGLE_AI_API_KEY` | Gemini API key for source discovery |
| `LLAMA_CLOUD_API_KEY` | LlamaParse key for PDF ingestion |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Auth provider |
| `ADMIN_USER_IDS` | Comma-separated Supabase user IDs with admin access |
| `SAGEMAKER_ENDPOINT_NAME` | Optional: LTR reranker endpoint |

### Deploy

```bash
cd infra
CROP_ENV=prod AWS_ACCOUNT_ID=123456789 npx cdk deploy --all
```

### Database Migrations

Apply SQL migrations in order from `apps/api/sql/` (this is the canonical migration path for AWS RDS):

```bash
psql "$DATABASE_URL" -f apps/api/sql/001_async_recommendation_tables.sql
psql "$DATABASE_URL" -f apps/api/sql/002_recommendation_job_result_payload.sql
psql "$DATABASE_URL" -f apps/api/sql/003_sync_cursor_indexes.sql
psql "$DATABASE_URL" -f apps/api/sql/004_source_registry_fields.sql
psql "$DATABASE_URL" -f apps/api/sql/005_ml_tables.sql
psql "$DATABASE_URL" -f apps/api/sql/006_discovery_queue.sql
psql "$DATABASE_URL" -f apps/api/sql/007_premium_billing_foundation.sql
psql "$DATABASE_URL" -f apps/api/sql/008_advisory_risk_review_states.sql
```

---

## Cost Optimization

The infrastructure is designed to minimize AWS spend:

- **ARM64 Lambdas**: ~20% cheaper than x86 for the same workload
- **Express Step Functions**: ~2500× cheaper than Standard for short-lived pipelines
- **S3 lifecycle rules**: Non-current object versions expire after 7 days to prevent storage bloat
- **CloudWatch dashboard**: Provisioned in prod only (saves ~$3/month per environment)
- **AWS Budgets**: Hard tripwires at 50%/80%/100% of monthly limit (dev: $10, prod: $50)
- **RDS t3.micro**: Sufficient for early-stage load with autoscaling storage up to 100 GB

---

## Admin

- **Discovery pipeline**: `/admin/discovery` — live status of all 600 crop × region combinations, sources registered, and run progress
- **Source registration**: `POST /api/v1/sources` — manually register a new URL for ingestion (requires `ADMIN_USER_IDS`)

---

## License

Private — all rights reserved.
