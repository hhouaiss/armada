import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, LLMTool } from '../types.js';

/**
 * OpenAI Provider - Handles OpenAI API calls with model-specific configurations
 *
 * IMPORTANT: When adding new OpenAI models, update MODEL_CONFIG below:
 * - Reasoning models (o1, o3, etc.) use 'max_completion_tokens'
 * - Chat models (gpt-4o, etc.) use 'max_tokens'
 * - Check OpenAI docs for each model's parameter requirements
 *
 * This ensures compatibility across different OpenAI model families.
 */

// Model configuration for different OpenAI models
const MODEL_CONFIG: Record<string, { maxTokensParam: 'max_tokens' | 'max_completion_tokens' }> = {
  // Reasoning models use max_completion_tokens
  'o1': { maxTokensParam: 'max_completion_tokens' },
  'o1-mini': { maxTokensParam: 'max_completion_tokens' },
  'o1-preview': { maxTokensParam: 'max_completion_tokens' },
  'o3': { maxTokensParam: 'max_completion_tokens' },
  'o3-mini': { maxTokensParam: 'max_completion_tokens' },

  // GPT models use max_tokens (but newer versions might change)
  'gpt-4o': { maxTokensParam: 'max_tokens' },
  'gpt-4o-mini': { maxTokensParam: 'max_tokens' },
  'gpt-4-turbo': { maxTokensParam: 'max_tokens' },
  'gpt-4': { maxTokensParam: 'max_tokens' },
  'gpt-3.5-turbo': { maxTokensParam: 'max_tokens' },
};

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private modelName: string;
  private modelConfig: { maxTokensParam: 'max_tokens' | 'max_completion_tokens' };

  constructor(apiKey: string, modelName: string) {
    this.client = new OpenAI({ apiKey });
    this.modelName = modelName;

    // Get model config or default to max_completion_tokens for newer models
    this.modelConfig = MODEL_CONFIG[modelName] || { maxTokensParam: 'max_completion_tokens' };
  }

  async chat(params: {
    messages: Anthropic.MessageParam[];
    systemPrompt?: string;
    tools?: LLMTool[];
    maxTokens?: number;
  }): Promise<LLMResponse> {
    // Convert Anthropic format to OpenAI format
    const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [];

    // Add system message if provided
    if (params.systemPrompt) {
      openAIMessages.push({
        role: 'system',
        content: params.systemPrompt,
      });
    }

    // Convert messages
    for (const msg of params.messages) {
      if (msg.role === 'user') {
        // Check if this user message contains tool results
        const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content as string }];
        const textBlocks = content.filter((c: any) => c.type === 'text');
        const toolResultBlocks = content.filter((c: any) => c.type === 'tool_result');

        if (toolResultBlocks.length > 0) {
          // Validate: tool results should only exist if the previous message had tool_calls
          const lastMessage = openAIMessages[openAIMessages.length - 1];
          const hasToolCalls = lastMessage?.role === 'assistant' && 'tool_calls' in lastMessage && lastMessage.tool_calls;

          if (hasToolCalls) {
            // Convert tool_result blocks to OpenAI's tool messages
            // Note: In OpenAI, tool messages must directly follow the assistant message with tool_calls
            for (const toolResult of toolResultBlocks) {
              const result = toolResult as any; // Type assertion for tool_result block
              openAIMessages.push({
                role: 'tool' as const,
                tool_call_id: result.tool_use_id,
                content: typeof result.content === 'string'
                  ? result.content
                  : JSON.stringify(result.content),
              });
            }
          } else {
            // If there's no preceding tool_calls, treat tool_result as regular user content
            // This handles edge cases where message history is incomplete
            console.warn('⚠️  Found tool_result without preceding tool_calls, converting to user message');
            const allContent = [...textBlocks, ...toolResultBlocks]
              .map((b: any) => b.text || JSON.stringify(b.content || b))
              .join('\n');
            openAIMessages.push({
              role: 'user',
              content: allContent,
            });
          }

          // Note: We skip additional text content when there are valid tool results
          // The text content will be included in the next user message naturally
        } else {
          // Regular user message
          openAIMessages.push({
            role: 'user',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          });
        }
      } else if (msg.role === 'assistant') {
        // Handle tool use blocks
        const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content as string }];
        const textBlocks = content.filter((c: any) => c.type === 'text');
        const toolBlocks = content.filter((c: any) => c.type === 'tool_use');

        if (toolBlocks.length > 0) {
          // Assistant message with tool calls
          openAIMessages.push({
            role: 'assistant',
            content: textBlocks.length > 0 && 'text' in textBlocks[0] ? textBlocks[0].text : null,
            tool_calls: toolBlocks.map((block: any) => ({
              id: block.id,
              type: 'function' as const,
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            })),
          });
        } else {
          // Regular assistant message
          const text = textBlocks.length > 0 && 'text' in textBlocks[0] ? textBlocks[0].text : '';
          openAIMessages.push({
            role: 'assistant',
            content: text,
          });
        }
      }
    }

    // Convert tools to OpenAI format
    const openAITools: OpenAI.ChatCompletionTool[] | undefined = params.tools?.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));

    // Build request params with correct max tokens parameter for this model
    const maxTokensValue = params.maxTokens || 4096;
    const requestParams: any = {
      model: this.modelName,
      messages: openAIMessages,
      tools: openAITools,
    };

    // Use the correct parameter name based on model
    if (this.modelConfig.maxTokensParam === 'max_completion_tokens') {
      requestParams.max_completion_tokens = maxTokensValue;
    } else {
      requestParams.max_tokens = maxTokensValue;
    }

    const response = await this.client.chat.completions.create(requestParams);

    const message = response.choices[0]?.message;
    const content = message?.content || '';
    const toolCalls = message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    })) || [];

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: response.choices[0]?.finish_reason || undefined,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }
}
