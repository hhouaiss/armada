import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenAIUserContent,
  buildUserContent,
  normalizeAttachment,
  normalizeAttachments,
  pruneHistoryImages,
  supportsVision,
  toDataUrl,
} from './attachments.js';

// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('normalizeAttachment accepts raw base64 and data URLs', () => {
  const raw = normalizeAttachment({ type: 'image', mediaType: 'image/png', data: PNG });
  assert.equal(raw?.mediaType, 'image/png');
  assert.equal(raw?.data, PNG);

  const dataUrl = normalizeAttachment({ data: `data:image/png;base64,${PNG}` });
  assert.equal(dataUrl?.mediaType, 'image/png');
  assert.equal(dataUrl?.data, PNG);

  assert.equal(normalizeAttachment({ mediaType: 'image/jpg', data: PNG })?.mediaType, 'image/jpeg');
});

test('normalizeAttachment rejects unsupported types and junk payloads', () => {
  assert.equal(normalizeAttachment({ mediaType: 'application/pdf', data: PNG }), null);
  assert.equal(normalizeAttachment({ mediaType: 'image/png', data: 'not base64!!' }), null);
  assert.equal(normalizeAttachment({ mediaType: 'image/png', data: '' }), null);
  assert.equal(normalizeAttachment(null), null);
  // Oversized: >5MB of base64
  assert.equal(normalizeAttachment({ mediaType: 'image/png', data: 'A'.repeat(8_000_000) }), null);
});

test('normalizeAttachments drops invalid entries and caps the count', () => {
  const list = normalizeAttachments([
    { mediaType: 'image/png', data: PNG },
    { mediaType: 'text/plain', data: PNG },
    ...Array.from({ length: 8 }, () => ({ mediaType: 'image/png', data: PNG })),
  ]);
  assert.equal(list.length, 5);
  assert.equal(normalizeAttachments('nope' as any).length, 0);
});

test('buildUserContent keeps plain text when there is no image', () => {
  assert.equal(buildUserContent('bonjour', []), 'bonjour');
});

test('buildUserContent puts images before the text', () => {
  const att = normalizeAttachment({ mediaType: 'image/png', data: PNG })!;
  const content = buildUserContent('Que vois-tu ?', [att]) as any[];
  assert.equal(content.length, 2);
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/png');
  assert.equal(content[1].text, 'Que vois-tu ?');

  // No caption → a label describes the attachment instead of an empty text block
  const noText = buildUserContent('', [att]) as any[];
  assert.match(noText[1].text, /1 image/);
});

test('pruneHistoryImages replaces images outside the trailing window', () => {
  const att = normalizeAttachment({ mediaType: 'image/png', data: PNG })!;
  const imageMsg = { role: 'user' as const, content: buildUserContent('x', [att]) as any };
  const history = [
    imageMsg,
    { role: 'assistant' as const, content: 'ok' },
    { role: 'user' as const, content: 'et ensuite ?' },
  ];

  const pruned = pruneHistoryImages(history, 1);
  assert.equal((pruned[0].content as any[])[0].type, 'text');
  assert.match((pruned[0].content as any[])[0].text, /image analysée/);

  // Recent images are untouched
  const kept = pruneHistoryImages(history, 3);
  assert.equal((kept[0].content as any[])[0].type, 'image');
});

test('buildOpenAIUserContent converts image blocks to image_url parts', () => {
  const att = normalizeAttachment({ mediaType: 'image/png', data: PNG })!;
  const blocks = buildUserContent('analyse', [att]) as any[];
  const parts = buildOpenAIUserContent(blocks) as any[];
  assert.equal(parts[0].type, 'image_url');
  assert.equal(parts[0].image_url.url, toDataUrl(att));
  assert.equal(parts[1].text, 'analyse');

  // Text-only turns stay plain strings (unchanged payload for existing chats)
  assert.equal(buildOpenAIUserContent([{ type: 'text', text: 'salut' }]), 'salut');
});

test('supportsVision flags known text-only models', () => {
  assert.equal(supportsVision('claude-sonnet-4-5-20250929'), true);
  assert.equal(supportsVision('gpt-4o'), true);
  assert.equal(supportsVision('google/gemma-4-31b-it'), true);
  assert.equal(supportsVision('deepseek/deepseek-v4-flash'), false);
  assert.equal(supportsVision('llama-3.3-70b-versatile'), false);
});
