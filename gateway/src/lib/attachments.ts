/**
 * Multimodal attachments — images in chat (web app + Telegram).
 *
 * A single normalized shape (`ChatAttachment`) travels from every channel
 * (WebSocket chat, Telegram photo/document) down to the LLM providers, which
 * translate it to their own wire format:
 *   - Anthropic  → { type: 'image', source: { type: 'base64', ... } }
 *   - OpenAI-ish → { type: 'image_url', image_url: { url: 'data:...' } }
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ChatAttachment {
  type: 'image';
  /** MIME type — one of SUPPORTED_IMAGE_TYPES. */
  mediaType: string;
  /** Raw base64 payload (no `data:` prefix). */
  data: string;
  /** Original file name, when the channel provides one. */
  name?: string;
}

export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Anthropic caps images at 5 MB each; keep the same budget everywhere. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/**
 * Number of trailing messages that keep their image blocks in the stored
 * history / LLM window. Older images become a text placeholder so a long
 * conversation doesn't grow into megabytes of base64.
 */
export const IMAGE_HISTORY_KEEP_LAST = 4;

function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/**
 * Validate and normalize one attachment coming from an untrusted channel.
 * Accepts either a raw base64 string or a `data:image/png;base64,...` URL.
 * Returns null when the attachment is unusable (caller decides how to report).
 */
export function normalizeAttachment(raw: any): ChatAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type && raw.type !== 'image') return null;

  let data = typeof raw.data === 'string' ? raw.data.trim() : '';
  let mediaType = typeof raw.mediaType === 'string' ? raw.mediaType.toLowerCase().trim() : '';

  const dataUrl = data.match(/^data:([a-z0-9.+/-]+);base64,(.*)$/is);
  if (dataUrl) {
    mediaType = mediaType || dataUrl[1].toLowerCase();
    data = dataUrl[2];
  }
  data = data.replace(/\s/g, '');

  if (!data) return null;
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
  if (!SUPPORTED_IMAGE_TYPES.includes(mediaType as any)) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  if (base64Bytes(data) > MAX_IMAGE_BYTES) return null;

  const name = typeof raw.name === 'string' ? raw.name.slice(0, 120) : undefined;
  return { type: 'image', mediaType, data, ...(name ? { name } : {}) };
}

/** Normalize a list, dropping invalid entries and capping the count. */
export function normalizeAttachments(raw: any): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeAttachment)
    .filter((a): a is ChatAttachment => a !== null)
    .slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
}

export function toDataUrl(attachment: ChatAttachment): string {
  return `data:${attachment.mediaType};base64,${attachment.data}`;
}

/**
 * Build the Anthropic content blocks for a user turn: images first (models
 * reason better when the image precedes the question), then the text.
 */
export function buildUserContent(
  text: string,
  attachments: ChatAttachment[] = []
): Anthropic.MessageParam['content'] {
  if (attachments.length === 0) return text;

  const blocks: Exclude<Anthropic.MessageParam['content'], string> = attachments.map((att) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: att.mediaType as any,
      data: att.data,
    },
  }));

  const label =
    attachments.length === 1
      ? "[L'utilisateur a joint 1 image à ce message.]"
      : `[L'utilisateur a joint ${attachments.length} images à ce message.]`;

  blocks.push({ type: 'text', text: text?.trim() ? text : label });
  return blocks;
}

function placeholderFor(block: any): any {
  const type = block?.source?.media_type ?? 'image';
  return { type: 'text', text: `[image analysée précédemment — ${type}]` };
}

/**
 * Replace image blocks with a text placeholder everywhere except in the last
 * `keepLast` messages. Used both before persisting a conversation and when
 * building the LLM context window, so base64 never accumulates.
 */
export function pruneHistoryImages<T extends Anthropic.MessageParam>(
  messages: T[],
  keepLast: number = IMAGE_HISTORY_KEEP_LAST
): T[] {
  const cutoff = messages.length - keepLast;
  return messages.map((msg, i) => {
    if (i >= cutoff) return msg;
    if (!Array.isArray(msg.content)) return msg;
    if (!msg.content.some((b: any) => b?.type === 'image')) return msg;
    return {
      ...msg,
      content: msg.content.map((b: any) => (b?.type === 'image' ? placeholderFor(b) : b)),
    };
  });
}

/** True when the message carries at least one image block. */
export function hasImageBlocks(msg: Anthropic.MessageParam): boolean {
  return Array.isArray(msg.content) && msg.content.some((b: any) => b?.type === 'image');
}

// ── Vision-capable model routing ─────────────────────────────────────────────

/**
 * Models known NOT to accept images. Everything else is assumed multimodal:
 * the current Claude, GPT-4o/o3, Gemini and Gemma 4 families all are, and a
 * false positive simply means the provider returns an error we surface.
 */
const TEXT_ONLY_MODEL_PATTERNS = [
  /^o1-mini/i,
  /^gpt-3\.5/i,
  /llama-3\.[13]/i,
  /deepseek/i,
  /^moonshot-v1/i,
  /^abab/i,
];

export function supportsVision(modelName: string): boolean {
  return !TEXT_ONLY_MODEL_PATTERNS.some((re) => re.test(modelName));
}

/** Vision-capable fallback for each provider, used when images are attached. */
export const VISION_FALLBACK_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  openrouter: 'google/gemma-4-31b-it',
  gemini: 'gemini-1.5-flash',
  ollama: 'gemma4:e4b',
};

// ── OpenAI-compatible conversion ─────────────────────────────────────────────

/**
 * Build the `content` of an OpenAI-style user message from Anthropic blocks.
 * Returns a plain string when there is no image, so text-only turns keep the
 * exact payload they had before multimodal support.
 */
export function buildOpenAIUserContent(blocks: any[]): string | any[] {
  const imageBlocks = blocks.filter((b: any) => b?.type === 'image');
  const text = blocks
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .filter(Boolean)
    .join('\n');

  if (imageBlocks.length === 0) return text;

  const parts: any[] = imageBlocks.map((b: any) => ({
    type: 'image_url',
    image_url: {
      url:
        b.source?.type === 'url'
          ? b.source.url
          : `data:${b.source?.media_type ?? 'image/jpeg'};base64,${b.source?.data ?? ''}`,
    },
  }));
  if (text) parts.push({ type: 'text', text });
  return parts;
}
