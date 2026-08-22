import Anthropic from '@anthropic-ai/sdk';

const SECRET_KEY_RE = /(?:authorization|token|secret|password|api[_-]?key|cookie|body|content|message|html|text)/i;

export function safeArgumentSummary(params: Record<string, any> | undefined) {
  const keys = Object.keys(params || {}).filter((key) => key !== '_armada_account');
  return { redacted: true, argumentKeys: keys, sensitiveKeys: keys.filter((key) => SECRET_KEY_RE.test(key)) };
}

/**
 * One-line, length-capped rendering of a native tool's arguments.
 * console.log of a raw object pretty-prints across many lines, which inflates
 * the log rate (Railway drops above 500 lines/sec) and can spill payload text.
 */
export function compactArgumentLog(params: Record<string, any> | undefined, maxLength = 300): string {
  let json: string;
  try {
    json = JSON.stringify(params ?? {});
  } catch {
    return '[unserializable arguments]';
  }
  return json.length > maxLength ? `${json.slice(0, maxLength)}… (${json.length} chars)` : json;
}

/** Remove raw MCP inputs/results before conversation history is persisted. */
export function redactConnectorHistory(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const connectorToolIds = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content as any[]) {
      if (block.type === 'tool_use' && typeof block.name === 'string' && block.name.includes('__')) {
        connectorToolIds.add(block.id);
      }
    }
  }
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    return {
      ...message,
      content: (message.content as any[]).map((block) => {
        if (block.type === 'tool_use' && connectorToolIds.has(block.id)) {
          return { ...block, input: safeArgumentSummary(block.input) };
        }
        if (block.type === 'tool_result' && connectorToolIds.has(block.tool_use_id)) {
          return { ...block, content: '[Résultat MCP externe non conservé — contenu disponible uniquement pendant ce tour]' };
        }
        return block;
      }),
    } as Anthropic.MessageParam;
  });
}
