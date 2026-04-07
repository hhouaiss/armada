import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { getIntegrationCredentials } from '../lib/database.js';
import { decrypt, encrypt } from '../lib/encryption.js';
import { prisma } from '../lib/database.js';

/**
 * Google Search Console Tools for SEO Agent (Olivia)
 *
 * Uses OAuth2 credentials stored via the Config Hub (/config page).
 * Credentials are stored encrypted in the Integration table.
 * Access tokens are automatically refreshed when expired.
 *
 * Setup: Connect GSC via Config Hub → select a Search Console property → done.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';

interface GSCCredentials {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date: number;
  selected_property: string | null;
}

async function getCredentials(): Promise<GSCCredentials | null> {
  try {
    const encryptedData = await getIntegrationCredentials('google-search-console');
    if (!encryptedData) return null;
    const decrypted = decrypt(encryptedData);
    return JSON.parse(decrypted) as GSCCredentials;
  } catch (err) {
    console.error('[GSC] Failed to load credentials:', err);
    return null;
  }
}

async function refreshAndSaveToken(credentials: GSCCredentials): Promise<GSCCredentials> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured in environment');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const tokens = await response.json() as any;
  const updated: GSCCredentials = {
    ...credentials,
    access_token: tokens.access_token,
    expiry_date: Date.now() + (tokens.expires_in * 1000),
  };

  const encryptedCredentials = encrypt(JSON.stringify(updated));
  await prisma.integration.updateMany({
    where: { platform: 'google-search-console', isActive: true },
    data: {
      credentials: { encrypted: encryptedCredentials },
      lastUsed: new Date(),
    },
  });

  return updated;
}

async function getValidCredentials(): Promise<GSCCredentials> {
  const credentials = await getCredentials();
  if (!credentials) {
    throw new Error(
      'Google Search Console is not connected. Ask the user to go to the Config Hub and connect Google Search Console.'
    );
  }
  if (!credentials.selected_property) {
    throw new Error(
      'No GSC property selected. Ask the user to go to the Config Hub and select a Search Console property for Olivia.'
    );
  }

  const isExpired = credentials.expiry_date && Date.now() >= credentials.expiry_date - 60000;
  if (isExpired) {
    return refreshAndSaveToken(credentials);
  }

  return credentials;
}

async function gscRequest(path: string, credentials: GSCCredentials, body?: object): Promise<any> {
  const response = await fetch(`${GSC_API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GSC API error ${response.status}: ${err}`);
  }

  return response.json() as Promise<any>;
}

function formatDateRange(period: '7d' | '30d' | '90d') {
  const end = new Date();
  const start = new Date();
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

// --- Tool Definitions ---

export const getSearchAnalyticsTool: AgentTool = {
  name: 'seo_search_analytics',
  description:
    'Get Google Search Console analytics data including clicks, impressions, CTR, and position for queries and pages. Dates default to the last 30 days if not provided.',
  category: 'seo',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      startDate: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format. Defaults to 30 days ago.',
      },
      endDate: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format. Defaults to today.',
      },
      dimensions: {
        type: 'string',
        description: 'Comma-separated dimensions to group by: query, page, country, device (default: query)',
      },
      rowLimit: {
        type: 'string',
        description: 'Maximum number of rows to return (default: 25)',
      },
    },
  },

  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const defaultRange = formatDateRange('30d');
    const {
      startDate = defaultRange.startDate,
      endDate = defaultRange.endDate,
      dimensions = 'query',
      rowLimit = '25',
    } = params;

    try {
      const credentials = await getValidCredentials();
      const siteUrl = credentials.selected_property!;
      const dims = String(dimensions).split(',').map((d: string) => d.trim());
      const limit = parseInt(String(rowLimit), 10) || 25;

      const data = await gscRequest(
        `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        credentials,
        { startDate, endDate, dimensions: dims, rowLimit: limit }
      );

      const rows = (data.rows || []).map((row: any) => ({
        keys: row.keys,
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        ctr: parseFloat(row.ctr.toFixed(4)),
        position: parseFloat(row.position.toFixed(1)),
      }));

      const totalClicks = rows.reduce((s: number, r: any) => s + r.clicks, 0);
      const totalImpressions = rows.reduce((s: number, r: any) => s + r.impressions, 0);

      return {
        success: true,
        data: {
          rows,
          dateRange: { startDate, endDate },
          totalClicks,
          totalImpressions,
          averageCTR:
            totalImpressions > 0
              ? parseFloat((totalClicks / totalImpressions).toFixed(4))
              : 0,
          averagePosition:
            rows.length > 0
              ? parseFloat(
                  (rows.reduce((s: number, r: any) => s + r.position, 0) / rows.length).toFixed(1)
                )
              : 0,
          property: siteUrl,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const getTopKeywordsTool: AgentTool = {
  name: 'seo_top_keywords',
  description: 'Get top performing keywords with rankings, traffic, and trends from Google Search Console',
  category: 'seo',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['7d', '30d', '90d'],
        description: 'Time period for keyword analysis (7d, 30d, 90d)',
      },
      limit: {
        type: 'string',
        description: 'Number of keywords to return (default: 20)',
      },
    },
  },

  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const { period = '30d', limit = '20' } = params;

    try {
      const credentials = await getValidCredentials();
      const siteUrl = credentials.selected_property!;
      const { startDate, endDate } = formatDateRange(period as '7d' | '30d' | '90d');
      const rowLimit = parseInt(String(limit), 10) || 20;

      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const prevEnd = new Date(startDate);
      const prevStart = new Date(startDate);
      prevStart.setDate(prevStart.getDate() - days);

      const [currentData, previousData] = await Promise.all([
        gscRequest(
          `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          credentials,
          { startDate, endDate, dimensions: ['query'], rowLimit }
        ),
        gscRequest(
          `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          credentials,
          {
            startDate: prevStart.toISOString().split('T')[0],
            endDate: prevEnd.toISOString().split('T')[0],
            dimensions: ['query'],
            rowLimit,
          }
        ),
      ]);

      const prevMap = new Map(
        (previousData.rows || []).map((r: any) => [r.keys[0], r])
      );

      const keywords = (currentData.rows || []).map((row: any) => {
        const keyword = row.keys[0];
        const prev = prevMap.get(keyword) as any;
        const prevClicks = prev ? Math.round(prev.clicks) : 0;
        const currentClicks = Math.round(row.clicks);
        const changePercent =
          prevClicks > 0
            ? parseFloat((((currentClicks - prevClicks) / prevClicks) * 100).toFixed(1))
            : null;

        return {
          keyword,
          position: parseFloat(row.position.toFixed(1)),
          clicks: currentClicks,
          impressions: Math.round(row.impressions),
          ctr: parseFloat(row.ctr.toFixed(4)),
          trend:
            changePercent === null ? 'new' : changePercent > 2 ? 'up' : changePercent < -2 ? 'down' : 'stable',
          changePercent,
        };
      });

      return {
        success: true,
        data: { keywords, period, totalKeywords: keywords.length, property: siteUrl },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const getPagePerformanceTool: AgentTool = {
  name: 'seo_page_performance',
  description: 'Get SEO performance metrics for the top pages of the connected property',
  category: 'seo',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      startDate: {
        type: 'string',
        description: 'Start date YYYY-MM-DD (defaults to last 30 days)',
      },
      endDate: {
        type: 'string',
        description: 'End date YYYY-MM-DD (defaults to today)',
      },
      limit: {
        type: 'string',
        description: 'Number of pages to return (default: 20)',
      },
    },
  },

  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const limit = parseInt(String(params.limit || '20'), 10) || 20;
    const { startDate, endDate } = (params.startDate && params.endDate)
      ? { startDate: params.startDate, endDate: params.endDate }
      : formatDateRange('30d');

    try {
      const credentials = await getValidCredentials();
      const siteUrl = credentials.selected_property!;

      const data = await gscRequest(
        `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        credentials,
        { startDate, endDate, dimensions: ['page'], rowLimit: limit }
      );

      const pages = await Promise.all(
        (data.rows || []).slice(0, limit).map(async (row: any) => {
          const pageUrl = row.keys[0];
          let topQueries: string[] = [];

          try {
            const queryData = await gscRequest(
              `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
              credentials,
              {
                startDate,
                endDate,
                dimensions: ['query'],
                dimensionFilterGroups: [{
                  filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
                }],
                rowLimit: 3,
              }
            );
            topQueries = (queryData.rows || []).map((r: any) => r.keys[0]);
          } catch {
            // Skip query fetch errors for individual pages
          }

          return {
            url: pageUrl,
            clicks: Math.round(row.clicks),
            impressions: Math.round(row.impressions),
            ctr: parseFloat(row.ctr.toFixed(4)),
            position: parseFloat(row.position.toFixed(1)),
            topQueries,
          };
        })
      );

      return {
        success: true,
        data: { pages, totalPages: (data.rows || []).length, property: siteUrl },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const getSEOIssuesTool: AgentTool = {
  name: 'seo_issues_report',
  description: 'Get SEO overview including indexed page count and sitemaps from Google Search Console',
  category: 'seo',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: any, _context: ToolContext): Promise<ToolResult> {
    try {
      const credentials = await getValidCredentials();
      const siteUrl = credentials.selected_property!;
      const { startDate, endDate } = formatDateRange('30d');

      const [analyticsData, sitemapsData] = await Promise.all([
        gscRequest(
          `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          credentials,
          { startDate, endDate, dimensions: ['page'], rowLimit: 1000 }
        ),
        gscRequest(`/sites/${encodeURIComponent(siteUrl)}/sitemaps`, credentials).catch(() => ({ sitemap: [] })),
      ]);

      return {
        success: true,
        data: {
          summary: {
            pagesWithSearchTraffic: (analyticsData.rows || []).length,
            sitemaps: (sitemapsData.sitemap || []).map((s: any) => ({
              path: s.path,
              lastSubmitted: s.lastSubmitted,
              isPending: s.isPending,
              isSitemapsIndex: s.isSitemapsIndex,
              warnings: s.warnings,
              errors: s.errors,
            })),
          },
          property: siteUrl,
          lastChecked: new Date().toISOString(),
          note: 'For detailed coverage errors and mobile usability issues, check Google Search Console directly.',
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const getBacklinksTool: AgentTool = {
  name: 'seo_backlinks_report',
  description: 'Get Discover and News traffic data from Google Search Console',
  category: 'seo',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'string',
        description: 'Number of results to return (default: 20)',
      },
    },
  },

  async execute(params: any, _context: ToolContext): Promise<ToolResult> {
    const limit = parseInt(String(params.limit || '20'), 10) || 20;

    try {
      const credentials = await getValidCredentials();
      const siteUrl = credentials.selected_property!;
      const { startDate, endDate } = formatDateRange('90d');

      const discoverData = await gscRequest(
        `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        credentials,
        { startDate, endDate, dimensions: ['page'], rowLimit: limit, type: 'discover' }
      ).catch(() => ({ rows: [] }));

      return {
        success: true,
        data: {
          discoverTraffic: (discoverData.rows || []).map((r: any) => ({
            url: r.keys[0],
            clicks: Math.round(r.clicks),
            impressions: Math.round(r.impressions),
          })),
          note: 'Raw backlink lists (linking domains/pages) are not available via the GSC API. For a full backlink report, consider integrating Ahrefs or SEMrush.',
          property: siteUrl,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

// Export all SEO tools
export const googleSearchConsoleTools = [
  getSearchAnalyticsTool,
  getTopKeywordsTool,
  getPagePerformanceTool,
  getSEOIssuesTool,
  getBacklinksTool,
];
