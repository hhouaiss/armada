import { PrismaClient } from '@prisma/client';
import { decrypt } from '../encryption.js';
import { LLMProvider, ModelConfig } from './types.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { OpenRouterProvider } from './providers/openrouter-provider.js';
import { OllamaProvider } from './providers/ollama-provider.js';

const prisma = new PrismaClient();

export async function createLLMProvider(
  userId: string,
  modelProvider: string,
  modelName: string
): Promise<LLMProvider> {
  // Ollama is local — no API key needed, the stored value is the base URL
  if (modelProvider === 'ollama') {
    const urlRecord = await prisma.lLMApiKey.findUnique({
      where: { userId_provider: { userId, provider: 'ollama' } },
    });
    const baseUrl = urlRecord
      ? decrypt(urlRecord.apiKey)
      : (process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
    return new OllamaProvider(baseUrl, modelName);
  }

  // Get API key for the provider
  const apiKeyRecord = await prisma.lLMApiKey.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: modelProvider,
      },
    },
  });

  if (!apiKeyRecord) {
    // Fallback to environment variables for backward compatibility
    const envKey = getEnvApiKey(modelProvider);
    if (!envKey) {
      throw new Error(`No API key found for provider: ${modelProvider}. Please add it in Settings → Models.`);
    }
    return createProviderInstance(modelProvider, modelName, envKey);
  }

  if (!apiKeyRecord.isActive) {
    throw new Error(`API key for ${modelProvider} is disabled. Please enable it in Settings → Models.`);
  }

  // Decrypt the API key
  const apiKey = decrypt(apiKeyRecord.apiKey);

  return createProviderInstance(modelProvider, modelName, apiKey);
}

function createProviderInstance(provider: string, modelName: string, apiKey: string): LLMProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, modelName);
    case 'openai':
      return new OpenAIProvider(apiKey, modelName);
    case 'openrouter':
      return new OpenRouterProvider(apiKey, modelName);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

function getEnvApiKey(provider: string): string | undefined {
  switch (provider) {
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
    default:
      return undefined;
  }
}

// Helper to get model configuration from agent
export async function getAgentModelConfig(agentId: string): Promise<ModelConfig> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { store: { include: { user: true } } },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  return {
    provider: agent.modelProvider || 'anthropic',
    modelName: agent.modelName || 'claude-sonnet-4-5-20250929',
    apiKey: '', // Will be fetched by createLLMProvider
  };
}
