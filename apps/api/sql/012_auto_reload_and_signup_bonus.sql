-- Migration 012: Auto-reload config + signup bonus support
-- Adds UserAutoReloadConfig table for per-user auto-reload settings.
-- No schema changes are needed for signup_bonus or auto_reload credit reasons
-- since CreditLedger.reason is a free-form text column.

CREATE TABLE IF NOT EXISTS "UserAutoReloadConfig" (
  "userId"          text            PRIMARY KEY
                                    REFERENCES "UserSubscription"("userId")
                                    ON DELETE CASCADE,
  "enabled"         boolean         NOT NULL DEFAULT false,
  "thresholdUsd"    numeric(10,2)   NOT NULL DEFAULT 5.00,
  "reloadPackId"    text            NOT NULL DEFAULT 'pack_10',
  "monthlyLimitUsd" numeric(10,2)   NOT NULL DEFAULT 60.00,
  "updatedAt"       timestamptz     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "UserAutoReloadConfig" IS
  'Per-user auto-reload settings. When enabled, the system will attempt an off-session '
  'Stripe charge when the credit balance drops below thresholdUsd, subject to the '
  'monthlyLimitUsd cap on total auto-reload spend per calendar month.';
