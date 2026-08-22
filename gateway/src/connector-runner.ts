import { config } from 'dotenv';
import http from 'node:http';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { prisma } from './lib/database.js';
import { decrypt, encrypt } from './lib/encryption.js';
import { AppConnectionOAuthProvider } from './lib/mcp-oauth.js';
import { defaultMcpPolicy, exposedMcpToolName, isPrivateNetworkAddress } from './lib/connector-security.js';

config();

const PORT = Number(process.env.CONNECTOR_RUNNER_PORT || process.env.PORT || 18796);
const SERVICE_TOKEN = process.env.CONNECTOR_RUNNER_TOKEN || '';
if (process.env.NODE_ENV === 'production' && !SERVICE_TOKEN) {
  throw new Error('CONNECTOR_RUNNER_TOKEN is required in production');
}
const MAX_BODY = 256 * 1024;
const MAX_RESULT = 1024 * 1024;
/** Absolute ceiling on what a single server may advertise — a runaway server must not exhaust the runner. */
const MAX_DISCOVERED_TOOLS = 512;
/** Above this many *enabled* tools an agent's tool selection degrades; surfaced as a warning, not a hard stop. */
const TOOL_BUDGET = 128;
const MAX_SCHEMA = 64 * 1024;
const MAX_CONCURRENT = 4;
/** Directory holding the compiled runner — sibling of the Armada MCP adapters. */
const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));

interface State {
  id: string;
  configFingerprint: string;
  client: Client;
  tools: any[];
  activeCalls: number;
}

const states = new Map<string, State>();
const errors = new Map<string, string>();
const activeExecutions = new Map<string, AbortController>();

async function validateRemoteUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Only credential-free public HTTPS MCP URLs are allowed');
  }
  const answers = await dns.lookup(url.hostname, { all: true });
  if (answers.length === 0 || answers.some((answer) => isPrivateNetworkAddress(answer.address))) {
    throw new Error('Private or unresolved MCP endpoint rejected');
  }
  return url;
}

function decryptConfig(credentials: any): Record<string, any> {
  if (!credentials?.encrypted) throw new Error('Missing encrypted credentials');
  return JSON.parse(decrypt(credentials.encrypted));
}

async function refreshGoogleCredentials(row: any, credentials: Record<string, any>) {
  if (!credentials.refresh_token || !credentials.expiry_date || credentials.expiry_date > Date.now() + 60_000) return credentials;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.client_id || process.env.GOOGLE_CLIENT_ID || '',
      client_secret: credentials.client_secret || process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: credentials.refresh_token, grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
  const tokens: any = await response.json();
  const updated = { ...credentials, access_token: tokens.access_token, token_type: tokens.token_type || 'Bearer', expiry_date: Date.now() + Number(tokens.expires_in || 3600) * 1000 };
  await prisma.appConnection.update({ where: { id: row.id }, data: { credentials: { encrypted: encrypt(JSON.stringify(updated)) }, lastConnectedAt: new Date() } });
  return updated;
}

function validateTools(slug: string, tools: any[]) {
  if (tools.length > MAX_DISCOVERED_TOOLS) throw new Error(`Connector exposes ${tools.length} tools, more than the ${MAX_DISCOVERED_TOOLS} supported`);
  // An oversized schema would blow up every agent prompt, but it is one bad tool —
  // drop it rather than losing the whole connector.
  const kept = tools.filter((tool) => JSON.stringify(tool.inputSchema || {}).length <= MAX_SCHEMA);
  if (kept.length < tools.length) {
    const dropped = tools.filter((tool) => !kept.includes(tool)).map((tool) => tool.name);
    console.warn(`  ⚠️ ${slug}: ${dropped.length} tool(s) skipped, schema over ${MAX_SCHEMA} bytes: ${dropped.join(', ')}`);
  }
  return kept;
}

async function connect(row: any): Promise<State> {
  let credentials = decryptConfig(row.credentials);
  credentials = await refreshGoogleCredentials(row, credentials);
  const definition = row.connector;
  const fingerprint = JSON.stringify({ credentials: row.credentials, updatedAt: row.updatedAt, definition });
  const existing = states.get(row.id);
  if (existing?.configFingerprint === fingerprint) return existing;
  if (existing) await existing.client.close().catch(() => {});

  const client = new Client({ name: 'armada-connector-runner', version: '2.0.0' });
  let state: State | undefined;
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    if (!state) return;
    try {
      state.tools = validateTools(row.connector.slug, (await client.listTools()).tools);
      await prisma.appConnection.update({
        where: { id: row.id },
        data: {
          lastHealthAt: new Date(),
          discoveredTools: state.tools.map((item: any) => ({
            name: item.name, description: item.description || item.name,
            readOnly: item.annotations?.readOnlyHint === true,
            destructive: item.annotations?.destructiveHint === true,
          })),
        },
      });
    } catch (error) {
      errors.set(row.id, error instanceof Error ? error.message : String(error));
    }
  });
  if (definition.transport === 'streamable-http') {
    const endpoint = await validateRemoteUrl(definition.endpoint || credentials.url);
    const headers = { ...(credentials.headers || {}) };
    if (credentials.access_token && !headers.Authorization) headers.Authorization = `Bearer ${credentials.access_token}`;
    const authProvider = credentials.oauth
      ? new AppConnectionOAuthProvider(definition.slug, row.id, credentials.oauth)
      : undefined;
    await client.connect(new StreamableHTTPClientTransport(endpoint, {
      authProvider,
      requestInit: { ...(Object.keys(headers).length ? { headers } : {}), redirect: 'error' },
    }));
  } else if (definition.transport === 'stdio') {
    if (definition.verificationTier !== 'armada_verified') throw new Error('Package connector is not Armada verified');
    const packageConfig = definition.packageConfig as any;
    if (!packageConfig?.command || !Array.isArray(packageConfig.args)) throw new Error('Invalid pinned package definition');
    if (!['uvx', 'node'].includes(packageConfig.command)) throw new Error('Package command is not on the Armada runner allowlist');
    const env = { ...(packageConfig.env || {}), ...(credentials.env || {}) };
    if (credentials.refresh_token) {
      const credentialDir = path.join(process.env.CONNECTOR_CREDENTIAL_DIR || '/tmp/armada-connectors', row.id);
      await fs.mkdir(credentialDir, { recursive: true, mode: 0o700 });
      const credentialFile = path.join(credentialDir, 'authorized-user.json');
      await fs.writeFile(credentialFile, JSON.stringify({
        type: 'authorized_user', client_id: credentials.client_id,
        client_secret: credentials.client_secret, refresh_token: credentials.refresh_token,
      }), { mode: 0o600 });
      env.GOOGLE_APPLICATION_CREDENTIALS = credentialFile;
    }
    await client.connect(new StdioClientTransport({
      command: packageConfig.command,
      // Armada-maintained adapters (`node dist/gsc-mcp.js`) are pinned as paths relative
      // to the build output. Resolve them against this module's own directory so the
      // spawn does not depend on the runner's working directory.
      args: packageConfig.command === 'node'
        ? packageConfig.args.map((arg: string) => (typeof arg === 'string' && arg.startsWith('dist/')
          ? path.resolve(RUNNER_DIR, arg.slice('dist/'.length))
          : arg))
        : packageConfig.args,
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        LANG: process.env.LANG || 'C.UTF-8',
        TMPDIR: process.env.TMPDIR || '/tmp',
        NO_COLOR: '1',
        ...env,
      },
    }));
  } else {
    throw new Error(`Unsupported connector transport: ${definition.transport}`);
  }

  const listed = validateTools(definition.slug, (await client.listTools()).tools);
  state = { id: row.id, configFingerprint: fingerprint, client, tools: listed, activeCalls: 0 };
  states.set(row.id, state);
  return state;
}

function disabledFor(row: any): Set<string> {
  return new Set(Array.isArray(row.disabledTools) ? row.disabledTools.map(String) : []);
}

async function sync() {
  const rows = await prisma.appConnection.findMany({
    where: { status: { in: ['active', 'error', 'reauth_required'] } },
    include: { connector: true, grants: true, policies: true },
  });
  const wanted = new Set(rows.map((row) => row.id));
  for (const [id, state] of states) {
    if (!wanted.has(id)) {
      await state.client.close().catch(() => {});
      states.delete(id);
      errors.delete(id);
    }
  }

  const result: any[] = [];
  for (const row of rows) {
    let state: State | null = null;
    try {
      state = await connect(row);
      errors.delete(row.id);
      await prisma.appConnection.update({
        where: { id: row.id },
        data: {
          status: 'active', lastHealthAt: new Date(), lastError: null,
          discoveredTools: state.tools.map((tool: any) => ({
            name: tool.name, description: tool.description || tool.name,
            readOnly: tool.annotations?.readOnlyHint === true,
            destructive: tool.annotations?.destructiveHint === true,
          })),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.set(row.id, message);
      await prisma.appConnection.update({ where: { id: row.id }, data: { status: /401|unauthor|invalid_grant/i.test(message) ? 'reauth_required' : 'error', lastHealthAt: new Date(), lastError: message.slice(0, 500) } }).catch(() => {});
    }
    const disabled = disabledFor(row);
    result.push({
      id: row.id,
      storeId: row.storeId,
      slug: row.connector.slug,
      label: row.label,
      category: row.connector.category,
      status: state ? 'connected' : (/401|unauthor|invalid_grant/i.test(errors.get(row.id) || '') ? 'reauth_required' : 'error'),
      error: state ? undefined : errors.get(row.id),
      agentIds: row.grants.map((grant) => grant.agentId),
      policies: Object.fromEntries(row.policies.map((policy) => [policy.toolName, policy.mode])),
      disabledTools: [...disabled],
      toolBudget: TOOL_BUDGET,
      // Disabled tools stay in `discoveredTools` for the dashboard, but never reach an agent's registry.
      tools: (state?.tools || []).filter((tool: any) => !disabled.has(tool.name)).map((tool: any) => {
        const override = ((row.connector.riskOverrides as Record<string, any>) || {})[tool.name] || {};
        return {
          name: tool.name,
          exposedName: exposedMcpToolName(row.connector.slug, tool.name),
          description: tool.description || `${row.connector.name}: ${tool.name}`,
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
          readOnly: typeof override.readOnly === 'boolean' ? override.readOnly : tool.annotations?.readOnlyHint === true,
          destructive: typeof override.destructive === 'boolean' ? override.destructive : tool.annotations?.destructiveHint === true,
        };
      }),
    });
  }
  return result;
}

async function execute(input: any) {
  const row = await prisma.appConnection.findFirst({
    where: {
      id: input.connectionId,
      storeId: input.storeId,
      status: 'active',
      grants: { some: { agentId: input.agentId, agent: { storeId: input.storeId, isActive: true } } },
    },
    include: { connector: true, policies: { where: { agentId: input.agentId } } },
  });
  if (!row) throw new Error('Connection is not active or granted to this agent');
  const state = states.get(row.id) || await connect(row);
  const tool = state.tools.find((candidate) => candidate.name === input.toolName);
  if (!tool) throw new Error('Tool is not exposed by this connection');
  const override = ((row.connector.riskOverrides as Record<string, any>) || {})[tool.name] || {};
  const classification = {
    name: tool.name,
    readOnly: typeof override.readOnly === 'boolean' ? override.readOnly : tool.annotations?.readOnlyHint === true,
    destructive: typeof override.destructive === 'boolean' ? override.destructive : tool.annotations?.destructiveHint === true,
  };
  const baseline = defaultMcpPolicy(classification);
  const configured = row.policies.find((policy) => policy.toolName === input.toolName)?.mode;
  const policy = baseline === 'blocked' || override.mode === 'blocked' ? 'blocked' : configured || override.mode || baseline;
  if (policy === 'blocked') throw new Error('Tool is blocked by Armada or merchant policy');
  if (policy === 'approval' && input.approvalGranted !== true) throw new Error('Tool requires a valid approval claim');
  if (state.activeCalls >= MAX_CONCURRENT) throw new Error('Connection concurrency limit reached');

  const started = Date.now();
  const executionId = typeof input.operationId === 'string' ? input.operationId : crypto.randomUUID();
  const controller = new AbortController();
  activeExecutions.set(executionId, controller);
  state.activeCalls++;
  try {
    const raw: any = await state.client.callTool(
      { name: input.toolName, arguments: input.args || {} },
      undefined,
      { signal: controller.signal, timeout: 60_000, maxTotalTimeout: 60_000 },
    );
    const serialized = JSON.stringify(raw.content || []);
    if (serialized.length > MAX_RESULT) throw new Error('MCP result exceeded the 1 MB safety limit');
    const text = (raw.content || []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n');
    let data: any = raw.content;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    const result = raw.isError ? { success: false, error: typeof data === 'string' ? data.slice(0, 1000) : 'MCP tool failed' } : { success: true, data };
    await prisma.$transaction([
      prisma.appConnection.update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastHealthAt: new Date(), lastError: null } }),
      prisma.connectorAuditEvent.create({ data: {
        storeId: row.storeId, connectionId: row.id, agentId: input.agentId,
        eventType: 'tool_execution', toolName: input.toolName,
        status: result.success ? 'completed' : 'failed', durationMs: Date.now() - started,
        summary: { redacted: true, argumentKeys: Object.keys(input.args || {}), resultType: Array.isArray(data) ? 'array' : typeof data },
      } }),
    ]);
    return result;
  } finally {
    state.activeCalls--;
    activeExecutions.delete(executionId);
  }
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  // Unauthenticated liveness probe — Railway's healthcheck cannot send the service token.
  if (req.method === 'GET' && req.url === '/health') {
    res.end(JSON.stringify({ ok: true, connections: states.size })); return;
  }
  if (SERVICE_TOKEN && req.headers.authorization !== `Bearer ${SERVICE_TOKEN}`) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
  }
  try {
    if (req.method === 'POST' && req.url === '/internal/sync') {
      res.end(JSON.stringify({ connections: await sync() })); return;
    }
    if (req.method === 'POST' && req.url === '/internal/execute') {
      res.end(JSON.stringify({ result: await execute(await readBody(req)) })); return;
    }
    if (req.method === 'POST' && req.url === '/internal/cancel') {
      const body = await readBody(req);
      const controller = typeof body.operationId === 'string' ? activeExecutions.get(body.operationId) : undefined;
      controller?.abort();
      res.end(JSON.stringify({ cancelled: !!controller })); return;
    }
    res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.writeHead(400); res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

const HOST = process.env.CONNECTOR_RUNNER_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
server.listen(PORT, HOST, () => console.log(`🔐 Connector runner listening on ${HOST}:${PORT}`));

process.on('SIGINT', async () => {
  await Promise.allSettled(Array.from(states.values()).map((state) => state.client.close()));
  server.close();
});
