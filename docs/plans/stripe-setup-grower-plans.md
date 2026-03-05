# Stripe Setup Runbook: Grower ($29), Grower Pro ($45), Credit Pack ($12)

## 1. Pricing Objects to Create
Create these in Stripe (Test mode first, then Live mode):

1. Product: `Grower`
- Type: recurring subscription
- Price: `$29.00`
- Billing interval: monthly
- Currency: USD
- Suggested metadata:
  - `plan_id=grower`
  - `included_recommendations=30`

2. Product: `Grower Pro`
- Type: recurring subscription
- Price: `$45.00`
- Billing interval: monthly
- Currency: USD
- Suggested metadata:
  - `plan_id=grower_pro`
  - `included_recommendations=40`

3. Product: `Grower Free`
- Type: recurring subscription
- Price: `$0.00`
- Billing interval: monthly
- Currency: USD
- Suggested metadata:
  - `plan_id=grower_free`
  - `included_recommendations=3`

4. Product: `Recommendation Credit Pack (10)`
- Type: one-time
- Price: `$12.00`
- Currency: USD
- Suggested metadata:
  - `credit_pack=true`
  - `credits=10`
  - `effective_overage_usd=1.20`

## 2. Customer Portal
Enable Stripe Billing Portal and allow:
- Subscription plan switching between Grower and Grower Pro.
- Payment method updates.
- Subscription cancel at period end.

Set portal return URL to:
- `https://<your-domain>/settings/billing`

## 3. Webhook Setup
Configure webhook endpoint to your billing webhook route:
- `POST https://<api-domain>/api/v1/billing/webhook`

Recommended events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Important:
- Backend webhook handler already ingests raw Stripe webhook JSON and verifies signatures via `STRIPE_WEBHOOK_SECRET`.
- Ensure API Gateway/Lambda passes the raw body unchanged to avoid signature verification failures.

## 4. Environment Variables
Set these in runtime:
- `ALLOW_BILLING_SIMULATION=false`
- `STRIPE_SECRET_KEY=<sk_test_... or sk_live_...>` (needed for direct Stripe API session creation)
- `STRIPE_PUBLISHABLE_KEY=<pk_test_... or pk_live_...>`
- `STRIPE_WEBHOOK_SECRET=<whsec_...>`
- `BILLING_PORTAL_RETURN_URL=https://<your-domain>/settings/billing`
- `STRIPE_PRICE_GROWER_FREE=<price_...>`
- `STRIPE_PRICE_GROWER=<price_...>`
- `STRIPE_PRICE_GROWER_PRO=<price_...>`

Fallback compatibility vars (optional):
- `STRIPE_CHECKOUT_URL_BASE=<your-checkout-url-router>`
- `STRIPE_PORTAL_URL_BASE=<your-portal-url-router>`

## 5. Current Integration Mode
Current implementation now supports:
- Direct Stripe Checkout Session creation in `create-subscription-checkout`.
- Direct Stripe Billing Portal session creation in `create-subscription-portal`.
- Direct Stripe webhook signature verification and event mapping in `billing-webhook`.
- Simulation mode fallback when Stripe env is not configured and `ALLOW_BILLING_SIMULATION=true`.

## 6. What I Need If You Want Me To Set It Up For You
If you want me to do the setup directly, share:

1. Access and mode
- Stripe account access confirmation.
- Which mode to configure now: `test`, `live`, or both.

2. Secrets/keys
- Either:
  - A restricted Stripe secret key with permissions for Products, Prices, Checkout Sessions, Billing Portal, Webhooks,
- Or:
  - Dashboard access where I can create objects manually.

3. URLs
- Success URL after checkout (usually `/settings/billing`).
- Cancel URL after checkout.
- Billing portal return URL.
- API webhook URL.

4. Billing policy confirmations
- Proration on mid-cycle upgrades: yes/no.
- Trial period: none or specific days.
- Tax handling: Stripe Tax on/off.
- Statement descriptor text.

5. Optional
- Whether credit pack purchase should auto-post `CreditLedger` immediately via webhook mapping.

## 7. Suggested Go-Live Order
1. Configure all products/prices in Stripe Test mode.
2. Wire webhook endpoint + verify event delivery.
3. Validate end-to-end with manual QA checklist.
4. Repeat in Live mode with live keys.
5. Flip `ALLOW_BILLING_SIMULATION=false` in production.
