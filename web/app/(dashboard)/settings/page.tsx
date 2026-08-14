'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Key, Trash2, TestTube, Check, X, Loader2, Eye, EyeOff, AlertCircle, Server, Plug,
} from 'lucide-react';

// ─── API Keys Tab ──────────────────────────────────────────────────────────────

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    description: 'Modèles Claude Opus, Sonnet, Haiku',
    pricing: '$0.80–$75 / 1M tokens',
    models: ['Claude Opus 4.6', 'Claude Sonnet 4.5', 'Claude Haiku 4.5'],
    keyPlaceholder: 'sk-ant-...',
  },
  openai: {
    name: 'OpenAI (GPT)',
    description: 'Modèles GPT-4o, GPT-4o-mini, o3',
    pricing: '$0.15–$10 / 1M tokens',
    models: ['GPT-4o-mini', 'GPT-4o', 'o3'],
    keyPlaceholder: 'sk-proj-...',
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'Kimi K2.5, Llama, Mistral et 100+ modèles open source',
    pricing: 'Variable — de gratuit à $3/1M tokens',
    models: ['Kimi K2.5 (262K context)', '100+ modèles open source'],
    keyPlaceholder: 'sk-or-...',
  },
};

interface ApiKey {
  provider: string;
  isActive: boolean;
  maskedKey: string;
  createdAt: string;
}

const inputClass = `w-full rounded-xl border border-[var(--armada-accent)]/60 px-4 py-2.5 text-sm font-mono placeholder:text-[var(--armada-text)]/30 focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-2 focus:ring-[var(--armada-primary)]/10 transition-colors`;

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Ollama local model state
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaConfigured, setOllamaConfigured] = useState(false);
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [ollamaSaving, setOllamaSaving] = useState(false);

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/llm-keys');
      const data = await res.json();
      const allKeys: ApiKey[] = data.keys || [];
      setKeys(allKeys);
      const ollamaKey = allKeys.find((k) => k.provider === 'ollama');
      if (ollamaKey) {
        setOllamaConfigured(true);
      }
    } catch { /* noop */ } finally { setLoading(false); }
  };

  const testOllama = async () => {
    setOllamaTesting(true);
    setOllamaTestResult(null);
    try {
      const res = await fetch('/api/llm-keys/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'ollama', apiKey: ollamaUrl }),
      });
      setOllamaTestResult(await res.json());
    } catch { setOllamaTestResult({ valid: false, message: 'Impossible de joindre Ollama' }); }
    finally { setOllamaTesting(false); }
  };

  const saveOllama = async () => {
    setOllamaSaving(true);
    try {
      const res = await fetch('/api/llm-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'ollama', apiKey: ollamaUrl }),
      });
      if (res.ok) { setOllamaConfigured(true); setOllamaTestResult(null); await loadKeys(); }
      else { const d = await res.json(); setOllamaTestResult({ valid: false, message: d.error || 'Échec de la sauvegarde' }); }
    } catch { setOllamaTestResult({ valid: false, message: 'Échec de la sauvegarde' }); }
    finally { setOllamaSaving(false); }
  };

  const removeOllama = async () => {
    if (!confirm('Supprimer la configuration Ollama ?')) return;
    await fetch('/api/llm-keys?provider=ollama', { method: 'DELETE' });
    setOllamaConfigured(false);
    setOllamaUrl('http://localhost:11434');
    setOllamaTestResult(null);
    await loadKeys();
  };

  const testKey = async (provider: string, apiKey: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/llm-keys/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      setTestResult(await res.json());
    } catch { setTestResult({ valid: false, message: 'Impossible de tester la clé API' }); }
    finally { setTesting(false); }
  };

  const saveKey = async (provider: string, apiKey: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/llm-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      if (res.ok) { setAddingProvider(null); setNewKey(''); setTestResult(null); await loadKeys(); }
      else { const d = await res.json(); setTestResult({ valid: false, message: d.error || 'Échec de l\'enregistrement' }); }
    } catch { setTestResult({ valid: false, message: 'Échec de l\'enregistrement de la clé API' }); }
    finally { setSaving(false); }
  };

  const deleteKey = async (provider: string) => {
    const p = PROVIDERS[provider as keyof typeof PROVIDERS];
    if (!confirm(`Supprimer la clé ${p?.name} ?`)) return; // i18n: Remove ... API key?
    try { await fetch(`/api/llm-keys?provider=${provider}`, { method: 'DELETE' }); await loadKeys(); }
    catch { /* noop */ }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--armada-primary)' }} />
    </div>
  );

  return (
    <div className="space-y-3">
      {Object.entries(PROVIDERS).map(([providerId, provider]) => {
        const existingKey = keys.find(k => k.provider === providerId);
        const isAdding = addingProvider === providerId;

        return (
          <div
            key={providerId}
            className="rounded-2xl border border-[var(--armada-accent)]/50 p-5 armada-card"
            style={{ backgroundColor: 'var(--armada-surface)' }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium text-[var(--armada-text)] font-mono">{provider.name}</h3>
                  {existingKey && (
                    <span className="flex items-center gap-1 text-[10px] text-green-600 font-mono">
                      <Check className="w-3 h-3" />Configuré {/* i18n: Configured */}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--armada-text)]/50">{provider.description}</p>
                <p className="text-[10px] font-mono text-[var(--armada-text)]/30 mt-0.5">Tarifs : {provider.pricing}</p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {existingKey ? (
                  <>
                    <span className="text-[10px] font-mono text-[var(--armada-text)]/40">{existingKey.maskedKey}</span>
                    <button onClick={() => deleteKey(providerId)}
                      className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-[var(--armada-text)]/40 hover:text-red-500" />
                    </button>
                  </>
                ) : (
                  <button onClick={() => setAddingProvider(providerId)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white text-xs font-medium transition-all hover:opacity-90 armada-btn-primary"
                    style={{ backgroundColor: 'var(--armada-primary)' }}>
                    <Key className="w-3 h-3" />Ajouter {/* i18n: Add Key */}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {provider.models.map((model, i) => (
                <span key={i} className="text-[9px] px-2 py-0.5 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/40 font-mono"
                  style={{ backgroundColor: 'var(--armada-bg)' }}>
                  {model}
                </span>
              ))}
            </div>

            {isAdding && (
              <div className="border-t border-[var(--armada-accent)]/50 pt-4 space-y-3">
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder={provider.keyPlaceholder}
                    className={inputClass}
                    style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
                  />
                  <button onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--armada-text)]/30 hover:text-[var(--armada-text)] transition-colors">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {testResult && (
                  <div className={`flex items-start gap-2 text-xs p-3 rounded-xl ${
                    testResult.valid
                      ? 'bg-green-500/10 border border-green-500/20 text-green-600'
                      : 'bg-red-500/10 border border-red-500/20 text-red-500'}`}>
                    {testResult.valid ? <Check className="w-3.5 h-3.5 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5" />}
                    <span className="font-mono">{testResult.message}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => testKey(providerId, newKey)} disabled={!newKey || testing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/60 text-xs font-medium hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all disabled:opacity-40">
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                    Tester {/* i18n: Test */}
                  </button>
                  <button onClick={() => saveKey(providerId, newKey)}
                    disabled={!newKey || saving || (testResult !== null && !testResult.valid)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-all hover:opacity-90 disabled:opacity-40 armada-btn-primary"
                    style={{ backgroundColor: 'var(--armada-primary)' }}>
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Enregistrer {/* i18n: Save */}
                  </button>
                  <button onClick={() => { setAddingProvider(null); setNewKey(''); setTestResult(null); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[var(--armada-text)]/40 text-xs font-medium hover:text-[var(--armada-text)] transition-colors">
                    <X className="w-3 h-3" />Annuler {/* i18n: Cancel */}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Ollama / Local Models ── */}
      <div
        className="rounded-2xl border border-[var(--armada-accent)]/50 p-5 armada-card"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-3.5 h-3.5" style={{ color: 'var(--armada-primary)' }} />
              <h3 className="text-sm font-medium text-[var(--armada-text)] font-mono">Modèles locaux (Ollama)</h3>
              {ollamaConfigured && (
                <span className="flex items-center gap-1 text-[10px] text-green-600 font-mono">
                  <Check className="w-3 h-3" />Configuré
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--armada-text)]/50">
              Exécutez des modèles open source localement — zéro coût API, données privées
            </p>
            <p className="text-[10px] font-mono text-green-600/60 mt-0.5">Gratuit — aucun coût par token</p>
          </div>
          {ollamaConfigured && (
            <button onClick={removeOllama}
              className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors ml-4">
              <Trash2 className="w-3.5 h-3.5 text-[var(--armada-text)]/40 hover:text-red-500" />
            </button>
          )}
        </div>

        {/* Available models */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {['Gemma 4 E4B', 'gemma4:e4b'].map((m, i) => (
            <span key={i} className="text-[9px] px-2 py-0.5 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/40 font-mono"
              style={{ backgroundColor: 'var(--armada-bg)' }}>
              {m}
            </span>
          ))}
          <span className="text-[9px] px-2 py-0.5 rounded-full border border-dashed border-[var(--armada-accent)] text-[var(--armada-text)]/30 font-mono italic"
            style={{ backgroundColor: 'var(--armada-bg)' }}>
            + tout modèle installé via ollama pull
          </span>
        </div>

        {/* URL input — always visible */}
        <div className="border-t border-[var(--armada-accent)]/50 pt-4 space-y-3">
          <div>
            <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-1.5 block">
              URL Ollama
            </label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => { setOllamaUrl(e.target.value); setOllamaTestResult(null); }}
              placeholder="http://localhost:11434"
              className={inputClass}
              style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
            />
          </div>

          {ollamaTestResult && (
            <div className={`flex items-start gap-2 text-xs p-3 rounded-xl ${
              ollamaTestResult.valid
                ? 'bg-green-500/10 border border-green-500/20 text-green-600'
                : 'bg-red-500/10 border border-red-500/20 text-red-500'}`}>
              {ollamaTestResult.valid ? <Check className="w-3.5 h-3.5 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5" />}
              <span className="font-mono">{ollamaTestResult.message}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={testOllama} disabled={!ollamaUrl || ollamaTesting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/60 text-xs font-medium hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all disabled:opacity-40">
              {ollamaTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
              Tester
            </button>
            <button onClick={saveOllama}
              disabled={!ollamaUrl || ollamaSaving || (ollamaTestResult !== null && !ollamaTestResult.valid)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-all hover:opacity-90 disabled:opacity-40 armada-btn-primary"
              style={{ backgroundColor: 'var(--armada-primary)' }}>
              {ollamaSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Platform Tab ──────────────────────────────────────────────────────────────

function PlatformTab() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--armada-accent)]/50 p-5 space-y-4 armada-card"
        style={{ backgroundColor: 'var(--armada-surface)' }}>
        <h3 className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest">
          Infos Plateforme {/* i18n: Platform Info */}
        </h3>
        <div className="space-y-0 text-xs font-mono">
          {[
            { label: 'Gateway WebSocket', value: 'ws://localhost:18790' },
            { label: 'Serveur HTTP', value: 'http://localhost:18791' },      // i18n: HTTP Control Server
            { label: 'Nettoyage sessions', value: 'Toutes les 5 min' },     // i18n: Session Cleanup / Every 5 minutes
            { label: 'Rétention sessions', value: '7 jours' },              // i18n: Session Retention / 7 days
          ].map((row, i, arr) => (
            <div key={row.label}
              className={`flex justify-between py-2.5 ${i < arr.length - 1 ? 'border-b border-[var(--armada-accent)]/30' : ''}`}>
              <span className="text-[var(--armada-text)]/40">{row.label}</span>
              <span className="text-[var(--armada-text)]/70">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--armada-primary)]/20 px-5 py-4"
        style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, transparent)' }}>
        <h3 className="text-[10px] font-mono uppercase tracking-widest mb-2.5" style={{ color: 'var(--armada-primary)' }}>
          Sécurité {/* i18n: Security */}
        </h3>
        <ul className="text-[10px] text-[var(--armada-text)]/50 font-mono space-y-1.5">
          <li>· Clés API chiffrées avec AES-256-CBC</li>
          <li>· Clés jamais exposées dans les logs ou réponses</li>
          <li>· Chaque agent utilise un contexte d'outils isolé</li>
          <li>· Surveiller l'usage dans le Journal de Bord</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'api-keys', label: 'Clés API' },       // i18n: API Keys
  { id: 'platform', label: 'Plateforme' },      // i18n: Platform
] as const;

type TabId = typeof TABS[number]['id'];

function SettingsContent() {
  const [activeTab, setActiveTab] = useState<TabId>('api-keys');

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>

      {/* ── Header ── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-6 py-5"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <h1 className="font-serif tracking-tight text-2xl text-[var(--armada-text)]">
          Configuration {/* i18n: Settings */}
        </h1>
        <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
          Modèles IA et paramètres de la plateforme {/* i18n: AI models and platform settings */}
        </p>
        <Link href="/integrations"
          className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-colors">
          <Plug className="h-3 w-3" />
          Apps &amp; MCP — page Apps
        </Link>
      </div>

      {/* ── Tabs ── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-6"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-5 py-3 text-sm font-mono font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-[var(--armada-text)]'
                  : 'text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="settings-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: 'var(--armada-primary)' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-6 max-w-3xl">
        {activeTab === 'api-keys' && <ApiKeysTab />}
        {activeTab === 'platform' && <PlatformTab />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--armada-bg)' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--armada-primary)' }} />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
