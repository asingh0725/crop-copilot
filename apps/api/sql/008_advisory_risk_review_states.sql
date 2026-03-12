-- Migrate premium compliance states to advisory risk review states.

UPDATE "RecommendationPremiumInsight"
SET "complianceDecision" = CASE "complianceDecision"
  WHEN 'pass' THEN 'clear_signal'
  WHEN 'block' THEN 'potential_conflict'
  WHEN 'review' THEN 'needs_manual_verification'
  ELSE "complianceDecision"
END
WHERE "complianceDecision" IN ('pass', 'block', 'review');

UPDATE "ComplianceAuditLog"
SET result = CASE result
  WHEN 'pass' THEN 'clear_signal'
  WHEN 'block' THEN 'potential_conflict'
  WHEN 'review' THEN 'needs_manual_verification'
  ELSE result
END
WHERE result IN ('pass', 'block', 'review');

ALTER TABLE "RecommendationPremiumInsight"
  DROP CONSTRAINT IF EXISTS "RecommendationPremiumInsight_complianceDecision_check";

ALTER TABLE "RecommendationPremiumInsight"
  ADD CONSTRAINT "RecommendationPremiumInsight_complianceDecision_check"
  CHECK (
    "complianceDecision" IS NULL OR "complianceDecision" IN (
      'clear_signal',
      'potential_conflict',
      'needs_manual_verification'
    )
  );

ALTER TABLE "ComplianceAuditLog"
  DROP CONSTRAINT IF EXISTS "ComplianceAuditLog_result_check";

ALTER TABLE "ComplianceAuditLog"
  ADD CONSTRAINT "ComplianceAuditLog_result_check"
  CHECK (
    result IN (
      'clear_signal',
      'potential_conflict',
      'needs_manual_verification'
    )
  );
