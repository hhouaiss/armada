import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, LLMTool } from '../types.js';
import { buildOpenAIUserContent } from '../../attachments.js';

/**
 * Ollama Provider
 * Uses the OpenAI-compatible API exposed by Ollama at localhost.
 * No API key needed — the stored value is the base URL (e.g. http://localhost:11434).
 */
export class OllamaProvider implements LLMProvider {
  private client: OpenAI;
  private modelName: string;

  constructor(baseUrl: string, modelName: string) {
    const normalizedUrl = baseUrl.replace(/\/$/, '');
    this.client = new OpenAI({
      apiKey: 'ollama', // Ollama ignores the key but the SDK requires a non-empty value
      baseURL: `${normalizedUrl}/v1`,
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

    if (params.systemPrompt) {
      openAIMessages.push({ role: 'system', content: params.systemPrompt });
    }

    for (const msg of params.messages) {
      if (msg.role === 'user') {
        const content = Array.isArray(msg.content)
          ? msg.content
          : [{ type: 'text', text: msg.content as string }];

        const textBlocks = content.filter((c: any) => c.type === 'text');
        const toolResultBlocks = content.filter((c: any) => c.type === 'tool_result');

        if (toolResultBlocks.length > 0) {
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

          if (textBlocks.length > 0) {
            openAIMessages.push({
              role: 'user',
              content: textBlocks.map((b: any) => b.text).join('\n'),
            });
          }
        } else {
          // Plain user message — may carry image blocks (multimodal)
          const plain = typeof msg.content === 'string'
            ? msg.content
            : buildOpenAIUserContent(content as any[]);
          openAIMessages.push({ role: 'user', content: plain as any });
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
      const isConnectionError =
        err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND' || err?.cause?.code === 'ECONNREFUSED';
      if (isConnectionError) {
        throw new Error(
          `Cannot connect to Ollama at the configured URL. Make sure Ollama is running (ollama serve) and the URL is correct.`
        );
      }
      throw err;
    }

    const choice = response.choices[0];
    const message = choice.message;

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
