import fs from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Armada-maintained replacement for the upstream `analytics-mcp` Python package:
// the connector runner only ships a Node toolchain, so a `uvx` connector can never spawn.
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';
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

async function request(url: string, body?: any) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Google Analytics returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

/** GA4 property ids are accepted as `properties/123`, `123` or a full resource name. */
function propertyPath(value: unknown) {
  const raw = String(value || '').trim();
  const id = raw.replace(/^properties\//, '');
  if (!/^\d+$/.test(id)) throw new Error('propertyId must be a GA4 numeric property id');
  return `properties/${id}`;
}

const namedList = (value: unknown, cap: number) =>
  (Array.isArray(value) ? value : []).slice(0, cap).map((name: any) => ({ name: String(name) }));

const dateRange = (args: any) => [{
  startDate: String(args.startDate || '28daysAgo'),
  endDate: String(args.endDate || 'yesterday'),
}];

const tools = [
  {
    name: 'list_properties', description: 'List the GA4 accounts and properties available to the connected account.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true },
  },
  {
    name: 'run_report', description: 'Run a GA4 report over a date range, grouped by dimensions (sessions, revenue, conversions…).',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', description: 'GA4 property id, e.g. 123456789.' },
        startDate: { type: 'string', description: 'Start date YYYY-MM-DD or relative such as 28daysAgo.' },
        endDate: { type: 'string', description: 'End date YYYY-MM-DD or relative such as yesterday.' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'GA4 dimension API names, e.g. date, sessionSource, pagePath.' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'GA4 metric API names, e.g. sessions, totalRevenue, conversions.' },
        limit: { type: 'number', description: 'Maximum rows, capped at 1000.' },
      },
      required: ['propertyId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'run_realtime_report', description: 'Run a GA4 realtime report for the last 30 minutes of activity.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', description: 'GA4 property id, e.g. 123456789.' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'GA4 realtime dimensions, e.g. unifiedScreenName, country.' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'GA4 realtime metrics, e.g. activeUsers, screenPageViews.' },
        limit: { type: 'number', description: 'Maximum rows, capped at 1000.' },
      },
      required: ['propertyId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_funnel', description: 'Compare event counts step by step to analyse a conversion funnel on a GA4 property.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', description: 'GA4 property id, e.g. 123456789.' },
        startDate: { type: 'string', description: 'Start date YYYY-MM-DD or relative such as 28daysAgo.' },
        endDate: { type: 'string', description: 'End date YYYY-MM-DD or relative such as yesterday.' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Ordered event names, e.g. view_item, add_to_cart, begin_checkout, purchase.' },
      },
      required: ['propertyId'],
    },
    annotations: { readOnlyHint: true },
  },
];

const server = new Server({ name: 'armada-ga4', version: '2.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (call) => {
  const args: any = call.params.arguments || {};
  const limit = () => Math.min(Math.max(Number(args.limit || 100), 1), 1000);
  let data: any;
  if (call.params.name === 'list_properties') {
    const summaries: any = await request(`${ADMIN}/accountSummaries?pageSize=200`);
    data = (summaries.accountSummaries || []).map((account: any) => ({
      account: account.account, accountName: account.displayName,
      properties: (account.propertySummaries || []).map((property: any) => ({
        propertyId: String(property.property || '').replace('properties/', ''),
        displayName: property.displayName, propertyType: property.propertyType,
      })),
    }));
  } else if (call.params.name === 'run_report') {
    data = await request(`${DATA}/${propertyPath(args.propertyId)}:runReport`, {
      dateRanges: dateRange(args),
      dimensions: namedList(args.dimensions?.length ? args.dimensions : ['date'], 9),
      metrics: namedList(args.metrics?.length ? args.metrics : ['sessions', 'totalUsers', 'totalRevenue'], 10),
      limit: limit(),
    });
  } else if (call.params.name === 'run_realtime_report') {
    data = await request(`${DATA}/${propertyPath(args.propertyId)}:runRealtimeReport`, {
      dimensions: namedList(args.dimensions?.length ? args.dimensions : ['unifiedScreenName'], 9),
      metrics: namedList(args.metrics?.length ? args.metrics : ['activeUsers'], 10),
      limit: limit(),
    });
  } else if (call.params.name === 'get_funnel') {
    const steps = (Array.isArray(args.steps) && args.steps.length ? args.steps : ['view_item', 'add_to_cart', 'begin_checkout', 'purchase']).slice(0, 10).map(String);
    // The funnel report API is Data API v1alpha only, so the funnel is derived from
    // per-event counts — the same numbers a merchant reads in the GA4 funnel card.
    const report: any = await request(`${DATA}/${propertyPath(args.propertyId)}:runReport`, {
      dateRanges: dateRange(args),
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: steps } } },
      limit: 100,
    });
    const counts = new Map((report.rows || []).map((row: any) => [row.dimensionValues[0].value, {
      eventCount: Number(row.metricValues[0].value || 0), users: Number(row.metricValues[1].value || 0),
    }]));
    let previous = 0;
    data = {
      dateRange: dateRange(args)[0],
      steps: steps.map((event: string, index: number) => {
        const entry: any = counts.get(event) || { eventCount: 0, users: 0 };
        const dropOff = index === 0 || previous === 0 ? null : Number((1 - entry.users / previous).toFixed(4));
        previous = entry.users;
        return { event, eventCount: entry.eventCount, users: entry.users, dropOffFromPreviousStep: dropOff };
      }),
    };
  } else throw new Error('Unknown tool');
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
});

await server.connect(new StdioServerTransport());
