import fs from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API = 'https://www.googleapis.com/webmasters/v3';
let accessToken = '';
let expiresAt = 0;

async function token() {
  if (accessToken && expiresAt > Date.now() + 60_000) return accessToken;
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
  const credentials = JSON.parse(await fs.readFile(file, 'utf8'));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: credentials.client_id, client_secret: credentials.client_secret, refresh_token: credentials.refresh_token, grant_type: 'refresh_token' }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
  const body: any = await response.json();
  accessToken = body.access_token;
  expiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
  return accessToken;
}

async function request(path: string, body?: any) {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Search Console returned ${response.status}`);
  return response.json();
}

const tools = [
  {
    name: 'list_sites', description: 'List Search Console properties available to the connected account.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true },
  },
  {
    name: 'search_performance', description: 'Query Search Console clicks, impressions, CTR and position by dimensions.',
    inputSchema: {
      type: 'object',
      properties: {
        siteUrl: { type: 'string', description: 'Exact Search Console property URL.' },
        startDate: { type: 'string', description: 'Start date YYYY-MM-DD.' },
        endDate: { type: 'string', description: 'End date YYYY-MM-DD.' },
        dimensions: { type: 'array', items: { type: 'string', enum: ['query', 'page', 'country', 'device', 'date'] }, description: 'Grouping dimensions.' },
        rowLimit: { type: 'number', description: 'Maximum rows, capped at 1000.' },
      },
      required: ['siteUrl', 'startDate', 'endDate'],
    },
    annotations: { readOnlyHint: true },
  },
];

const server = new Server({ name: 'armada-gsc', version: '2.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (call) => {
  const args: any = call.params.arguments || {};
  let data: any;
  if (call.params.name === 'list_sites') data = await request('/sites');
  else if (call.params.name === 'search_performance') {
    const site = encodeURIComponent(String(args.siteUrl));
    data = await request(`/sites/${site}/searchAnalytics/query`, {
      startDate: args.startDate, endDate: args.endDate,
      dimensions: Array.isArray(args.dimensions) ? args.dimensions.slice(0, 5) : ['query'],
      rowLimit: Math.min(Math.max(Number(args.rowLimit || 100), 1), 1000),
    });
  } else throw new Error('Unknown tool');
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
});

await server.connect(new StdioServerTransport());
