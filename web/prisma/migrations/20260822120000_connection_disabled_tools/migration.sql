-- Per-connection tool opt-out: tools listed here are discovered and shown in the
-- dashboard, but never registered into any agent's tool registry.
ALTER TABLE "app_connections" ADD COLUMN IF NOT EXISTS "disabledTools" JSONB NOT NULL DEFAULT '[]';
