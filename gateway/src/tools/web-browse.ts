/**
 * web_browse — Web Navigation Tool
 *
 * Allows agents to read any URL and extract its content as clean text/markdown.
 * Uses Jina Reader API (r.jina.ai) — no extra dependencies, returns clean markdown.
 *
 * Use cases:
 * - Read a Shopify product page by URL
 * - Analyze competitor pages
 * - Verify links and redirects
 * - Extract content from landing pages, blog posts, etc.
 */

import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';

const JINA_BASE = 'https://r.jina.ai/';
const MAX_CONTENT_CHARS = 8_000;

export const webBrowseTool: AgentTool = {
  name: 'web_browse',
  description:
    'Navigate to any URL and read its content as clean text. ' +
    'Use this to: find and inspect a Shopify product page by URL, analyze a competitor page, ' +
    'verify a link works, read an article, or extract content from any webpage. ' +
    'Provide the full URL including https://.',
  category: 'web',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to browse (must start with https:// or http://)',
      },
      focus: {
        type: 'string',
        description:
          'Optional: what to focus on in the extracted content (e.g., "product description", "pricing", "navigation links")',
      },
    },
    required: ['url'],
  },

  async execute(params: { url: string; focus?: string }, context: ToolContext): Promise<ToolResult> {
    const { url, focus } = params;

    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        success: false,
        error: 'URL must start with http:// or https://',
      };
    }

    try {
      // Use Jina Reader for clean content extraction
      const jinaUrl = `${JINA_BASE}${encodeURIComponent(url)}`;

      const response = await fetch(jinaUrl, {
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'Armada-Agent/1.0 (Business Automation)',
          // Return markdown format
          'X-Return-Format': 'markdown',
        },
        signal: AbortSignal.timeout(20_000), // 20s timeout
      });

      if (!response.ok) {
        // Fallback: try direct fetch with text extraction
        return await directFetch(url);
      }

      let content = await response.text();

      // Trim to budget
      if (content.length > MAX_CONTENT_CHARS) {
        content = content.slice(0, MAX_CONTENT_CHARS) + '\n\n[... contenu tronqué ...]';
      }

      return {
        success: true,
        data: {
          url,
          content,
          focusHint: focus || null,
          note: focus
            ? `Focus demandé: "${focus}" — cherchez ces informations dans le contenu ci-dessus.`
            : undefined,
        },
      };
    } catch (error) {
      // Fallback to direct fetch
      try {
        return await directFetch(url);
      } catch {
        return {
          success: false,
          error: `Impossible de lire l'URL: ${error instanceof Error ? error.message : 'Erreur réseau'}`,
        };
      }
    }
  },
};

/** Direct fetch fallback — strips HTML tags, extracts visible text. */
async function directFetch(url: string): Promise<ToolResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; Armada-Agent/1.0; +https://storeteam.ai/bot)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText} — ${url}`,
    };
  }

  const contentType = response.headers.get('content-type') || '';
  let text = await response.text();

  // Strip HTML if needed
  if (contentType.includes('text/html')) {
    text = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  if (text.length > MAX_CONTENT_CHARS) {
    text = text.slice(0, MAX_CONTENT_CHARS) + '\n\n[... contenu tronqué ...]';
  }

  return {
    success: true,
    data: {
      url,
      content: text,
      note: 'Fallback: contenu extrait directement (sans rendu Jina).',
    },
  };
}
