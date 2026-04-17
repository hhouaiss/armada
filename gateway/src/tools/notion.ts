import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { getIntegrationCredentials } from '../lib/database.js';
import { decrypt } from '../lib/encryption.js';

/**
 * Notion Tools — create pages, database entries, and manage content
 *
 * Uses the Notion Internal Integration Token stored via the Armada
 * integrations dashboard (/integrations → Notion → Connecter).
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function getApiKey(): Promise<string | null> {
  try {
    const encryptedData = await getIntegrationCredentials('notion');
    if (!encryptedData) return null;
    const decrypted = decrypt(encryptedData);
    const credentials = JSON.parse(decrypted);
    return credentials.apiKey ?? null;
  } catch (err) {
    console.error('[Notion] Failed to load credentials:', err);
    return null;
  }
}

async function notionRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<any> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(`Notion API error ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ── notion_create_page ─────────────────────────────────────────────────────────

export const notionCreatePageTool: AgentTool = {
  name: 'notion_create_page',
  description:
    'Create a new Notion page inside a parent page or database. Use this to create tasks, notes, reports, or any structured content.',
  category: 'notion',
  inputSchema: {
    type: 'object',
    properties: {
      parent_id: {
        type: 'string',
        description: 'The ID of the parent page or database.',
      },
      parent_type: {
        type: 'string',
        enum: ['page_id', 'database_id'],
        description: 'Whether the parent is a page or a database.',
      },
      title: {
        type: 'string',
        description: 'The title of the new page.',
      },
      content: {
        type: 'string',
        description: 'Optional text content to add as paragraph blocks.',
      },
      properties: {
        type: 'object',
        description:
          'For database entries: additional properties as key-value pairs (e.g. Status, Priority).',
      },
    },
    required: ['parent_id', 'parent_type', 'title'],
  },
  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Notion not connected. Go to /integrations → Notion → Connecter.',
      };
    }

    try {
      const body: Record<string, unknown> = {
        parent: { [params.parent_type]: params.parent_id },
        properties: {
          title: {
            title: [{ type: 'text', text: { content: params.title } }],
          },
        },
      };

      if (params.properties && params.parent_type === 'database_id') {
        for (const [key, value] of Object.entries(params.properties)) {
          (body.properties as any)[key] = {
            rich_text: [{ type: 'text', text: { content: String(value) } }],
          };
        }
      }

      if (params.content) {
        body.children = params.content
          .split('\n')
          .filter((line: string) => line.trim())
          .map((line: string) => ({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: line } }],
            },
          }));
      }

      const page = await notionRequest(apiKey, 'POST', '/pages', body);
      return {
        success: true,
        data: { id: page.id, url: page.url, title: params.title, created: page.created_time },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  },
};

// ── notion_search ──────────────────────────────────────────────────────────────

export const notionSearchTool: AgentTool = {
  name: 'notion_search',
  description:
    'Search across all Notion pages and databases the integration has access to.',
  category: 'notion',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The text to search for.' },
      filter_type: {
        type: 'string',
        enum: ['page', 'database'],
        description: 'Optionally filter to only pages or only databases.',
      },
    },
    required: ['query'],
  },
  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, error: 'Notion not connected. Go to /integrations → Notion → Connecter.' };
    }

    try {
      const body: Record<string, unknown> = { query: params.query };
      if (params.filter_type) {
        body.filter = { value: params.filter_type, property: 'object' };
      }

      const results = await notionRequest(apiKey, 'POST', '/search', body);
      const items = (results.results || []).map((r: any) => ({
        id: r.id,
        type: r.object,
        url: r.url,
        title:
          r.properties?.title?.title?.[0]?.text?.content ||
          r.properties?.Name?.title?.[0]?.text?.content ||
          r.title?.[0]?.text?.content ||
          '(untitled)',
        last_edited: r.last_edited_time,
      }));

      return { success: true, data: { count: items.length, results: items } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  },
};

// ── notion_get_page ────────────────────────────────────────────────────────────

export const notionGetPageTool: AgentTool = {
  name: 'notion_get_page',
  description: 'Read the content and properties of a Notion page by its ID.',
  category: 'notion',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: { type: 'string', description: 'The ID of the Notion page to read.' },
    },
    required: ['page_id'],
  },
  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, error: 'Notion not connected. Go to /integrations → Notion → Connecter.' };
    }

    try {
      const [page, blocks] = await Promise.all([
        notionRequest(apiKey, 'GET', `/pages/${params.page_id}`),
        notionRequest(apiKey, 'GET', `/blocks/${params.page_id}/children`),
      ]);

      const content = (blocks.results || [])
        .map((block: any) => (block[block.type]?.rich_text || []).map((t: any) => t.plain_text).join(''))
        .filter(Boolean)
        .join('\n');

      return {
        success: true,
        data: { id: page.id, url: page.url, created: page.created_time, last_edited: page.last_edited_time, content },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  },
};

// ── notion_query_database ──────────────────────────────────────────────────────

export const notionQueryDatabaseTool: AgentTool = {
  name: 'notion_query_database',
  description:
    'Query entries in a Notion database. Returns rows with their properties. Use to list tasks, projects, or any structured data.',
  category: 'notion',
  inputSchema: {
    type: 'object',
    properties: {
      database_id: { type: 'string', description: 'The ID of the Notion database.' },
      filter_property: { type: 'string', description: 'Optional property name to filter on.' },
      filter_value: { type: 'string', description: 'Optional value to filter for.' },
      max_results: { type: 'number', description: 'Maximum rows to return (default: 20).' },
    },
    required: ['database_id'],
  },
  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, error: 'Notion not connected. Go to /integrations → Notion → Connecter.' };
    }

    try {
      const body: Record<string, unknown> = { page_size: params.max_results || 20 };
      if (params.filter_property && params.filter_value) {
        body.filter = {
          property: params.filter_property,
          rich_text: { contains: params.filter_value },
        };
      }

      const results = await notionRequest(apiKey, 'POST', `/databases/${params.database_id}/query`, body);

      const rows = (results.results || []).map((row: any) => {
        const props: Record<string, string> = {};
        for (const [key, val] of Object.entries(row.properties as any)) {
          const v = val as any;
          if (v.type === 'title') props[key] = v.title?.[0]?.plain_text || '';
          else if (v.type === 'rich_text') props[key] = v.rich_text?.[0]?.plain_text || '';
          else if (v.type === 'select') props[key] = v.select?.name || '';
          else if (v.type === 'status') props[key] = v.status?.name || '';
          else if (v.type === 'date') props[key] = v.date?.start || '';
          else if (v.type === 'checkbox') props[key] = v.checkbox ? 'true' : 'false';
        }
        return { id: row.id, url: row.url, properties: props };
      });

      return { success: true, data: { count: rows.length, rows } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  },
};

// ── notion_update_page ─────────────────────────────────────────────────────────

export const notionUpdatePageTool: AgentTool = {
  name: 'notion_update_page',
  description:
    'Update properties of an existing Notion page or database entry (e.g. change status, title, due date).',
  category: 'notion',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: { type: 'string', description: 'The ID of the page to update.' },
      properties: {
        type: 'object',
        description: 'Properties to update as key-value pairs. Use "title" for the page title.',
      },
    },
    required: ['page_id', 'properties'],
  },
  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, error: 'Notion not connected. Go to /integrations → Notion → Connecter.' };
    }

    try {
      const notionProps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params.properties)) {
        if (key === 'title') {
          notionProps[key] = { title: [{ type: 'text', text: { content: String(value) } }] };
        } else {
          notionProps[key] = { rich_text: [{ type: 'text', text: { content: String(value) } }] };
        }
      }

      const page = await notionRequest(apiKey, 'PATCH', `/pages/${params.page_id}`, {
        properties: notionProps,
      });

      return { success: true, data: { id: page.id, url: page.url, updated: page.last_edited_time } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  },
};

export const notionTools = [
  notionCreatePageTool,
  notionSearchTool,
  notionGetPageTool,
  notionQueryDatabaseTool,
  notionUpdatePageTool,
];
