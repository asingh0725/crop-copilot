ALTER TABLE "Feedback"
ADD COLUMN "detailedCompletedAt" TIMESTAMP(3);

UPDATE "Feedback"
SET "detailedCompletedAt" = COALESCE("updatedAt", "createdAt")
WHERE "detailedCompletedAt" IS NULL
  AND (
    "accuracy" IS NOT NULL
    OR (
      jsonb_typeof("issues") = 'array'
      AND jsonb_array_length("issues") > 0
    )
  );
