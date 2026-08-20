-- MCP Connector Platform v2
-- Existing `integrations` rows intentionally remain untouched. The application
-- imports them as disabled/review-required connections after the owner chooses
-- a store, preventing an unsafe automatic widening of access.

CREATE TABLE "connector_definitions" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "publisher" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'armada',
  "registryName" TEXT,
  "version" TEXT,
  "digest" TEXT,
  "transport" TEXT NOT NULL DEFAULT 'streamable-http',
  "authMode" TEXT NOT NULL DEFAULT 'oauth-mcp',
  "verificationTier" TEXT NOT NULL DEFAULT 'community',
  "category" TEXT NOT NULL DEFAULT 'productivity',
  "logo" TEXT,
  "endpoint" TEXT,
  "packageConfig" JSONB,
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "agentIds" JSONB NOT NULL DEFAULT '[]',
  "toolMetadata" JSONB NOT NULL DEFAULT '[]',
  "riskOverrides" JSONB NOT NULL DEFAULT '{}',
  "isBeta" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connector_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_connections" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "connectorDefinitionId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "accountEmail" TEXT,
  "credentials" JSONB NOT NULL,
  "grantedScopes" JSONB NOT NULL DEFAULT '[]',
  "discoveredTools" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'review_required',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "lastConnectedAt" TIMESTAMP(3),
  "lastHealthAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_connection_grants" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_connection_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_tool_policies" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'approval',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_tool_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_audit_events" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "connectionId" TEXT,
  "agentId" TEXT,
  "eventType" TEXT NOT NULL,
  "toolName" TEXT,
  "status" TEXT NOT NULL,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connector_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_oauth_states" (
  "id" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "connectorSlug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "redirectTo" TEXT NOT NULL DEFAULT '/integrations',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connector_oauth_states_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operations"
  ADD COLUMN "connectionId" TEXT,
  ADD COLUMN "connectorSlug" TEXT,
  ADD COLUMN "accountLabel" TEXT,
  ADD COLUMN "toolClassification" TEXT,
  ADD COLUMN "auditSummary" JSONB;

ALTER TABLE "approval_requests"
  ADD COLUMN "connectionId" TEXT,
  ADD COLUMN "connectorSlug" TEXT,
  ADD COLUMN "accountLabel" TEXT,
  ADD COLUMN "toolClassification" TEXT,
  ADD COLUMN "auditSummary" JSONB;

CREATE UNIQUE INDEX "connector_definitions_slug_key" ON "connector_definitions"("slug");
CREATE INDEX "connector_definitions_category_isActive_idx" ON "connector_definitions"("category", "isActive");
CREATE UNIQUE INDEX "app_connections_storeId_connectorDefinitionId_label_key" ON "app_connections"("storeId", "connectorDefinitionId", "label");
CREATE INDEX "app_connections_userId_storeId_status_idx" ON "app_connections"("userId", "storeId", "status");
CREATE INDEX "app_connections_connectorDefinitionId_status_idx" ON "app_connections"("connectorDefinitionId", "status");
CREATE UNIQUE INDEX "agent_connection_grants_agentId_connectionId_key" ON "agent_connection_grants"("agentId", "connectionId");
CREATE INDEX "agent_connection_grants_connectionId_idx" ON "agent_connection_grants"("connectionId");
CREATE UNIQUE INDEX "agent_tool_policies_agentId_connectionId_toolName_key" ON "agent_tool_policies"("agentId", "connectionId", "toolName");
CREATE INDEX "agent_tool_policies_connectionId_idx" ON "agent_tool_policies"("connectionId");
CREATE INDEX "connector_audit_events_storeId_createdAt_idx" ON "connector_audit_events"("storeId", "createdAt");
CREATE INDEX "connector_audit_events_connectionId_createdAt_idx" ON "connector_audit_events"("connectionId", "createdAt");
CREATE UNIQUE INDEX "connector_oauth_states_nonceHash_key" ON "connector_oauth_states"("nonceHash");
CREATE INDEX "connector_oauth_states_expiresAt_consumedAt_idx" ON "connector_oauth_states"("expiresAt", "consumedAt");
CREATE INDEX "operations_connectionId_startedAt_idx" ON "operations"("connectionId", "startedAt");
CREATE INDEX "approval_requests_connectionId_createdAt_idx" ON "approval_requests"("connectionId", "createdAt");

ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_connectorDefinitionId_fkey" FOREIGN KEY ("connectorDefinitionId") REFERENCES "connector_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_connection_grants" ADD CONSTRAINT "agent_connection_grants_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_connection_grants" ADD CONSTRAINT "agent_connection_grants_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "app_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_tool_policies" ADD CONSTRAINT "agent_tool_policies_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_tool_policies" ADD CONSTRAINT "agent_tool_policies_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "app_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_audit_events" ADD CONSTRAINT "connector_audit_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_audit_events" ADD CONSTRAINT "connector_audit_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "app_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operations" ADD CONSTRAINT "operations_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "app_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "app_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
