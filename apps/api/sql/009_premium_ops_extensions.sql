-- Premium operations extensions:
-- 1) OpenWeather daily call metering + cost rollup
-- 2) Spray reminder dispatch deduplication
-- 3) Credit-pack idempotency for Stripe webhook retries

CREATE TABLE IF NOT EXISTS "WeatherApiUsageDaily" (
  provider TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "callsMade" INT NOT NULL DEFAULT 0,
  "paidCalls" INT NOT NULL DEFAULT 0,
  "costUsd" NUMERIC(12,6) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, "usageDate")
);

CREATE TABLE IF NOT EXISTS "SprayReminderDispatch" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ NOT NULL,
  "windowEnd" TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push')),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}',
  "dispatchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "recommendationId", "windowStart", channel)
);

CREATE INDEX IF NOT EXISTS idx_spray_reminder_dispatch_window
  ON "SprayReminderDispatch" ("windowStart", "dispatchedAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_pack_checkout_session_unique
  ON "CreditLedger" ((metadata->>'checkoutSessionId'))
  WHERE reason = 'credit_pack_purchase';
