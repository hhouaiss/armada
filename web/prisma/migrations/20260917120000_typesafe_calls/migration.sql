CREATE TABLE IF NOT EXISTS "typesafe_calls" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'jev-latest',
    "status" TEXT NOT NULL,
    "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agentName" TEXT,
    "requestedValue" TEXT,
    "resolvedValue" TEXT,
    "confidence" DOUBLE PRECISION,
    "answers" JSONB,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "error" TEXT,
    "taskPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "typesafe_calls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "typesafe_calls_storeId_createdAt_idx" ON "typesafe_calls"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "typesafe_calls_feature_createdAt_idx" ON "typesafe_calls"("feature", "createdAt");
