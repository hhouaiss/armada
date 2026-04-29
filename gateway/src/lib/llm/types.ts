import Anthropic from '@anthropic-ai/sdk';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMTool {
  name: string;
  description: string;
  input_schema: any;
}

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: any;
  }>;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  chat(params: {
    messages: Anthropic.MessageParam[];
    systemPrompt?: string;
    tools?: LLMTool[];
    maxTokens?: number;
  }): Promise<LLMResponse>;
}

export interface ModelConfig {
  provider: string;
  modelName: string;
  apiKey: string;
}

export const SUPPORTED_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'premium', pricing: '$15/$75 per 1M tokens' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', tier: 'balanced', pricing: '$3/$15 per 1M tokens' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', tier: 'fast', pricing: '$0.80/$4 per 1M tokens' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Cost-Effective)', tier: 'fast', pricing: '$0.15/$0.60 per 1M tokens' },
    { id: 'gpt-4o', name: 'GPT-4o (Medium)', tier: 'balanced', pricing: '$2.50/$10 per 1M tokens' },
    { id: 'o3', name: 'o3 (High Performance)', tier: 'premium', pricing: '$2/$8 per 1M tokens' },
  ],
  gemini: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tier: 'balanced' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tier: 'fast' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', tier: 'fast' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', tier: 'fast' },
  ],
  together: [
    { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B', tier: 'balanced' },
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B', tier: 'fast' },
  ],
  openrouter: [
    { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', tier: 'premium', pricing: '$0.50/$1.50 per 1M tokens' },
    { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', tier: 'fast', pricing: '$0.07/$0.28 per 1M tokens' },
    { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', tier: 'balanced' },
    { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B', tier: 'fast' },
  ],
  ollama: [
    { id: 'gemma4:e4b', name: 'Gemma 4 E4B (local)', tier: 'fast', pricing: 'Free (local)' },
  ],
  moonshot: [
    { id: 'moonshot-v1-128k', name: 'Kimi (Moonshot)', tier: 'balanced' },
  ],
  minimax: [
    { id: 'abab6.5-chat', name: 'MiniMax Chat', tier: 'balanced' },
  ],
} as const;
