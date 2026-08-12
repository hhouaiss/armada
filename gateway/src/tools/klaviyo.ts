import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { getIntegrationCredentials } from '../lib/database.js';
import { decrypt } from '../lib/encryption.js';

const KLAVIYO_API_BASE = 'https://a.klaviyo.com';

async function getApiKey(): Promise<string | null> {
  try {
    const encryptedData = await getIntegrationCredentials('klaviyo');
    if (!encryptedData) return null;
    const credentials = JSON.parse(decrypt(encryptedData));
    return credentials.apiKey || null;
  } catch {
    return null;
  }
}

async function callKlaviyo(params: { endpoint: string; method?: string; payload?: Record<string, any> }): Promise<ToolResult> {
  const KLAVIYO_API_KEY = await getApiKey();
  if (!KLAVIYO_API_KEY) {
    return { success: false, error: 'Klaviyo is not connected. Add your API key in Settings → Integrations.' };
  }

  const method = params.method || 'GET';
  const url = `${KLAVIYO_API_BASE}${params.endpoint}`;

  const headers: Record<string, string> = {
    'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
    'revision': '2025-07-15',
    'Accept': 'application/vnd.api+json',
  };

  if (params.payload) {
    headers['Content-Type'] = 'application/vnd.api+json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: params.payload ? JSON.stringify(params.payload) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      return {
        success: false,
        error: `Klaviyo API ${response.status}: ${text}`,
      };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export const callKlaviyoApiTool: AgentTool = {
  name: 'call_klaviyo_api',
  description: 'Read data from the Klaviyo API (GET only). Use this to inspect campaigns, flows, lists, segments, profiles, metrics, templates, events. For any modification (create/update/delete/send), use call_klaviyo_api_write instead. Consult the Klaviyo API reference at https://developers.klaviyo.com/en/reference for available endpoints.',
  category: 'marketing',
  requiresApproval: false,

  inputSchema: {
    type: 'object',
    properties: {
      endpoint: {
        type: 'string',
        description: 'The API path, e.g. "/api/campaigns/" or "/api/profiles/?filter=equals(email,\'test@example.com\')"',
      },
    },
    required: ['endpoint'],
  },

  async execute(params: { endpoint: string }, _context: ToolContext): Promise<ToolResult> {
    return callKlaviyo({ endpoint: params.endpoint, method: 'GET' });
  },
};

export const callKlaviyoApiWriteTool: AgentTool = {
  name: 'call_klaviyo_api_write',
  description: 'Execute a write operation on the Klaviyo API (POST/PATCH/DELETE): create or update campaigns, flows, lists, segments, profiles, templates, send campaigns, etc. Requires user approval — call it directly with final parameters; the approval flow handles the rest. Consult the Klaviyo API reference at https://developers.klaviyo.com/en/reference.',
  category: 'marketing',
  requiresApproval: true,

  inputSchema: {
    type: 'object',
    properties: {
      endpoint: {
        type: 'string',
        description: 'The API path, e.g. "/api/campaigns/" or "/api/campaign-send-jobs/"',
      },
      method: {
        type: 'string',
        enum: ['POST', 'PATCH', 'DELETE'],
        description: 'HTTP method',
      },
      payload: {
        type: 'object',
        description: 'Request body for POST/PATCH requests (JSON object). Omit for DELETE.',
      },
    },
    required: ['endpoint', 'method'],
  },

  async execute(params: { endpoint: string; method: string; payload?: Record<string, any> }, _context: ToolContext): Promise<ToolResult> {
    if (!['POST', 'PATCH', 'DELETE'].includes(params.method)) {
      return { success: false, error: `Invalid method for write tool: ${params.method}` };
    }
    return callKlaviyo(params);
  },
};
