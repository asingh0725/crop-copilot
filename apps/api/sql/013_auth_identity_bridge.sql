-- Auth identity bridge for provider-agnostic local user resolution.
-- This keeps app data keyed to a stable local user UUID even when auth
-- providers change (Supabase -> Cognito, or future migrations).

CREATE TABLE IF NOT EXISTS "AuthIdentity" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'cognito')),
  subject TEXT NOT NULL,
  email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  "lastUsedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identity_user
  ON "AuthIdentity" ("userId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_auth_identity_email
  ON "AuthIdentity" (LOWER(email))
  WHERE email IS NOT NULL;

INSERT INTO "AuthIdentity" (
  "userId",
  provider,
  subject,
  email,
  metadata,
  "lastUsedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  id,
  'supabase',
  id,
  NULLIF(LOWER(email), ''),
  '{"backfilled":true}'::jsonb,
  NOW(),
  COALESCE("updatedAt", NOW()),
  NOW()
FROM "User"
ON CONFLICT (provider, subject) DO UPDATE
SET
  email = COALESCE(EXCLUDED.email, "AuthIdentity".email),
  "lastUsedAt" = NOW(),
  "updatedAt" = NOW();
