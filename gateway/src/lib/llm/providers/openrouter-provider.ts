import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, LLMTool } from '../types.js';

/**
 * OpenRouter Provider
 * Uses the OpenAI-compatible API via OpenRouter for open source models (Kimi, Llama, etc.)
 * OpenRouter acts as a unified gateway so we can reuse OpenAI SDK with a custom baseURL.
 */
export class OpenRouterProvider implements LLMProvider {
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://storeteam.ai',
        'X-Title': 'StoreTeam',
      },
    });
    this.modelName = modelName;
  }

  async chat(params: {
    messages: Anthropic.MessageParam[];
    systemPrompt?: string;
    tools?: LLMTool[];
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [];

    // Add system message
    if (params.systemPrompt) {
      openAIMessages.push({ role: 'system', content: params.systemPrompt });
    }

    // Convert Anthropic-format messages to OpenAI format
    for (const msg of params.messages) {
      if (msg.role === 'user') {
        const content = Array.isArray(msg.content)
          ? msg.content
          : [{ type: 'text', text: msg.content as string }];

        const textBlocks = content.filter((c: any) => c.type === 'text');
        const toolResultBlocks = content.filter((c: any) => c.type === 'tool_result');

        if (toolResultBlocks.length > 0) {
          // Convert tool results — only add if previous assistant message had tool_calls
          const lastMsg = openAIMessages[openAIMessages.length - 1];
          const hasToolCalls =
            lastMsg?.role === 'assistant' &&
            'tool_calls' in lastMsg &&
            lastMsg.tool_calls;

          if (hasToolCalls) {
            for (const toolResult of toolResultBlocks) {
              const tr = toolResult as any;
              openAIMessages.push({
                role: 'tool',
                tool_call_id: tr.tool_use_id,
                content: typeof tr.content === 'string'
                  ? tr.content
                  : JSON.stringify(tr.content),
              });
            }
          }

          // Add any text blocks as a separate user message
          if (textBlocks.length > 0) {
            openAIMessages.push({
              role: 'user',
              content: textBlocks.map((b: any) => b.text).join('\n'),
            });
          }
        } else {
          // Plain user message
          const text = textBlocks.length > 0
            ? textBlocks.map((b: any) => b.text).join('\n')
            : typeof msg.content === 'string'
              ? msg.content
              : '';
          openAIMessages.push({ role: 'user', content: text });
        }
      } else if (msg.role === 'assistant') {
        const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content as string }];
        const textBlocks = content.filter((c: any) => c.type === 'text');
        const toolUseBlocks = content.filter((c: any) => c.type === 'tool_use');

        if (toolUseBlocks.length > 0) {
          openAIMessages.push({
            role: 'assistant',
            content: textBlocks.map((b: any) => b.text).join('\n') || null,
            tool_calls: toolUseBlocks.map((tc: any) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.input),
              },
            })),
          });
        } else {
          openAIMessages.push({
            role: 'assistant',
            content: textBlocks.map((b: any) => b.text).join('\n'),
          });
        }
      }
    }

    // Convert tools from Anthropic format to OpenAI format
    const openAITools: OpenAI.ChatCompletionTool[] | undefined =
      params.tools && params.tools.length > 0
        ? params.tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
            },
          }))
        : undefined;

    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.modelName,
      messages: openAIMessages,
      max_tokens: params.maxTokens || 4096,
      ...(openAITools ? { tools: openAITools } : {}),
    };

    let response: OpenAI.ChatCompletion;
    try {
      response = await this.client.chat.completions.create(requestParams);
    } catch (err: any) {
      if (err?.status === 503 || err?.code === 503) {
        const meta = err?.error?.metadata;
        const providerName = meta?.provider_name || 'the upstream provider';
        let detail = '';
        try {
          const raw = typeof meta?.raw === 'string' ? JSON.parse(meta.raw) : meta?.raw;
          detail = raw?.error?.message || '';
        } catch { /* ignore */ }
        throw new Error(
          `Model "${this.modelName}" is temporarily unavailable on OpenRouter` +
          (providerName ? ` (via ${providerName})` : '') +
          (detail ? `: ${detail}` : '. Try again in a few minutes or switch to a different model.')
        );
      }
      throw err;
    }

    const choice = response.choices[0];
    const message = choice.message;

    // Extract tool calls
    const toolCalls = message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      input: (() => {
        try {
          return JSON.parse(tc.function.arguments);
        } catch {
          return {};
        }
      })(),
    }));

    return {
      content: message.content || '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: choice.finish_reason || undefined,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
