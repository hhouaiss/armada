import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, LLMTool } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.client = new Anthropic({ apiKey });
    this.modelName = modelName;
  }

  async chat(params: {
    messages: Anthropic.MessageParam[];
    systemPrompt?: string;
    tools?: LLMTool[];
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: params.maxTokens || 4096,
      system: params.systemPrompt,
      messages: params.messages,
      tools: params.tools as any,
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const toolUseBlocks = response.content.filter((c) => c.type === 'tool_use');

    return {
      content: textContent && 'text' in textContent ? textContent.text : '',
      toolCalls: toolUseBlocks.map((block: any) => ({
        id: block.id,
        name: block.name,
        input: block.input,
      })),
      stopReason: response.stop_reason || undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
