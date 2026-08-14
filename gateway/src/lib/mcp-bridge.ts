import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { prisma } from './database.js';
import { decrypt } from './encryption.js';
import {
  IntegrationOAuthProvider,
  ReauthRequiredError,
  type McpOAuthState,
} from './mcp-oauth.js';
import { writeAuthorizedUserAdc, type GoogleOAuthCredentials } from './google-adc.js';

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
 *   "oauth": { … },                       // OAuth 2.1 state for a remote server,
 *                                         // written by web/app/api/mcp/oauth/*
 *   "googleOAuth": { refresh_token, … }   // Google credentials for a stdio server,
 *                                         // exposed to it as ADC (see google-adc.ts)
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
  /** Remote server authenticated with OAuth 2.1 (DCR + PKCE done in the web app). */
  oauth?: McpOAuthState;
  /** Stdio Google server: credentials handed over as an ADC authorized_user file. */
  googleOAuth?: GoogleOAuthCredentials;
}

interface McpServerState {
  slug: string;
  config: McpServerConfig;
  /** raw decrypted config JSON — used to detect config changes on sync */
  configJson: string;
  /** Integration row id — token refreshes write back to this exact row. */
  integrationId: string;
  client: Client;
  reconnecting: Promise<void> | null;
  /** registry names of the tools this server registered */
  toolNames: string[];
}

export interface McpServerStatus {
  slug: string;
  /** `reauth_required` = credentials expired; the user must reconnect the app. */
  status: 'connected' | 'error' | 'reauth_required';
  toolCount: number;
  error?: string;
}

const servers = new Map<string, McpServerState>();
/** Last error per slug for servers that failed to connect (not in `servers`). */
const serverErrors = new Map<string, string>();
/** Servers whose OAuth grant is dead — the user must reconnect from the UI. */
const reauthNeeded = new Map<string, string>();

/** An expired/revoked grant, as opposed to a genuine misconfiguration. */
function isReauthError(err: any): boolean {
  const name = err?.name ?? '';
  const msg = err?.message ?? String(err ?? '');
  return name === 'UnauthorizedError'
    || name === 'ReauthRequiredError'
    || /\b401\b|unauthorized|invalid_grant|invalid_token/i.test(msg);
}

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
        state.client = await connectServer(state.slug, state.config, state.integrationId);
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
        // A dead grant can only be fixed by the user — surface it as such rather
        // than retrying, and flag the server so the Apps page shows "Reconnecter".
        if (isReauthError(err)) {
          reauthNeeded.set(serverSlug, msg);
          return {
            success: false,
            error: `MCP ${serverSlug}: autorisation expirée — reconnectez cette app depuis la page Apps.`,
          };
        }
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

async function connectServer(
  slug: string,
  config: McpServerConfig,
  integrationId: string
): Promise<Client> {
  const client = new Client({ name: 'armada-gateway', version: '1.0.0' });

  if (config.url) {
    // OAuth servers: the SDK transport reads the stored token, refreshes it when
    // expired and hands the new set back through saveTokens(). Static-header
    // servers (API key in Authorization) keep working unchanged.
    const authProvider = config.oauth
      ? new IntegrationOAuthProvider(slug, integrationId, config.oauth)
      : undefined;

    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      authProvider,
      requestInit: config.headers ? { headers: config.headers } : undefined,
    });
    await client.connect(transport);
  } else if (config.command) {
    // Google stdio servers read credentials from a file, never from a token in
    // the environment — write ADC and point them at it.
    const env: Record<string, string> = { ...(config.env ?? {}) };
    if (config.googleOAuth) {
      env.GOOGLE_APPLICATION_CREDENTIALS = writeAuthorizedUserAdc(slug, config.googleOAuth);
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: Object.keys(env).length
        ? { ...process.env as Record<string, string>, ...env }
        : undefined,
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
async function setupServer(
  slug: string,
  configJson: string,
  integrationId: string
): Promise<McpServerState> {
  const config: McpServerConfig = JSON.parse(configJson);
  const client = await connectServer(slug, config, integrationId);
  const state: McpServerState = {
    slug, config, configJson, integrationId, client, reconnecting: null, toolNames: [],
  };

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
    select: { id: true, platform: true, credentials: true },
  });

  const activePlatforms = new Set(activeIntegrations.map((i) => i.platform));
  await syncNativeTools(activePlatforms);

  // slug → decrypted config JSON + the row it came from
  const wanted = new Map<string, { configJson: string; integrationId: string }>();
  for (const integration of activeIntegrations) {
    if (!integration.platform.startsWith('mcp:')) continue;
    const slug = integration.platform.slice('mcp:'.length).replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      const encrypted = (integration.credentials as any)?.encrypted;
      if (!encrypted) throw new Error('missing encrypted credentials');
      wanted.set(slug, { configJson: decrypt(encrypted), integrationId: integration.id });
    } catch (err: any) {
      serverErrors.set(slug, `credentials invalides: ${err?.message ?? err}`);
    }
  }

  // Remove servers that are gone or whose config changed
  for (const state of Array.from(servers.values())) {
    const desired = wanted.get(state.slug);
    if (desired?.configJson === state.configJson) continue;
    console.log(`  − MCP ${state.slug}: ${desired ? 'config changed, reconnecting' : 'removed'}`);
    await teardownServer(state);
  }

  // Connect new/changed servers
  for (const [slug, { configJson, integrationId }] of wanted) {
    if (servers.has(slug)) { serverErrors.delete(slug); reauthNeeded.delete(slug); continue; }
    try {
      await setupServer(slug, configJson, integrationId);
      serverErrors.delete(slug);
      reauthNeeded.delete(slug);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      // Expired OAuth grant is not a config error — the user just has to reconnect.
      if (err instanceof ReauthRequiredError || isReauthError(err)) {
        reauthNeeded.set(slug, msg);
        serverErrors.delete(slug);
        console.warn(`  🔑 MCP ${slug}: reauthorization required`);
      } else {
        serverErrors.set(slug, msg);
        reauthNeeded.delete(slug);
        console.warn(`  ⚠️ MCP ${slug}: connection failed (${msg})`);
      }
    }
  }

  // Drop stale errors for servers no longer wanted
  for (const slug of Array.from(serverErrors.keys())) {
    if (!wanted.has(slug)) serverErrors.delete(slug);
  }
  for (const slug of Array.from(reauthNeeded.keys())) {
    if (!wanted.has(slug)) reauthNeeded.delete(slug);
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
  for (const [slug, error] of reauthNeeded) {
    statuses.push({ slug, status: 'reauth_required', toolCount: 0, error });
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
