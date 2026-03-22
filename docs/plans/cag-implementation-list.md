# CAG Implementation List (App-Wide)

Date: 2026-02-25  
Scope: all meaningful cache-augmented generation/use-result-reuse opportunities found in this repo across API, ingestion, discovery, web, and iOS.

## Decision Legend

- `EXISTS`: already implemented in production code
- `IMPLEMENT_NOW`: high ROI and low/medium risk
- `IMPLEMENT_LATER`: useful but lower priority or larger scope
- `SKIP_FOR_NOW`: possible, but currently not worth risk/complexity

## Phase Plan

### Phase 1 (IMPLEMENT_NOW)

- [ ] Add recommendation query embedding cache (`query + model`).
- [ ] Add HyDE passage cache (`normalized retrieval context + model`).
- [ ] Add retrieval candidate cache (`effective query + crop + region + source filters + kb version`).
- [ ] Add pricing negative-cache entries (store empty-offer lookups briefly).
- [ ] Add cache observability (`hit/miss/stale/error`, p50/p95 latency delta, token/cost saved).
- [ ] Align pricing cache behavior across API/web/iOS (same effective TTL policy and stale-while-revalidate behavior).

### Phase 2 (IMPLEMENT_LATER)

- [ ] Add reranker score cache (candidate-set hash + query context + model version).
- [ ] Add retrieval-debug endpoint cache (`/api/v1/retrieval/search`).
- [ ] Add discovery (Gemini search) cache per `crop x region`.
- [ ] Add ingestion embedding cache by `contentHash + embedding model`.
- [ ] Add parsed-document cache for scraped HTML/PDF by content hash.
- [ ] Add short TTL caches for expensive read aggregations (`get-product`, `list-products`, `list-recommendations`).
- [ ] Add admin discovery-status snapshot cache (30-60s).

### Phase 3 (SKIP_FOR_NOW unless cost pressure is high)

- [ ] Add final recommendation answer cache (exact-match only, strong guardrails).
- [ ] Add server-side presigned-view-url cache (small gain; client already caches).
- [ ] Add aggressive client-side API response caches for recommendation detail/list (risk of stale UI without proper invalidation).

## Full Use Case Matrix

| Area | Use Case | Status | Key | TTL | Invalidation | Notes |
|---|---|---|---|---|---|---|
| Recommendation pipeline | Query embedding reuse | `IMPLEMENT_NOW` | `hash(normalizedQuery + embeddingModel)` | 24h | embedding model change, KB major version bump | Removes repeated OpenAI embedding calls for similar symptom queries. |
| Recommendation pipeline | HyDE passage reuse | `IMPLEMENT_NOW` | `hash(normalizedQuery + crop + region + season + hydeModel)` | 6-24h | HyDE model/prompt version change | Cuts one Anthropic call per repeated context. |
| Recommendation pipeline | Retrieved candidate-set reuse | `IMPLEMENT_NOW` | `hash(effectiveQuery + crop + region + source filters + retrieval params + kbVersion)` | 10-60m | source ingest update (`lastScrapedAt`/version), retrieval logic version change | Biggest near-term latency/cost win for repeated diagnosis patterns. |
| Recommendation pipeline | Reranker score reuse | `IMPLEMENT_LATER` | `hash(candidateIds + feature vector + rerankerModelVersion)` | 1-6h | new deployed reranker model, source/topic boosts changed | Helps when SageMaker reranker is enabled and queries repeat. |
| Recommendation pipeline | Final recommendation output reuse | `SKIP_FOR_NOW` | `hash(canonicalInput + topChunkIds + model + promptVersion + kbVersion)` | 5-30m | feedback on recommendation, source update, prompt/model change | Safe only for exact match and strict provenance checks. |
| Recommendation pipeline | Low-confidence self-consistency replay reuse | `IMPLEMENT_LATER` | `hash(canonicalInput + topChunkIds + model)` | 1-6h | same as final output cache | Can avoid triple-generation on repeated low-confidence cases. |
| Retrieval API | `/api/v1/retrieval/search` result reuse | `IMPLEMENT_LATER` | `hash(query + crop + region + sourceTypes + limit + rankerVersion)` | 5-15m | retrieval version change, source ingestion | Good for admin/debug tools. |
| Pricing | Product pricing by `productId + region` | `EXISTS` | `productId + normalizedRegion` | 6h | TTL expiry | Server-side cache exists. |
| Pricing | Empty/no-offer pricing negative cache | `IMPLEMENT_NOW` | `productId + normalizedRegion + provider` | 15-60m | TTL expiry | Prevents repeated expensive grounded searches returning no data. |
| Pricing | Client-side pricing cache (web localStorage) | `EXISTS` | `productId + region` | 30m | TTL expiry/manual clear | Exists; TTL differs from API/iOS policy. |
| Pricing | Client-side pricing cache (iOS memory + UserDefaults) | `EXISTS` | `productId + region` | 6h | TTL expiry/manual clear | Exists and persists between launches. |
| Discovery | Gemini crop-region search reuse | `IMPLEMENT_LATER` | `hash(crop + region + promptVersion + model)` | 1-7d | rediscovery run, model/prompt change | Useful when retries/reruns hit same pair. |
| Ingestion | HTTP fetch conditional caching (ETag/Last-Modified) | `IMPLEMENT_LATER` | `url` + validators | source freshness window | upstream changed content (304/200) | Skip full parse/embed when unchanged. |
| Ingestion | Parsed HTML/PDF document reuse | `IMPLEMENT_LATER` | `hash(rawContent) + parserVersion` | long-lived | parser version change/content hash change | Avoid repeated parse/chunk on identical content. |
| Ingestion | LlamaParse PDF output reuse | `IMPLEMENT_LATER` | `hash(pdfBytes) + parser settings` | long-lived | PDF hash change/parser setting change | Significant cost reduction for stable PDFs. |
| Ingestion | Embedding reuse for chunk content | `IMPLEMENT_LATER` | `hash(chunkContent + embeddingModel)` | long-lived | embedding model change | High value at scale; chunk content repeats across rediscovery cycles. |
| Product API | Product detail aggregate response reuse | `IMPLEMENT_LATER` | `productId + userId` | 2-10m | related recommendation/product updates | Response includes joins and recommendation history; cache is straightforward. |
| Product API | Product compare response reuse | `IMPLEMENT_LATER` | `sorted(productIds) + userId` | 2-10m | product update/recommendation changes | Cheap win for repeated compare interactions. |
| Product API | Product list query reuse | `IMPLEMENT_LATER` | `hash(filters + sort + page + userId)` | 1-5m | product table updates | Helps browse-heavy usage. |
| Recommendation API | Recommendation list query reuse | `IMPLEMENT_LATER` | `hash(userId + search + sort + page + pageSize)` | 30-120s | new/deleted/updated recommendation | Useful with frequent mobile polling/refreshes. |
| Recommendation API | Recommendation detail reuse | `IMPLEMENT_LATER` | `recommendationId + userId` | 5-15m | feedback/revision/source linkage update | Single-record read with joins; medium value. |
| Media | Signed upload-view URL reuse (web) | `EXISTS` | `objectUrl` | signed URL TTL minus safety window | URL expiry | In-memory cache exists. |
| Media | Signed upload-view URL reuse (iOS) | `EXISTS` | `objectUrl` | signed URL TTL minus safety window | URL expiry | Actor-based in-memory cache exists. |
| Media | Server-side signed URL micro-cache | `SKIP_FOR_NOW` | `userId + objectUrl` | 1-5m | auth/session change, expiry | Limited benefit because clients already cache signed URLs. |
| Request dedupe | Input command idempotency | `EXISTS` | `userId + idempotencyKey` | durable | key reuse semantics | Prevents duplicate recommendation jobs for retry requests. |
| Worker dedupe | SQS duplicate delivery suppression | `EXISTS` | `jobId status` | job lifetime | status transition | Prevents reprocessing completed/in-flight jobs. |
| Admin | Discovery status snapshot reuse | `IMPLEMENT_LATER` | `hash(filters + page + pageSize)` | 30-60s | discovery/ingestion/model table changes | Reduces repeated heavy dashboard queries. |

## Guardrails (required for all new caches)

- Never serve cached recommendation outputs across users.
- Cache keys must include model/version-sensitive fields.
- Add explicit `cache_version` strings to every key namespace.
- Track source freshness/KB version in retrieval-related cache keys.
- Support kill switches by env flag per cache (`*_CACHE_ENABLED=false`).
- Emit per-cache metrics: `hit`, `miss`, `stale`, `error`, `eviction`.

## Suggested Storage Design

- Use Postgres cache tables first (fits current infra and operational model).
- Keep payloads JSONB and index by key hash + expiry.
- Start with lazy TTL invalidation (`WHERE expiresAt > NOW()` + opportunistic cleanup).
- Add periodic cleanup worker only if row growth becomes material.

## Proposed Initial Tables

- `QueryEmbeddingCache`  
  key: `keyHash`, fields: `model`, `embedding(vector)`, `expiresAt`, `createdAt`
- `HydePassageCache`  
  key: `keyHash`, fields: `model`, `passageText`, `expiresAt`, `createdAt`
- `RetrievalResultCache`  
  key: `keyHash`, fields: `query`, `candidateChunks(jsonb)`, `kbVersion`, `expiresAt`, `createdAt`
- `PricingSearchCache` (extend current pricing cache semantics)  
  key: `productId + region`, fields: `pricing(jsonb)`, `isEmpty`, `expiresAt`, `cachedAt`

## Rollout Order

1. Query embedding cache.
2. HyDE cache.
3. Retrieval candidate cache.
4. Negative pricing cache.
5. Observability and hit-rate dashboards.
6. Reranker cache (if SageMaker endpoint is active and query volume justifies it).
