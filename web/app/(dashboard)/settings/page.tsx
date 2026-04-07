'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import {
  Key, Trash2, TestTube, Check, X, Loader2, Eye, EyeOff, AlertCircle,
  CheckCircle2, Circle, ExternalLink, ChevronDown, Globe, Search, Unplug, Server,
} from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

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

// ─── Integrations Tab ──────────────────────────────────────────────────────────

const integrationConfigs = [
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    description: 'Email & SMS marketing — campaigns, flows, lists, and subscriber analytics', // i18n
    platform: 'klaviyo',
    fields: [{ label: 'Private API Key', key: 'apiKey', type: 'password' as const, placeholder: 'pk_...' }],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Recevez des notifications et contrôlez vos agents via Telegram', // i18n: Receive agent notifications and control agents via Telegram
    platform: 'telegram',
    fields: [{ label: 'Token du bot', key: 'botToken', type: 'password' as const, placeholder: '1234567890:ABC...' }],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Modèle IA pour l\'intelligence des agents', // i18n: AI model for agent intelligence
    platform: 'anthropic',
    fields: [{ label: 'Clé API', key: 'apiKey', type: 'password' as const, placeholder: 'sk-ant-...' }],
  },
];

interface GSCProperty { siteUrl: string; permissionLevel: string; }

function GoogleSearchConsoleCard({ isConnected, onDisconnect }: { isConnected: boolean; onDisconnect: () => void }) {
  const [properties, setProperties] = useState<GSCProperty[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertySaved, setPropertySaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && expanded) loadProperties();
  }, [isConnected, expanded]);

  const loadProperties = async () => {
    setLoadingProperties(true);
    setPropertyError(null);
    try {
      const res = await fetch('/api/integrations/gsc/properties');
      const data = await res.json();
      if (res.ok) { setProperties(data.sites || []); setSelectedProperty(data.selectedProperty || null); }
      else setPropertyError(data.error || 'Impossible de charger les propriétés');
    } catch { setPropertyError('Impossible de charger les propriétés'); }
    finally { setLoadingProperties(false); }
  };

  const saveProperty = async (siteUrl: string) => {
    setSavingProperty(true);
    try {
      const res = await fetch('/api/integrations/gsc/properties', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl }),
      });
      if (res.ok) { setSelectedProperty(siteUrl); setPropertySaved(true); setTimeout(() => setPropertySaved(false), 3000); }
    } catch { /* noop */ }
    finally { setSavingProperty(false); }
  };

  const status = isConnected && selectedProperty ? 'connected' : isConnected ? 'pending' : 'disconnected';

  return (
    <div className="rounded-2xl border border-[var(--armada-accent)]/50 armada-card overflow-hidden"
      style={{ backgroundColor: 'var(--armada-surface)' }}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 text-left hover:bg-[var(--armada-surface-hover)] transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status === 'connected' ? <CheckCircle2 className="h-4 w-4 text-green-500" />
              : status === 'pending' ? <AlertCircle className="h-4 w-4 text-yellow-500" />
              : <Circle className="h-4 w-4 text-[var(--armada-text)]/20" />}
            <div>
              <div className="flex items-center gap-2">
                <Search className="h-3 w-3 text-[#4285F4]" />
                <h3 className="text-sm font-medium text-[var(--armada-text)] font-mono">Google Search Console</h3>
              </div>
              <p className="text-[10px] font-mono text-[var(--armada-text)]/40 mt-0.5">
                {status === 'connected' ? `Connecté — ${selectedProperty}`
                  : status === 'pending' ? 'Connecté — sélectionnez une propriété pour Olivia'
                  : 'Connectez pour donner accès aux données SEO à Olivia'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-mono ${
              status === 'connected' ? 'bg-green-500/10 text-green-600 border-green-500/20'
                : status === 'pending' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                : 'border-[var(--armada-accent)] text-[var(--armada-text)]/40'
            }`}>
              {status === 'connected' ? 'Connecté' : status === 'pending' ? 'Config. requise' : 'Déconnecté'}
            </span>
            <ChevronDown className={`h-4 w-4 text-[var(--armada-text)]/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--armada-accent)]/50 p-5 space-y-4">
          {!isConnected ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--armada-text)]/60 font-mono leading-relaxed">
                Connectez Google Search Console pour donner à <span style={{ color: 'var(--armada-primary)' }}>Olivia</span> accès aux classements de mots-clés, impressions et données SEO.
              </p>
              <a href="/api/auth/google">
                <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-gray-100 text-gray-900 text-sm font-medium transition-colors">
                  <Globe className="h-4 w-4" />Connecter avec Google {/* i18n: Connect with Google */}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </button>
              </a>
              <p className="text-[10px] font-mono text-[var(--armada-text)]/30">
                Lecture seule · scope webmasters.readonly
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-2 block">
                  Propriété {/* i18n: Property */}
                </label>
                {loadingProperties ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--armada-text)]/40 font-mono">
                    <Loader2 className="h-4 w-4 animate-spin" />Chargement…
                  </div>
                ) : propertyError ? (
                  <div className="flex items-center gap-2 text-xs text-red-500 font-mono">
                    <AlertCircle className="h-4 w-4" />{propertyError}
                  </div>
                ) : properties.length === 0 ? (
                  <p className="text-xs text-[var(--armada-text)]/40 font-mono">Aucune propriété trouvée.</p>
                ) : (
                  <div className="space-y-2">
                    <select value={selectedProperty || ''} onChange={(e) => setSelectedProperty(e.target.value)}
                      className={`${inputClass} appearance-none`}
                      style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>
                      <option value="" disabled>Sélectionner une propriété…</option>
                      {properties.map((p) => <option key={p.siteUrl} value={p.siteUrl}>{p.siteUrl}</option>)}
                    </select>
                    <div className="flex items-center gap-2">
                      <button onClick={() => selectedProperty && saveProperty(selectedProperty)}
                        disabled={!selectedProperty || savingProperty}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-all hover:opacity-90 disabled:opacity-40 armada-btn-primary"
                        style={{ backgroundColor: 'var(--armada-primary)' }}>
                        {savingProperty ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Enregistrement…</> : 'Enregistrer'} {/* i18n: Save Property */}
                      </button>
                      {propertySaved && (
                        <span className="flex items-center gap-1 text-green-600 text-xs font-mono">
                          <CheckCircle2 className="h-3.5 w-3.5" />Enregistré {/* i18n: Saved */}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-[var(--armada-accent)]/50">
                <button onClick={onDisconnect}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-red-500/20 text-red-500 text-xs font-medium hover:bg-red-500/10 transition-colors">
                  <Unplug className="h-3.5 w-3.5" />Déconnecter {/* i18n: Disconnect */}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IntegrationsTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, 'success' | 'error' | null>>({});
  const { activeStore } = useActiveStore();

  const { data, mutate } = useSWR('/api/integrations', (url) => fetch(url).then(r => r.json()));
  const integrations = data?.integrations || [];

  const getStatus = (platform: string): 'connected' | 'disconnected' => {
    const integration = integrations.find((i: any) => i.platform === platform);
    return integration?.isActive ? 'connected' : 'disconnected';
  };

  const isGSCConnected = getStatus('google-search-console') === 'connected';

  const handleSave = async (config: typeof integrationConfigs[number]) => {
    setSaving(config.id);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: config.platform, credentials: formData[config.id] || {} }),
      });
      if (!res.ok) throw new Error('Failed to save');
      await mutate();
      setFormData(prev => ({ ...prev, [config.id]: {} }));
      setSaveStatus(prev => ({ ...prev, [config.id]: 'success' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [config.id]: null })), 3000);
    } catch {
      setSaveStatus(prev => ({ ...prev, [config.id]: 'error' }));
    } finally { setSaving(null); }
  };

  const handleDisconnect = async (platform: string) => {
    try { await fetch(`/api/integrations?platform=${platform}`, { method: 'DELETE' }); await mutate(); }
    catch { /* noop */ }
  };

  return (
    <div className="space-y-3">
      {/* Shopify status */}
      {activeStore ? (
        <div className="rounded-2xl border border-[var(--armada-accent)]/50 armada-card px-5 py-4 flex items-center justify-between"
          style={{ backgroundColor: 'var(--armada-surface)' }}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <div>
              <h3 className="text-sm font-medium font-mono text-[var(--armada-text)]">Shopify</h3>
              <p className="text-[10px] font-mono text-[var(--armada-text)]/40">Connecté : {activeStore.storeName}</p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-green-500/10 text-green-600 border border-green-500/20">
            Connecté {/* i18n: Connected */}
          </span>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--armada-primary)]/20 px-5 py-4 flex items-center gap-3"
          style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, transparent)' }}>
          <AlertCircle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--armada-primary)' }} />
          <p className="text-xs text-[var(--armada-text)]/60 font-mono">
            Connectez d'abord un magasin — visitez{' '}
            <span style={{ color: 'var(--armada-primary)' }}>Mes Magasins</span> {/* i18n: Connect a Shopify store first — visit My Store */}
          </p>
        </div>
      )}

      {/* Google Search Console */}
      <GoogleSearchConsoleCard isConnected={isGSCConnected} onDisconnect={() => handleDisconnect('google-search-console')} />

      {/* Other integrations */}
      {integrationConfigs.map((config) => {
        const status = getStatus(config.platform);
        const isExpanded = expandedId === config.id;
        const isSaving = saving === config.id;

        return (
          <div key={config.id} className="rounded-2xl border border-[var(--armada-accent)]/50 armada-card overflow-hidden"
            style={{ backgroundColor: 'var(--armada-surface)' }}>
            <button onClick={() => setExpandedId(isExpanded ? null : config.id)}
              className="w-full px-5 py-4 text-left hover:bg-[var(--armada-surface-hover)] transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {status === 'connected'
                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                    : <Circle className="h-4 w-4 text-[var(--armada-text)]/20" />}
                  <div>
                    <h3 className="text-sm font-medium font-mono text-[var(--armada-text)]">{config.name}</h3>
                    <p className="text-[10px] font-mono text-[var(--armada-text)]/40">{config.description}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-mono ${
                  status === 'connected'
                    ? 'bg-green-500/10 text-green-600 border-green-500/20'
                    : 'border-[var(--armada-accent)] text-[var(--armada-text)]/40'
                }`}>
                  {status === 'connected' ? 'Connecté' : 'Déconnecté'}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-[var(--armada-accent)]/50 p-5 space-y-3">
                {config.fields.map(field => (
                  <div key={field.key}>
                    <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-1.5 block">
                      {field.label}
                    </label>
                    <input type={field.type} placeholder={field.placeholder}
                      value={formData[config.id]?.[field.key] || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, [config.id]: { ...prev[config.id], [field.key]: e.target.value } }))}
                      className={inputClass}
                      style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => handleSave(config)} disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-all hover:opacity-90 disabled:opacity-40 armada-btn-primary"
                    style={{ backgroundColor: 'var(--armada-primary)' }}>
                    {isSaving ? 'Enregistrement…' : status === 'connected' ? 'Mettre à jour' : 'Connecter'} {/* i18n: Saving... / Update / Connect */}
                  </button>
                  {status === 'connected' && (
                    <button onClick={() => handleDisconnect(config.platform)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-red-500/20 text-red-500 text-xs font-medium hover:bg-red-500/10 transition-colors">
                      Déconnecter {/* i18n: Disconnect */}
                    </button>
                  )}
                  {saveStatus[config.id] === 'success' && (
                    <span className="text-xs text-green-600 font-mono flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />Enregistré {/* i18n: Saved */}
                    </span>
                  )}
                  {saveStatus[config.id] === 'error' && (
                    <span className="text-xs text-red-500 font-mono flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />Échec {/* i18n: Failed */}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Security notice */}
      <div className="rounded-2xl border border-[var(--armada-primary)]/20 px-5 py-4 flex items-start gap-3"
        style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, transparent)' }}>
        <Key className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--armada-primary)' }} />
        <p className="text-[10px] font-mono text-[var(--armada-text)]/50 leading-relaxed">
          Tous les identifiants et tokens OAuth sont chiffrés au repos avec AES-256. L'accès Google est en lecture seule. Les tokens sont rafraîchis automatiquement. {/* i18n: All credentials... */}
        </p>
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
  { id: 'api-keys',     label: 'Clés API' },       // i18n: API Keys
  { id: 'integrations', label: 'Intégrations' },   // i18n: Integrations
  { id: 'platform',     label: 'Plateforme' },      // i18n: Platform
] as const;

type TabId = typeof TABS[number]['id'];

function SettingsContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get('tab') === 'integrations' ? 'integrations' : 'api-keys') as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

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
          Paramètres de la plateforme et intégrations {/* i18n: Platform configuration and integrations */}
        </p>
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
        {activeTab === 'api-keys'     && <ApiKeysTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'platform'     && <PlatformTab />}
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
