# E2E Implementation Gap Audit (2026-02-26)

## Scope
This audit tracks true feature-completion gaps for the monetization + premium roadmap (not QA checklist execution gaps).

## Status Legend
- `DONE`: implemented end-to-end in code paths.
- `PARTIAL`: implemented in core flow, but missing required pieces to be production-complete.
- `MISSING`: not implemented in meaningful form.

## Feature Matrix

1) `$29/$45 tiers`, monthly limits, usage metering, overage charge  
Status: `DONE`  
Evidence:
- `apps/api/src/lib/subscription-plans.ts`
- `apps/api/src/lib/entitlements.ts`
- `apps/api/src/handlers/create-input.ts`
- `apps/web/app/(app)/settings/billing/page.tsx`

2) Stripe checkout + portal + webhook (subscription flows)  
Status: `DONE`  
Evidence:
- `apps/api/src/handlers/create-subscription-checkout.ts`
- `apps/api/src/handlers/create-subscription-portal.ts`
- `apps/api/src/handlers/billing-webhook.ts`

3) Pro-only async premium enrichment (non-blocking)  
Status: `DONE`  
Evidence:
- `apps/api/src/workers/process-recommendation-job.ts`
- `apps/api/src/workers/process-premium-enrichment-job.ts`
- `apps/api/src/premium/enrichment-service.ts`

4) Premium advisory risk review + cost + spray windows + report payload  
Status: `PARTIAL`  
What exists:
- risk checks, cost analysis, spray windows, generated report HTML string.
Gaps:
- no hosted shareable report URL/PDF generation path.
- web presents raw preview only (no 1-tap share/open workflow).
Evidence:
- `apps/api/src/premium/report-builder.ts`
- `apps/api/src/handlers/create-application-report.ts`
- `apps/web/app/(app)/recommendations/[id]/page.tsx`

5) Credit pack purchase (`$12` for 10 recs)  
Status: `PARTIAL`  
What exists:
- UI displays pack pricing.
Gap:
- no checkout API for one-time credit pack purchase and no webhook-to-ledger grant path.
Evidence:
- `apps/web/app/(app)/settings/billing/page.tsx` (link routes to contact page)
- no `credits/checkout` handler or price mapping in `apps/api/src/lib/stripe-billing.ts`

6) Detailed feedback reward (`$0.05`, capped monthly)  
Status: `DONE`  
Evidence:
- `apps/api/src/handlers/submit-feedback.ts`
- `apps/api/src/lib/entitlements.ts`

7) Referral program (`$10/$10 after first paid cycle`)  
Status: `PARTIAL`  
What exists:
- schema/tables + reward helper.
Gaps:
- no referral code generation/redeem API.
- reward helper is not invoked by webhook or signup/checkout completion flow.
Evidence:
- `apps/api/sql/007_premium_billing_foundation.sql`
- `apps/api/src/lib/entitlements.ts` (`applyReferralRewards`)
- no matching referral routes in `infra/lib/stacks/api-runtime-stack.ts`

8) Spray-window alerts as push reminders  
Status: `PARTIAL`  
What exists:
- spray windows are computed and stored.
- push device registration endpoint exists.
- iOS now requests push permission + registers for remote notifications.
Gaps:
- no reminder dispatcher worker/schedule that sends alerts from stored windows.
- no reminder idempotency/throttling data model.
Evidence:
- `apps/api/src/premium/weather-spray-windows.ts`
- `apps/api/src/handlers/register-push-device.ts`
- `apps/ios/CropCopilot/App/AppDelegate.swift`
- `infra/lib/stacks/api-runtime-stack.ts` (no spray reminder schedule)

9) OpenWeather cost controls (free calls, hard cap, cost metering)  
Status: `MISSING`  
What exists:
- env vars are wired.
Gap:
- runtime logic does not enforce daily free-call counters/hard cap or log cost ledger.
Evidence:
- `infra/lib/stacks/api-runtime-stack.ts` (OPENWEATHER_* env vars)
- `apps/api/src/premium/weather-spray-windows.ts` (no call accounting/cap check)

10) Admin v1/v2/v3 environment switcher  
Status: `DONE`  
Evidence:
- `apps/web/lib/admin-version-targets.ts`
- `apps/web/app/(app)/admin/page.tsx`
- `apps/web/app/(app)/admin/discovery/page.tsx`

11) Contracted events (`subscription.updated`, `credits.updated`)  
Status: `PARTIAL`  
What exists:
- schemas defined.
Gap:
- no publishers in billing/credits mutation paths.
Evidence:
- `packages/contracts/src/events.ts`
- no emitters in `apps/api/src/handlers/billing-webhook.ts` or `apps/api/src/lib/entitlements.ts`

12) Test coverage for new billing/premium handlers  
Status: `MISSING`  
Gap:
- no direct tests for new subscription/usage/premium/report/push handlers.
Evidence:
- absence in `apps/api/src/**/*.test.ts`

## Immediate Implementation Backlog (Priority Order)

1. Add credit-pack checkout + webhook credit grant (idempotent).
2. Add referral API + payout trigger on first paid cycle.
3. Add spray reminder dispatch worker + schedule + dedupe table.
4. Add report publish path (S3 HTML URL, optional PDF URL) + 1-tap open/share on web.
5. Add OpenWeather call metering/cap enforcement + cost telemetry.
6. Emit `subscription.updated` and `credits.updated` events on state changes.
7. Add API tests for all new handlers and key failure modes.
