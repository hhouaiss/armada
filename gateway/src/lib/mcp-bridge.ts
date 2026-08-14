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
  client: Client;
  reconnecting: Promise<void> | null;
}

const servers: McpServerState[] = [];

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
    await client.connect(transport);
  } else {
    throw new Error(`MCP server "${slug}" has neither "url" nor "command" in its config`);
  }

  return client;
}

/**
 * Connects all configured MCP servers and registers their tools.
 * A failing server logs a warning and is skipped — it never blocks boot.
 */
export async function connectMcpServers(toolRegistry: ToolRegistry): Promise<void> {
  const integrations = await prisma.integration.findMany({
    where: { isActive: true, platform: { startsWith: 'mcp:' } },
  });

  if (integrations.length === 0) return;

  console.log(`🔌 Connecting ${integrations.length} MCP server(s)...`);

  for (const integration of integrations) {
    const slug = integration.platform.slice('mcp:'.length).replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      const encrypted = (integration.credentials as any)?.encrypted;
      if (!encrypted) throw new Error('missing encrypted credentials');
      const config: McpServerConfig = JSON.parse(decrypt(encrypted));

      const client = await connectServer(slug, config);
      const state: McpServerState = { slug, config, client, reconnecting: null };
      servers.push(state);

      const { tools } = await client.listTools();
      const selected = config.allowedTools
        ? tools.filter((t) => matchesPattern(t.name, config.allowedTools!))
        : tools;

      let registered = 0;
      for (const mcpTool of selected) {
        const wrapped = wrapMcpTool(state, mcpTool, config);
        try {
          toolRegistry.register(wrapped);
          registered++;
        } catch {
          console.warn(`  ⚠️ MCP ${slug}: tool name collision, skipped ${wrapped.name}`);
        }
      }
      console.log(
        `  ✓ MCP ${slug}: ${registered}/${tools.length} tools registered (category: ${config.category || 'mcp'})`
      );
    } catch (err: any) {
      console.warn(`  ⚠️ MCP ${slug}: connection failed — skipped (${err?.message ?? err})`);
    }
  }
}

/** Close all MCP connections (call on shutdown). */
export async function disconnectMcpServers(): Promise<void> {
  await Promise.allSettled(servers.map((s) => s.client.close()));
  servers.length = 0;
}
