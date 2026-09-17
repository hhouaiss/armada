ALTER TABLE "typesafe_calls" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "typesafe_calls" ADD COLUMN IF NOT EXISTS "outputPreview" TEXT;
ALTER TABLE "typesafe_calls" ADD COLUMN IF NOT EXISTS "evidence" JSONB;
CREATE INDEX IF NOT EXISTS "typesafe_calls_agentId_feature_createdAt_idx" ON "typesafe_calls"("agentId", "feature", "createdAt");
