import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { prisma } from './database.js';
import { decrypt } from './encryption.js';

/**
 * MCP Bridge — connects external MCP servers and exposes their tools as
 * regular AgentTools in the ToolRegistry. The agentic loop, category scoping,
 * approval flow and per-tool timeout all apply unchanged.
 *
 * Servers are configured as Integration rows with platform "mcp:<slug>"
 * (e.g. "mcp:klaviyo"). Decrypted credentials JSON:
 * {
 *   "url": "https://…/mcp",              // Streamable HTTP endpoint, OR
 *   "command": "npx", "args": [...],      // stdio server (local process)
 *   "headers": { "Authorization": "…" },  // optional (HTTP only)
 *   "category": "marketing",              // ToolRegistry category (default "mcp")
 *   "allowedTools": ["get_*", "send_campaign"], // optional allowlist ("*" wildcard suffix)
 *   "requireApproval": ["*"]              // optional override; default: everything
 *                                         // not annotated read-only requires approval
 * }
 */

interface McpServerConfig {
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  category?: string;
  allowedTools?: string[];
  requireApproval?: string[];
}

interface McpServerState {
  slug: string;
  config: McpServerConfig;
  /** raw decrypted config JSON — used to detect config changes on sync */
  configJson: string;
  client: Client;
  reconnecting: Promise<void> | null;
  /** registry names of the tools this server registered */
  toolNames: string[];
}

export interface McpServerStatus {
  slug: string;
  status: 'connected' | 'error';
  toolCount: number;
  error?: string;
}

const servers = new Map<string, McpServerState>();
/** Last error per slug for servers that failed to connect (not in `servers`). */
const serverErrors = new Map<string, string>();

let registryRef: ToolRegistry | null = null;
/** Native (non-MCP) tools gated by an Integration platform, e.g. notion → notionTools. */
let gatedNativeTools: Record<string, AgentTool[]> = {};
const registeredNativePlatforms = new Set<string>();

const CONNECTION_ERROR_RE = /closed|disconnect|not connected|ECONNREFUSED|ECONNRESET|EPIPE|fetch failed|terminated|socket hang up/i;

/** Reconnect a dropped server; concurrent callers share the same attempt. */
async function reconnectServer(state: McpServerState): Promise<void> {
  if (!state.reconnecting) {
    state.reconnecting = (async () => {
      console.warn(`  ⚠️ MCP ${state.slug}: connection lost — reconnecting...`);
      try {
        await state.client.close().catch(() => {});
        state.client = await connectServer(state.slug, state.config);
        console.log(`  ✓ MCP ${state.slug}: reconnected`);
      } finally {
        state.reconnecting = null;
      }
    })();
  }
  return state.reconnecting;
}

function matchesPattern(name: string, patterns: string[]): boolean {
  return patterns.some((p) =>
    p === '*' ? true : p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : name === p
  );
}

/** Anthropic tool names must match ^[a-zA-Z0-9_-]{1,64}$ */
function toolName(serverSlug: string, mcpToolName: string): string {
  const raw = `${serverSlug}_${mcpToolName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return raw.length <= 64 ? raw : raw.slice(0, 64);
}

/** Flatten MCP content blocks into something the LLM can consume. */
function contentToData(content: Array<{ type: string; text?: string }>): any {
  const text = (content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
  if (!text) return content;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function wrapMcpTool(
  state: McpServerState,
  mcpTool: any,
  config: McpServerConfig
): AgentTool {
  const serverSlug = state.slug;
  // Approval policy: autonomous by default — agents run MCP tools directly.
  // A config `requireApproval` pattern can still gate specific tools.
  // Refund operations are hard-blocked centrally in ToolRegistry.execute.
  const requiresApproval =
    config.requireApproval != null && matchesPattern(mcpTool.name, config.requireApproval) === true;

  return {
    name: toolName(serverSlug, mcpTool.name),
    description: mcpTool.description || `MCP tool ${mcpTool.name} (server: ${serverSlug})`,
    category: config.category || 'mcp',
    requiresApproval,
    inputSchema: (mcpTool.inputSchema ?? { type: 'object', properties: {} }) as AgentTool['inputSchema'],

    async execute(params: any, _context: ToolContext): Promise<ToolResult> {
      const call = async (): Promise<ToolResult> => {
        const result: any = await state.client.callTool({
          name: mcpTool.name,
          arguments: params ?? {},
        });
        const data = contentToData(result.content);
        if (result.isError) {
          return {
            success: false,
            error: typeof data === 'string' ? data : JSON.stringify(data),
          };
        }
        return { success: true, data };
      };

      try {
        return await call();
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        // Connection-level failure → reconnect once and retry the call
        if (CONNECTION_ERROR_RE.test(msg)) {
          try {
            await reconnectServer(state);
            return await call();
          } catch (retryErr: any) {
            return {
              success: false,
              error: `MCP ${serverSlug}/${mcpTool.name} (after reconnect): ${retryErr?.message ?? String(retryErr)}`,
            };
          }
        }
        return {
          success: false,
          error: `MCP ${serverSlug}/${mcpTool.name}: ${msg}`,
        };
      }
    },
  };
}

async function connectServer(slug: string, config: McpServerConfig): Promise<Client> {
  const client = new Client({ name: 'armada-gateway', version: '1.0.0' });

  if (config.url) {
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: config.headers ? { headers: config.headers } : undefined,
    });
    await client.connect(transport);
  } else if (config.command) {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env ? { ...process.env as Record<string, string>, ...config.env } : undefined,
    });
    try {
      await client.connect(transport);
    } catch (err: any) {
      if (/ENOENT/.test(err?.message ?? '')) {
        throw new Error(
          `commande "${config.command}" introuvable sur le serveur du gateway — ` +
          (config.command === 'uvx'
            ? 'installez uv (https://docs.astral.sh/uv) sur la machine/image qui héberge le gateway, ou utilisez un serveur MCP distant (URL).'
            : 'installez-la sur la machine/image qui héberge le gateway, ou utilisez un serveur MCP distant (URL).')
        );
      }
      throw err;
    }
  } else {
    throw new Error(`MCP server "${slug}" has neither "url" nor "command" in its config`);
  }

  return client;
}

/** Tear down one server: unregister its tools and close the client. */
async function teardownServer(state: McpServerState): Promise<void> {
  for (const name of state.toolNames) registryRef?.unregister(name);
  await state.client.close().catch(() => {});
  servers.delete(state.slug);
}

/** Connect one server and register its tools. Throws on failure. */
async function setupServer(slug: string, configJson: string): Promise<McpServerState> {
  const config: McpServerConfig = JSON.parse(configJson);
  const client = await connectServer(slug, config);
  const state: McpServerState = { slug, config, configJson, client, reconnecting: null, toolNames: [] };

  const { tools } = await client.listTools();
  const selected = config.allowedTools
    ? tools.filter((t) => matchesPattern(t.name, config.allowedTools!))
    : tools;

  for (const mcpTool of selected) {
    const wrapped = wrapMcpTool(state, mcpTool, config);
    try {
      registryRef!.register(wrapped);
      state.toolNames.push(wrapped.name);
    } catch {
      console.warn(`  ⚠️ MCP ${slug}: tool name collision, skipped ${wrapped.name}`);
    }
  }
  servers.set(slug, state);
  console.log(
    `  ✓ MCP ${slug}: ${state.toolNames.length}/${tools.length} tools registered (category: ${config.category || 'mcp'})`
  );
  return state;
}

/**
 * Sync native integration-gated tools (Notion, Klaviyo, GSC…) with the DB:
 * registered only while their Integration row is active.
 */
async function syncNativeTools(activePlatforms: Set<string>): Promise<void> {
  for (const [platform, tools] of Object.entries(gatedNativeTools)) {
    const active = activePlatforms.has(platform);
    if (active && !registeredNativePlatforms.has(platform)) {
      for (const tool of tools) {
        try { registryRef!.register(tool); } catch { /* already registered */ }
      }
      registeredNativePlatforms.add(platform);
      console.log(`  ✓ Native tools enabled: ${platform} (${tools.length})`);
    } else if (!active && registeredNativePlatforms.has(platform)) {
      for (const tool of tools) registryRef!.unregister(tool.name);
      registeredNativePlatforms.delete(platform);
      console.log(`  − Native tools disabled: ${platform}`);
    }
  }
}

/**
 * Reconcile MCP servers + gated native tools with the Integration table.
 * Safe to call at any time (boot, or after connect/disconnect from the web UI).
 * A failing server is reported in the returned status, never throws.
 */
export async function syncIntegrations(): Promise<McpServerStatus[]> {
  if (!registryRef) throw new Error('initIntegrationSync() must be called first');

  const activeIntegrations = await prisma.integration.findMany({
    where: { isActive: true },
    select: { platform: true, credentials: true },
  });

  const activePlatforms = new Set(activeIntegrations.map((i) => i.platform));
  await syncNativeTools(activePlatforms);

  const wanted = new Map<string, string>(); // slug → decrypted config JSON
  for (const integration of activeIntegrations) {
    if (!integration.platform.startsWith('mcp:')) continue;
    const slug = integration.platform.slice('mcp:'.length).replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      const encrypted = (integration.credentials as any)?.encrypted;
      if (!encrypted) throw new Error('missing encrypted credentials');
      wanted.set(slug, decrypt(encrypted));
    } catch (err: any) {
      serverErrors.set(slug, `credentials invalides: ${err?.message ?? err}`);
    }
  }

  // Remove servers that are gone or whose config changed
  for (const state of Array.from(servers.values())) {
    const desired = wanted.get(state.slug);
    if (desired === state.configJson) continue;
    console.log(`  − MCP ${state.slug}: ${desired ? 'config changed, reconnecting' : 'removed'}`);
    await teardownServer(state);
  }

  // Connect new/changed servers
  for (const [slug, configJson] of wanted) {
    if (servers.has(slug)) { serverErrors.delete(slug); continue; }
    try {
      await setupServer(slug, configJson);
      serverErrors.delete(slug);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      serverErrors.set(slug, msg);
      console.warn(`  ⚠️ MCP ${slug}: connection failed (${msg})`);
    }
  }

  // Drop stale errors for servers no longer wanted
  for (const slug of Array.from(serverErrors.keys())) {
    if (!wanted.has(slug)) serverErrors.delete(slug);
  }

  return getMcpStatus();
}

/** Current status of every configured MCP server (connected or errored). */
export function getMcpStatus(): McpServerStatus[] {
  const statuses: McpServerStatus[] = [];
  for (const state of servers.values()) {
    statuses.push({ slug: state.slug, status: 'connected', toolCount: state.toolNames.length });
  }
  for (const [slug, error] of serverErrors) {
    statuses.push({ slug, status: 'error', toolCount: 0, error });
  }
  return statuses;
}

/**
 * Boot-time entry point: remembers the registry + native gated tools,
 * then runs a first sync. Never blocks boot on a failing server.
 */
export async function initIntegrationSync(
  toolRegistry: ToolRegistry,
  nativeTools: Record<string, AgentTool[]> = {}
): Promise<void> {
  registryRef = toolRegistry;
  gatedNativeTools = nativeTools;
  console.log('🔌 Syncing integrations (MCP servers + gated native tools)...');
  await syncIntegrations();
}

/** Close all MCP connections (call on shutdown). */
export async function disconnectMcpServers(): Promise<void> {
  await Promise.allSettled(Array.from(servers.values()).map((s) => s.client.close()));
  servers.clear();
}
