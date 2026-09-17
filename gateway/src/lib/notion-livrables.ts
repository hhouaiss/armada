import type { ToolContext } from '../types/operations.js';
import type { ToolRegistry } from '../core/tool-registry.js';

export interface LivrableEvidence {
  source: 'notion' | 'armada';
  ref?: string;
  url?: string;
  title?: string;
  content?: string;
  error?: string;
}

export interface NotionWrite {
  tool: string;
  refs: string[];
}

const MAX_PAGES = 3;
const MAX_CHARS = 6000;
const NOTION_URL = /https:\/\/(?:www\.)?notion\.(?:so|site)\/[^\s"'\\)]+/g;
const NOTION_ID = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi;

export function isNotionWrite(toolName: string): boolean {
  return /notion/i.test(toolName) && /(create|update|append|insert|duplicate)/i.test(toolName);
}

/**
 * Pages an agent wrote: created pages are read from the tool result (the input
 * only holds the parent), updated pages from the input.
 */
export function extractNotionRefs(toolName: string, input: unknown, result: unknown): string[] {
  const source = JSON.stringify(/create|duplicate/i.test(toolName) ? result : input) ?? '';
  const urls = source.match(NOTION_URL) ?? [];
  const ids = urls.length ? [] : source.match(NOTION_ID) ?? [];
  return [...new Set([...urls, ...ids])].slice(0, MAX_PAGES);
}

/** Reads the pages back with the same connector and agent grants that wrote them. */
export async function fetchNotionLivrables(
  writes: NotionWrite[],
  registry: ToolRegistry,
  context: ToolContext,
): Promise<LivrableEvidence[]> {
  const seen = new Set<string>();
  const jobs: Promise<LivrableEvidence>[] = [];
  for (const write of writes) {
    for (const ref of write.refs) {
      if (seen.has(ref) || seen.size >= MAX_PAGES) continue;
      seen.add(ref);
      jobs.push(fetchOne(write.tool, ref, registry, context));
    }
  }
  return Promise.all(jobs);
}

async function fetchOne(writerTool: string, ref: string, registry: ToolRegistry, context: ToolContext): Promise<LivrableEvidence> {
  const url = ref.startsWith('http') ? ref : undefined;
  const mcpPrefix = writerTool.includes('__') ? writerTool.split('__')[0] : null;
  const mcpFetch = mcpPrefix ? `${mcpPrefix}__notion-fetch` : null;

  let toolName: string;
  let params: Record<string, string>;
  if (mcpFetch && registry.get(mcpFetch)) {
    toolName = mcpFetch;
    params = { id: ref };
  } else if (registry.get('notion_get_page') && (url ? /[0-9a-f]{32}/i.test(url) : true)) {
    toolName = 'notion_get_page';
    params = { page_id: url ? url.match(/[0-9a-f]{32}/gi)!.pop()! : ref };
  } else {
    return { source: 'notion', ref, url, error: 'no Notion read tool available for this page' };
  }

  try {
    const result = await registry.execute(toolName, params, context);
    if (!result.success) return { source: 'notion', ref, url, error: result.error ?? 'fetch failed' };
    const text = collectText(result.data);
    return {
      source: 'notion',
      ref,
      url: url ?? (result.data as any)?.url,
      title: (text.match(/^#\s*(.+)$/m) ?? text.match(/"?title"?\s*[:=]\s*"([^"]+)"/))?.[1]?.slice(0, 120),
      content: text.slice(0, MAX_CHARS),
    };
  } catch (err) {
    return { source: 'notion', ref, url, error: err instanceof Error ? err.message : String(err) };
  }
}

function collectText(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(collectText).filter(Boolean).join('\n');
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
    if (obj.content != null) return collectText(obj.content);
    return JSON.stringify(obj);
  }
  return String(data);
}
