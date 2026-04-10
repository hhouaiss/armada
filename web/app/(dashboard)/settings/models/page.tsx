'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Trash2, TestTube, Check, X, Loader2, Eye, EyeOff, AlertCircle, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    icon: '🤖',
    description: 'Claude Opus, Sonnet, Haiku models',
    pricing: '$0.80-$75 per 1M tokens',
    models: ['Claude Opus 4.6', 'Claude Sonnet 4.5', 'Claude Haiku 4.5'],
    keyPlaceholder: 'sk-ant-...',
  },
  openai: {
    name: 'OpenAI (GPT)',
    icon: '🔮',
    description: 'GPT-4o, GPT-4o-mini, o3 models',
    pricing: '$0.15-$10 per 1M tokens',
    models: ['GPT-4o-mini (Cost-Effective)', 'GPT-4o (Medium)', 'o3 (High Performance)'],
    keyPlaceholder: 'sk-proj-...',
  },
  openrouter: {
    name: 'OpenRouter (Open Source)',
    icon: '🌐',
    description: 'Access open source models like Kimi K2.5, Llama, Mistral and more',
    pricing: 'Varies by model – from free to $3/1M tokens',
    models: ['Kimi K2.5 (262K context)', 'Gemma 4 31B (Google open source)', 'and 100+ open source models'],
    keyPlaceholder: 'sk-or-...',
  },
};

interface ApiKey {
  provider: string;
  isActive: boolean;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
}

export default function ModelsSettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Ollama local config state
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaConfigured, setOllamaConfigured] = useState(false);
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [ollamaSaving, setOllamaSaving] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/llm-keys');
      const data = await res.json();
      const allKeys: ApiKey[] = data.keys || [];
      setKeys(allKeys);
      const ollamaKey = allKeys.find((k) => k.provider === 'ollama');
      if (ollamaKey) {
        setOllamaConfigured(true);
        // maskedKey stores the URL for ollama
        setOllamaUrl(ollamaKey.maskedKey.startsWith('http') ? ollamaKey.maskedKey : 'http://localhost:11434');
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const testOllama = async () => {
    setOllamaTesting(true);
    setOllamaTestResult(null);
    try {
      const res = await fetch('/api/llm-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'ollama', apiKey: ollamaUrl }),
      });
      const data = await res.json();
      setOllamaTestResult(data);
    } catch {
      setOllamaTestResult({ valid: false, message: 'Failed to reach Ollama' });
    } finally {
      setOllamaTesting(false);
    }
  };

  const saveOllama = async () => {
    setOllamaSaving(true);
    try {
      const res = await fetch('/api/llm-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'ollama', apiKey: ollamaUrl }),
      });
      if (res.ok) {
        setOllamaConfigured(true);
        setOllamaTestResult(null);
        await loadKeys();
      } else {
        const data = await res.json();
        setOllamaTestResult({ valid: false, message: data.error || 'Failed to save' });
      }
    } catch {
      setOllamaTestResult({ valid: false, message: 'Failed to save Ollama URL' });
    } finally {
      setOllamaSaving(false);
    }
  };

  const removeOllama = async () => {
    if (!confirm('Remove Ollama local model configuration?')) return;
    await fetch('/api/llm-keys?provider=ollama', { method: 'DELETE' });
    setOllamaConfigured(false);
    setOllamaUrl('http://localhost:11434');
    await loadKeys();
  };

  const testKey = async (provider: string, apiKey: string) => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/llm-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({ valid: false, message: 'Failed to test API key' });
    } finally {
      setTesting(false);
    }
  };

  const saveKey = async (provider: string, apiKey: string) => {
    setSaving(true);

    try {
      const res = await fetch('/api/llm-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });

      if (res.ok) {
        setAddingProvider(null);
        setNewKey('');
        setTestResult(null);
        await loadKeys();
      } else {
        const data = await res.json();
        setTestResult({ valid: false, message: data.error || 'Failed to save API key' });
      }
    } catch (error) {
      setTestResult({ valid: false, message: 'Failed to save API key' });
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (provider: string) => {
    if (!confirm(`Remove ${PROVIDERS[provider as keyof typeof PROVIDERS]?.name} API key?`)) return;

    try {
      await fetch(`/api/llm-keys?provider=${provider}`, {
        method: 'DELETE',
      });
      await loadKeys();
    } catch (error) {
      console.error('Failed to delete key:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF6B35]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">AI MODELS</h1>
        <p className="text-muted-foreground">
          Configure API keys for different AI providers. Mix and match models to optimize cost and performance.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="space-y-4">
        {Object.entries(PROVIDERS).map(([providerId, provider]) => {
          const existingKey = keys.find(k => k.provider === providerId);
          const isAdding = addingProvider === providerId;

          return (
            <motion.div
              key={providerId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-lg p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{provider.icon}</div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-1">{provider.name}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{provider.description}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">Pricing: {provider.pricing}</span>
                      {existingKey && (
                        <span className="flex items-center gap-1 text-green-400">
                          <Check className="w-3 h-3" />
                          Configured
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {existingKey ? (
                    <>
                      <div className="text-xs text-muted-foreground font-mono">
                        {existingKey.maskedKey}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteKey(providerId)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setAddingProvider(providerId)}
                      className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white"
                    >
                      <Key className="w-4 h-4 mr-2" />
                      Add API Key
                    </Button>
                  )}
                </div>
              </div>

              {/* Available Models */}
              <div className="flex flex-wrap gap-2 mb-4">
                {provider.models.map((model, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded bg-muted/30 border border-border text-muted-foreground"
                  >
                    {model}
                  </span>
                ))}
              </div>

              {/* Add Key Form */}
              {isAdding && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="border-t border-border pt-4 space-y-4"
                >
                  <div>
                    <label className="text-sm text-muted-foreground uppercase tracking-wide mb-2 block">
                      API Key
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={newKey}
                          onChange={(e) => setNewKey(e.target.value)}
                          placeholder={provider.keyPlaceholder}
                          className="w-full bg-background/60 border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#FF6B35] font-mono"
                        />
                        <button
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {testResult && (
                    <div
                      className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
                        testResult.valid
                          ? 'bg-green-950/20 border border-green-500/20 text-green-400'
                          : 'bg-red-950/20 border border-red-500/20 text-red-400'
                      }`}
                    >
                      {testResult.valid ? (
                        <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => testKey(providerId, newKey)}
                      disabled={!newKey || testing}
                      variant="outline"
                      className="border-border text-foreground/80"
                    >
                      {testing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4 mr-2" />
                      )}
                      Test Connection
                    </Button>

                    <Button
                      onClick={() => saveKey(providerId, newKey)}
                      disabled={!newKey || saving || (testResult != null && !testResult.valid)}
                      className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Save API Key
                    </Button>

                    <Button
                      onClick={() => {
                        setAddingProvider(null);
                        setNewKey('');
                        setTestResult(null);
                      }}
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Local Models Section */}
      <div className="border-t border-border pt-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Server className="w-5 h-5 text-[#FF6B35]" />
            LOCAL MODELS
          </h2>
          <p className="text-muted-foreground text-sm">
            Run open source models locally via Ollama — zero API cost, full privacy.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-lg p-6 space-y-4"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="text-4xl">🦙</div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Ollama</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Self-hosted inference — runs on your machine, no data leaves your infrastructure
                </p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-green-400 font-medium">Free — no token costs</span>
                  {ollamaConfigured && (
                    <span className="flex items-center gap-1 text-green-400">
                      <Check className="w-3 h-3" />
                      Configured
                    </span>
                  )}
                </div>
              </div>
            </div>
            {ollamaConfigured && (
              <Button
                size="sm"
                variant="ghost"
                onClick={removeOllama}
                className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Available local models */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-2 py-1 rounded bg-muted/30 border border-border text-muted-foreground">
              Gemma 4 E4B (gemma4:e4b)
            </span>
            <span className="text-xs px-2 py-1 rounded bg-muted/20 border border-dashed border-border text-muted-foreground italic">
              + any model installed via ollama pull
            </span>
          </div>

          {/* URL config — always visible */}
          <div className="border-t border-border pt-4 space-y-4">
            <div>
              <label className="text-sm text-muted-foreground uppercase tracking-wide mb-2 block">
                Ollama Base URL
              </label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#FF6B35] font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Default: http://localhost:11434 — change only if Ollama runs on a different host or port
              </p>
            </div>

            {ollamaTestResult && (
              <div
                className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
                  ollamaTestResult.valid
                    ? 'bg-green-950/20 border border-green-500/20 text-green-400'
                    : 'bg-red-950/20 border border-red-500/20 text-red-400'
                }`}
              >
                {ollamaTestResult.valid ? (
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span>{ollamaTestResult.message}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={testOllama}
                disabled={!ollamaUrl || ollamaTesting}
                variant="outline"
                className="border-border text-foreground/80"
              >
                {ollamaTesting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4 mr-2" />
                )}
                Test Connection
              </Button>

              <Button
                onClick={saveOllama}
                disabled={!ollamaUrl || ollamaSaving || (ollamaTestResult !== null && !ollamaTestResult.valid)}
                className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white"
              >
                {ollamaSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-950/20 border border-blue-500/20 rounded-lg p-6">
        <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wide mb-2">
          💡 Cost Optimization Tips
        </h3>
        <ul className="text-sm text-foreground/80 space-y-2">
          <li>• Use <strong>GPT-4o-mini</strong> for simple tasks - 97% cheaper than Claude Sonnet</li>
          <li>• Use <strong>o3</strong> for complex reasoning tasks - Best performance per dollar</li>
          <li>• Use <strong>Kimi K2.5</strong> via OpenRouter for 262K context at very low cost</li>
          <li>• Mix models per agent: cheap models for high-volume, premium for complex</li>
          <li>• All API keys are encrypted and stored securely</li>
        </ul>
      </div>
    </div>
  );
}
