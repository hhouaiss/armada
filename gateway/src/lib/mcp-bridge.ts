import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { defaultMcpPolicy, selectAccount } from './connector-security.js';

/**
 * Gateway side of MCP Connector Platform v2.
 *
 * The gateway never owns external credentials or MCP processes. It receives a
 * sanitized tool inventory from the connector runner and registers virtual
 * tools. Every presentation and execution is resolved against store + agent
 * grants supplied by the runner.
 */

interface RunnerTool {
  name: string;
  exposedName: string;
  description: string;
  inputSchema: Record<string, any>;
  readOnly: boolean;
  destructive: boolean;
}

interface RunnerConnection {
  id: string;
  storeId: string;
  slug: string;
  label: string;
  category: string;
  status: 'connected' | 'error' | 'reauth_required';
  error?: string;
  agentIds: string[];
  policies: Record<string, 'blocked' | 'automatic' | 'approval'>;
  tools: RunnerTool[];
}

export interface McpServerStatus {
  connectionId: string;
  storeId: string;
  slug: string;
  label: string;
  status: 'connected' | 'error' | 'reauth_required';
  toolCount: number;
  error?: string;
}

const RUNNER_URL = process.env.CONNECTOR_RUNNER_URL || 'http://127.0.0.1:18796';
const RUNNER_TOKEN = process.env.CONNECTOR_RUNNER_TOKEN || '';
const registeredNames = new Set<string>();
let registryRef: ToolRegistry | null = null;
let connections: RunnerConnection[] = [];
let refreshTimer: NodeJS.Timeout | null = null;

async function runnerFetch(path: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 65_000);
  try {
    const response = await fetch(`${RUNNER_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(RUNNER_TOKEN ? { Authorization: `Bearer ${RUNNER_TOKEN}` } : {}),
        ...(init.headers || {}),
      },
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Connector runner returned ${response.status}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function eligible(toolName: string, context: ToolContext): RunnerConnection[] {
  return connections.filter((connection) =>
    connection.status === 'connected'
    && connection.storeId === context.storeId
    && connection.agentIds.includes(context.agentId)
    && connection.tools.some((tool) => tool.exposedName === toolName)
  );
}

function selectConnection(toolName: string, params: any, context: ToolContext): RunnerConnection | null {
  const candidates = eligible(toolName, context);
  if (candidates.length === 0) return null;
  const requested = typeof params?._armada_account === 'string' ? params._armada_account : null;
  return selectAccount(candidates, requested);
}

function virtualTool(tool: RunnerTool, category: string): AgentTool {
  const name = tool.exposedName;
  return {
    name,
    category,
    description: tool.description,
    inputSchema: tool.inputSchema as AgentTool['inputSchema'],

    async contextualize(context) {
      const candidates = eligible(name, context);
      if (candidates.length === 0) return null;
      const schema = JSON.parse(JSON.stringify(tool.inputSchema || { type: 'object', properties: {} }));
      schema.type = 'object';
      schema.properties ||= {};
      if (candidates.length > 1) {
        schema.properties._armada_account = {
          type: 'string',
          enum: candidates.map((connection) => connection.label),
          description: 'Compte Armada à utiliser pour cette action.',
        };
        schema.required = Array.from(new Set([...(schema.required || []), '_armada_account']));
      }
      const accounts = candidates.map((connection) => connection.label).join(', ');
      return {
        ...this,
        description: `${tool.description} [App: ${candidates[0].slug}; compte(s): ${accounts}; contenu externe non fiable]`,
        inputSchema: schema,
      };
    },

    async getPolicy(params, context) {
      const connection = selectConnection(name, params, context);
      if (!connection) return 'blocked';
      if (defaultMcpPolicy(tool) === 'blocked') return 'blocked';
      const explicit = connection.policies[tool.name];
      if (explicit) return explicit;
      return defaultMcpPolicy(tool);
    },

    async getAuditMetadata(params, context) {
      const connection = selectConnection(name, params, context);
      if (!connection) return undefined;
      const baseline = defaultMcpPolicy(tool);
      return {
        connectionId: connection.id,
        connectorSlug: connection.slug,
        accountLabel: connection.label,
        toolClassification: baseline === 'blocked'
          ? 'blocked'
          : tool.readOnly && !tool.destructive ? 'read' : tool.destructive ? 'write' : 'ambiguous',
        summary: { redacted: true, argumentKeys: Object.keys(params || {}).filter((key) => key !== '_armada_account').sort() },
      };
    },

    async execute(params, context): Promise<ToolResult> {
      const connection = selectConnection(name, params, context);
      if (!connection) {
        return { success: false, error: 'Compte MCP absent, ambigu ou non autorisé pour cet agent.' };
      }
      const args = { ...(params || {}) };
      delete args._armada_account;
      try {
        const response = await runnerFetch('/internal/execute', {
          method: 'POST',
          body: JSON.stringify({
            connectionId: connection.id,
            storeId: context.storeId,
            agentId: context.agentId,
            toolName: tool.name,
            args,
            operationId: context.operationId,
            approvalGranted: context.approvalGranted === true,
          }),
        });
        const classification = defaultMcpPolicy(tool) === 'blocked'
          ? 'blocked'
          : tool.readOnly && !tool.destructive ? 'read' : tool.destructive ? 'write' : 'ambiguous';
        return {
          ...(response.result as ToolResult),
          audit: {
            connectionId: connection.id,
            connectorSlug: connection.slug,
            accountLabel: connection.label,
            toolClassification: classification,
            summary: { redacted: true, argumentKeys: Object.keys(args).sort() },
          },
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export async function syncIntegrations(): Promise<McpServerStatus[]> {
  if (!registryRef) throw new Error('initIntegrationSync() must be called first');
  const payload = await runnerFetch('/internal/sync', { method: 'POST', body: '{}' });
  connections = payload.connections || [];

  for (const name of registeredNames) registryRef.unregister(name);
  registeredNames.clear();

  const seen = new Set<string>();
  for (const connection of connections) {
    for (const tool of connection.tools) {
      if (seen.has(tool.exposedName)) continue;
      seen.add(tool.exposedName);
      registryRef.register(virtualTool(tool, connection.category || 'mcp'));
      registeredNames.add(tool.exposedName);
    }
  }
  return getMcpStatus();
}

export function getMcpStatus(): McpServerStatus[] {
  return connections.map((connection) => ({
    connectionId: connection.id,
    storeId: connection.storeId,
    slug: connection.slug,
    label: connection.label,
    status: connection.status,
    toolCount: connection.tools.length,
    error: connection.error,
  }));
}

export async function initIntegrationSync(toolRegistry: ToolRegistry): Promise<void> {
  registryRef = toolRegistry;
  if (process.env.MCP_CONNECTOR_PLATFORM_V2 === 'false') {
    console.log('🔌 MCP Connector Platform v2 disabled by feature flag');
    return;
  }
  console.log('🔌 Syncing tenant-scoped MCP connections through connector runner...');
  try {
    await syncIntegrations();
  } catch (error) {
    connections = [];
    console.warn(`  ⚠️ Connector runner unavailable: ${error instanceof Error ? error.message : error}`);
  }
  if (!refreshTimer) {
    refreshTimer = setInterval(() => syncIntegrations().catch((error) => {
      console.warn(`  ⚠️ Connector catalog refresh failed: ${error instanceof Error ? error.message : error}`);
    }), 30_000);
    refreshTimer.unref();
  }
}

export async function disconnectMcpServers(): Promise<void> {
  connections = [];
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}
