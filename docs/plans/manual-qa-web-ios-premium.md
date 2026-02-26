# Manual QA Checklist: Premium Advisory Risk Review + Billing (Web and iOS)

## 1. Scope
This checklist validates the following shipped behavior:
- Grower ($29) and Grower Pro ($45) subscription surfaces.
- Metered recommendation usage and billing/usage UI.
- Non-blocking premium enrichment on recommendation detail.
- Detailed feedback credit reward behavior.
- Optional planning inputs (acreage/date/lat/lon) in diagnose flow.
- iOS premium insights rendering and push token registration.

## 2. Test Environment Prerequisites
- Database migrations applied:
  - `apps/api/sql/007_premium_billing_foundation.sql`
  - `apps/api/sql/008_advisory_risk_review_states.sql`
- API env is configured:
  - `ENABLE_PREMIUM_ENRICHMENT=true`
  - `ENABLE_USAGE_GUARD=true` (for quota enforcement tests)
  - `ALLOW_BILLING_SIMULATION=true` (unless testing real Stripe)
  - `OPENWEATHER_API_KEY` populated for real spray-window checks
- Web env configured:
  - `NEXT_PUBLIC_API_GATEWAY_URL` points to runtime API
  - Optional admin version switch URLs for `/admin` and `/admin/discovery`:
    - `ADMIN_TEST_V1_API_GATEWAY_URL`
    - `ADMIN_TEST_V2_API_GATEWAY_URL`
    - `ADMIN_TEST_V3_API_GATEWAY_URL`
- iOS env configured:
  - `API_RUNTIME_BASE_URL` points to runtime API

## 3. Test Accounts
Prepare at least:
- User A: Grower Free (`grower_free` plan)
- User B: Grower (`grower` plan)
- User C: Grower Pro (`grower_pro` plan)
- User D: exhausted credits user (for quota/overage testing)

Recommended setup SQL:
- Set UserSubscription rows explicitly for each user.
- Seed credit ledger rows for credit consumption/reward checks.

## 4. Web Checklist

### 4.1 Settings and Navigation
- [ ] Settings page shows `Billing & Usage` tile.
- [ ] Sidebar includes `Billing` nav item.
- [ ] `Settings -> Billing & Usage` route loads without errors.

### 4.2 Billing & Usage Page
- [ ] Current plan name, status, renewal date render.
- [ ] Included monthly recommendations match plan:
  - Grower = 30
  - Grower Pro = 40
- [ ] Usage progress bar reflects `used/included` correctly.
- [ ] Credit balance displays correctly (including decimals).
- [ ] Overage price displays as configured.
- [ ] Grower account shows `Upgrade to Grower Pro` button.
- [ ] Pro account does not show upgrade button.
- [ ] `Manage Billing` button returns portal URL (or simulation URL).
- [ ] Failure state shows retry CTA if subscription/usage fetch fails.

### 4.3 Checkout and Portal Actions
- [ ] Grower -> `Upgrade to Grower Pro` triggers `/api/v1/subscription/checkout`.
- [ ] With simulation enabled, plan updates to Pro after redirect.
- [ ] With real Stripe path enabled, checkout URL redirects correctly.
- [ ] `Manage Billing` opens portal URL.

### 4.4 Diagnose Input (Photo + Lab)
- [ ] Photo diagnose form accepts optional:
  - Field acreage
  - Planned application date
  - Field latitude
  - Field longitude
- [ ] Lab diagnose form accepts same optional fields.
- [ ] Submission succeeds with and without optional fields.
- [ ] Invalid lat/lon or invalid acreage are blocked by UI validation.

### 4.5 Recommendation Detail: Premium Cards
Use both Grower and Pro users.

- [ ] Grower sees premium locked/upgrade messaging (`not_available`).
- [ ] Pro sees `queued/processing` state while premium worker runs.
- [ ] Pro sees `ready` state with:
  - Risk review badge
  - Risk checks list
  - Cost summary (per-acre + whole-field)
  - Spray windows list
  - Application prep packet preview when available
- [ ] Failed state (`failed`) renders failure reason.
- [ ] Input information section renders optional planning fields when present.

### 4.6 Feedback Reward Flow
- [ ] Recommendation detail triggers feedback modal flow.
- [ ] Submitting detailed feedback with qualifying detail grants reward once.
- [ ] Success toast appears with `$0.05` credit message.
- [ ] Re-submitting same recommendation detailed feedback does not duplicate reward.
- [ ] Monthly cap behavior enforced at `$2.50` (no rewards beyond cap).

### 4.7 Usage Guard / Limits
With `ENABLE_USAGE_GUARD=true`.

- [ ] User under quota can create input.
- [ ] User at quota and without credits receives payment-required/blocked response.
- [ ] User at quota with sufficient credit can create input.
- [ ] Overage deduction appears in `CreditLedger` with `recommendation_overage`.

### 4.8 Regression: Existing Recommendation Flow
- [ ] Base recommendation still returns without waiting for premium.
- [ ] Recommendations list/detail pages still load for existing recommendations.
- [ ] Existing feedback GET/POST still works for non-premium users.

## 5. iOS Checklist

### 5.1 Diagnose Forms
- [ ] Photo diagnose includes optional acreage/date/lat/lon fields.
- [ ] Lab diagnose includes optional acreage/date/lat/lon fields.
- [ ] Requests include these fields in payload when entered.

### 5.2 Recommendation Result Screen
- [ ] New `Premium Insights` collapsible section appears.
- [ ] `not_available` state shows Pro upsell message.
- [ ] `queued/processing` state shows progress UX.
- [ ] `failed` state shows error message.
- [ ] `ready` state shows:
  - Risk review
  - Cost summary
  - Risk checks
  - Spray windows
  - Report link buttons (HTML/PDF) when present

### 5.3 Push Registration
- [ ] App obtains APNS token on permission grant.
- [ ] App calls `/api/v1/push/register`.
- [ ] `PushDevice` row upserts with latest token and app version.

### 5.4 Feedback Modal Flow
- [ ] Basic feedback modal appears when expected.
- [ ] Detailed feedback modal appears and submits successfully.
- [ ] Outcome follow-up modal appears based on timing rules.
- [ ] Existing feedback behavior remains stable after premium additions.

### 5.5 iOS Regression
- [ ] No crash navigating diagnose -> result -> product detail.
- [ ] Existing recommendations list and detail still load.
- [ ] Sign-in and profile pages unaffected.

## 6. Optional API Spot Checks (Manual)
Run with valid bearer token.

- [ ] `GET /api/v1/subscription` returns plan snapshot.
- [ ] `GET /api/v1/usage` returns usage and credit balance.
- [ ] `GET /api/v1/recommendations/{id}` includes `premium` object.
- [ ] `GET /api/v1/recommendations/{id}/premium` returns state payload.
- [ ] `POST /api/v1/recommendations/{id}/premium` queues premium refresh.
- [ ] `POST /api/v1/recommendations/{id}/report` returns report or `202` while pending.

## 7. Exit Criteria
- [ ] All must-pass checklist items complete.
- [ ] No P0/P1 defects open for billing, premium decision visibility, or core recommendation flow.
- [ ] No regression in base recommendation latency/success behavior observed in smoke run.
