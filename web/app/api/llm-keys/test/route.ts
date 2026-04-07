import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'Provider and API key are required' }, { status: 400 });
    }

    try {
      switch (provider) {
        case 'anthropic':
          await testAnthropicKey(apiKey);
          break;
        case 'openai':
          await testOpenAIKey(apiKey);
          break;
        case 'openrouter':
          await testOpenRouterKey(apiKey);
          break;
        case 'ollama':
          await testOllamaConnection(apiKey);
          break;
        default:
          return NextResponse.json({ error: 'Provider testing not yet implemented' }, { status: 400 });
      }

      return NextResponse.json({ valid: true, message: 'Connexion réussie' });
    } catch (error: any) {
      console.error('API key test failed:', error);
      return NextResponse.json({ valid: false, message: error.message || 'Clé API invalide' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error testing API key:', error);
    return NextResponse.json({ error: 'Failed to test API key' }, { status: 500 });
  }
}

async function testAnthropicKey(apiKey: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }],
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Anthropic error ${res.status}`);
  }
}

async function testOpenAIKey(apiKey: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }],
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  }
}

async function testOpenRouterKey(apiKey: string) {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clé OpenRouter invalide : ${text}`);
  }
  const data = await res.json();
  if (!data.data || data.data.length === 0) {
    throw new Error('OpenRouter : aucun modèle retourné');
  }
}

async function testOllamaConnection(baseUrl: string) {
  const normalizedUrl = baseUrl.replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${normalizedUrl}/api/tags`);
  } catch {
    throw new Error(`Impossible de joindre Ollama à ${baseUrl}. Vérifiez qu'Ollama est lancé (ollama serve).`);
  }
  if (!res.ok) {
    throw new Error(`Ollama non accessible à ${baseUrl} (HTTP ${res.status})`);
  }
  const data = await res.json();
  const models: string[] = (data.models || []).map((m: any) => m.name as string);
  if (!models.some((m) => m.startsWith('gemma4'))) {
    throw new Error(`Ollama fonctionne mais gemma4:e4b n'est pas installé. Lancez : ollama pull gemma4:e4b`);
  }
}
