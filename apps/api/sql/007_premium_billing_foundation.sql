-- Premium monetization + compliance foundation tables
-- This migration is additive and safe to run multiple times.

CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
  id TEXT PRIMARY KEY,
  "displayName" TEXT NOT NULL,
  "priceUsd" NUMERIC(10,2) NOT NULL,
  "includedRecommendations" INT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Input"
  ADD COLUMN IF NOT EXISTS "fieldAcreage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "plannedApplicationDate" DATE,
  ADD COLUMN IF NOT EXISTS "fieldLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fieldLongitude" DOUBLE PRECISION;

INSERT INTO "SubscriptionPlan" (id, "displayName", "priceUsd", "includedRecommendations")
VALUES
  ('grower_free', 'Grower Free', 0.00, 3),
  ('grower', 'Grower', 29.00, 30),
  ('grower_pro', 'Grower Pro', 45.00, 40)
ON CONFLICT (id) DO UPDATE
SET
  "displayName" = EXCLUDED."displayName",
  "priceUsd" = EXCLUDED."priceUsd",
  "includedRecommendations" = EXCLUDED."includedRecommendations",
  "updatedAt" = NOW();

CREATE TABLE IF NOT EXISTS "UserSubscription" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL REFERENCES "SubscriptionPlan"(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "currentPeriodStart" TIMESTAMPTZ NOT NULL,
  "currentPeriodEnd" TIMESTAMPTZ NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId")
);

CREATE INDEX IF NOT EXISTS idx_user_subscription_plan
  ON "UserSubscription" ("planId", status);

CREATE TABLE IF NOT EXISTS "UsageLedger" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "recommendationId" TEXT,
  "inputId" UUID,
  "usageType" TEXT NOT NULL DEFAULT 'recommendation_generated',
  "usageMonth" TEXT NOT NULL,
  units INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "recommendationId", "usageType")
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_user_month
  ON "UsageLedger" ("userId", "usageMonth", "usageType");

CREATE TABLE IF NOT EXISTS "CreditLedger" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "amountUsd" NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  "recommendationId" TEXT,
  "referralId" UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user
  ON "CreditLedger" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "Referral" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrerUserId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'voided')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  UNIQUE ("referredUserId")
);

CREATE TABLE IF NOT EXISTS "ReferralReward" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "referralId" UUID NOT NULL REFERENCES "Referral"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "amountUsd" NUMERIC(10,2) NOT NULL,
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("referralId", "userId")
);

CREATE TABLE IF NOT EXISTS "RecommendationPremiumInsight" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recommendationId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('not_available', 'queued', 'processing', 'ready', 'failed')),
  "complianceDecision" TEXT
    CHECK (
      "complianceDecision" IN (
        'clear_signal',
        'potential_conflict',
        'needs_manual_verification'
      )
    ),
  checks JSONB NOT NULL DEFAULT '[]',
  "costAnalysis" JSONB,
  "sprayWindows" JSONB NOT NULL DEFAULT '[]',
  report JSONB,
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premium_insight_user_status
  ON "RecommendationPremiumInsight" ("userId", status, "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "ComplianceAuditLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recommendationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "checkId" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "sourceVersion" TEXT,
  "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
  result TEXT NOT NULL CHECK (
    result IN (
      'clear_signal',
      'potential_conflict',
      'needs_manual_verification'
    )
  ),
  message TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_rec
  ON "ComplianceAuditLog" ("recommendationId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "PushDevice" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  "deviceToken" TEXT NOT NULL,
  "appVersion" TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("deviceToken")
);

CREATE INDEX IF NOT EXISTS idx_push_device_user
  ON "PushDevice" ("userId", platform, status);
