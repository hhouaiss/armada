'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Check, ExternalLink, Key, Loader2, Search, X,
  Globe, MessageSquare, ShoppingBag, BarChart2, Code2, CreditCard,
} from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ── Integration catalog ────────────────────────────────────────────────────────

interface AppDef {
  id: string;
  name: string;
  description: string;
  logo: string;          // emoji or initials
  category: string;
  authType: 'oauth' | 'apikey' | 'webhook';
  oauthPath?: string;    // e.g. /api/auth/google
  docsUrl?: string;
  badge?: string;        // 'Connecté', 'Bientôt', etc.
}

const CATEGORIES = [
  { id: 'all',          label: 'Tout',          icon: Globe },
  { id: 'productivity', label: 'Productivité',  icon: Globe },
  { id: 'communication',label: 'Communication', icon: MessageSquare },
  { id: 'ecommerce',    label: 'E-commerce',    icon: ShoppingBag },
  { id: 'analytics',    label: 'Analytics',     icon: BarChart2 },
  { id: 'dev',          label: 'Dev / Tech',    icon: Code2 },
  { id: 'finance',      label: 'Finance',       icon: CreditCard },
];

const APPS: AppDef[] = [
  // Productivité
  {
    id: 'notion',
    name: 'Notion',
    description: 'Créez et consultez des pages, gérez vos bases de données.',
    logo: 'N',
    category: 'productivity',
    authType: 'apikey',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Lisez et créez des fichiers, partagez des documents.',
    logo: '📁',
    category: 'productivity',
    authType: 'oauth',
    oauthPath: '/api/auth/google',
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Gérez vos tableaux, listes et cartes Trello.',
    logo: 'T',
    category: 'productivity',
    authType: 'apikey',
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Lisez et écrivez dans vos bases Airtable.',
    logo: 'A',
    category: 'productivity',
    authType: 'apikey',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Créez des tâches, suivez les projets et deadlines.',
    logo: '⬡',
    category: 'productivity',
    authType: 'apikey',
    badge: 'Bientôt',
  },
  // Communication
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Recevez des alertes et interagissez avec vos agents via Telegram.',
    logo: '✈️',
    category: 'communication',
    authType: 'apikey',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Envoyez des messages dans vos canaux Slack.',
    logo: '#',
    category: 'communication',
    authType: 'apikey',
    badge: 'Bientôt',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Lisez, rédigez et envoyez des emails via Gmail.',
    logo: 'M',
    category: 'communication',
    authType: 'oauth',
    oauthPath: '/api/auth/google',
    badge: 'Bientôt',
  },
  // E-commerce
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Connectez votre boutique pour que vos agents gèrent produits, stocks et commandes.',
    logo: '🛍️',
    category: 'ecommerce',
    authType: 'oauth',
    oauthPath: '/api/shopify/install',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Consultez vos paiements, abonnements et revenus.',
    logo: 'S',
    category: 'finance',
    authType: 'apikey',
    badge: 'Bientôt',
  },
  // Analytics / SEO
  {
    id: 'gsc',
    name: 'Google Search Console',
    description: 'Analysez vos performances SEO, mots-clés et positions.',
    logo: '🔍',
    category: 'analytics',
    authType: 'oauth',
    oauthPath: '/api/auth/google',
  },
  {
    id: 'ga4',
    name: 'Google Analytics',
    description: 'Suivez le trafic, les conversions et les événements.',
    logo: '📊',
    category: 'analytics',
    authType: 'oauth',
    oauthPath: '/api/auth/google',
    badge: 'Bientôt',
  },
  // Dev / Tech
  {
    id: 'github',
    name: 'GitHub',
    description: 'Consultez les repos, issues et pull requests.',
    logo: 'GH',
    category: 'dev',
    authType: 'apikey',
    badge: 'Bientôt',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Créez et suivez des tickets, sprints et projets.',
    logo: 'L',
    category: 'dev',
    authType: 'apikey',
    badge: 'Bientôt',
  },
];

// ── API Key modal ──────────────────────────────────────────────────────────────

function ApiKeyModal({
  app,
  onClose,
  onSave,
}: {
  app: AppDef;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    await onSave(apiKey.trim());
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--armada-accent)]/60 p-6 space-y-4 shadow-2xl"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg text-[var(--armada-text)]">Connecter {app.name}</h3>
            <p className="text-xs text-[var(--armada-text)]/50 mt-0.5">Entrez votre clé API</p>
          </div>
          <button onClick={onClose} className="text-[var(--armada-text)]/40 hover:text-[var(--armada-text)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--armada-text)]/50">
            Clé API {app.name} <span className="text-[var(--armada-primary)]">*</span>
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--armada-text)]/30" />
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-[var(--armada-accent)]/60 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 transition-colors"
              style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
              autoFocus
            />
          </div>
          <p className="text-[10px] text-[var(--armada-text)]/30 font-mono">
            Votre clé est chiffrée et stockée de façon sécurisée.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full border border-[var(--armada-accent)] text-sm text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="flex-1 py-2.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--armada-primary)' }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Connecter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { activeStoreId } = useActiveStore();
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [modalApp, setModalApp] = useState<AppDef | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const { data: integrationsData, mutate } = useSWR(
    activeStoreId ? `/api/integrations?storeId=${activeStoreId}` : '/api/integrations',
    fetcher
  );

  const connected: string[] = (integrationsData?.integrations || [])
    .filter((i: any) => i.isActive)
    .map((i: any) => i.platform);

  const filtered = APPS.filter(app => {
    const matchCat = activeCategory === 'all' || app.category === activeCategory;
    const matchSearch = !search || app.name.toLowerCase().includes(search.toLowerCase()) || app.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleConnect = async (app: AppDef) => {
    if (app.badge === 'Bientôt') return;
    if (app.authType === 'apikey') {
      setModalApp(app);
    } else if (app.authType === 'oauth' && app.oauthPath) {
      setConnecting(app.id);
      window.location.href = app.oauthPath;
    }
  };

  const handleSaveApiKey = async (apiKey: string) => {
    if (!modalApp) return;
    await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: modalApp.id,
        credentials: { apiKey },
        storeId: activeStoreId,
      }),
    });
    mutate();
  };

  const handleDisconnect = async (appId: string) => {
    await fetch(`/api/integrations/${appId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId }),
    });
    mutate();
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>
      {/* ── Header ── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-4 md:px-6 py-4 md:py-5"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-serif tracking-tight text-xl md:text-2xl text-[var(--armada-text)]">Apps</h1>
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
              Connectez vos outils — {connected.length} app{connected.length !== 1 ? 's' : ''} active{connected.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--armada-text)]/30" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une app…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--armada-accent)]/60 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 transition-colors"
              style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono whitespace-nowrap transition-colors',
                activeCategory === cat.id
                  ? 'text-[var(--armada-text)]'
                  : 'text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
              )}
              style={activeCategory === cat.id ? {
                backgroundColor: 'var(--armada-text)',
                color: 'var(--armada-bg)',
              } : {}}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="p-4 md:p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-[var(--armada-text)]/40">Aucune app trouvée</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(app => {
              const isConnected = connected.includes(app.id);
              const isSoon = app.badge === 'Bientôt';
              const isConnecting = connecting === app.id;
              return (
                <div
                  key={app.id}
                  className={cn(
                    'relative rounded-2xl border transition-all duration-200 overflow-hidden',
                    isConnected
                      ? 'border-[var(--armada-primary)]/30'
                      : isSoon
                        ? 'border-[var(--armada-accent)]/30 opacity-60'
                        : 'border-[var(--armada-accent)]/50 hover:border-[var(--armada-primary)]/20'
                  )}
                  style={{ backgroundColor: 'var(--armada-surface)' }}
                >
                  {/* Connected accent */}
                  {isConnected && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--armada-primary)' }} />
                  )}

                  <div className="p-4 space-y-3">
                    {/* Logo + name */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl border border-[var(--armada-accent)]/50 flex items-center justify-center text-base font-bold shrink-0"
                          style={{ backgroundColor: 'var(--armada-bg)' }}
                        >
                          {app.logo}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[var(--armada-text)]">{app.name}</div>
                          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--armada-text)]/30">
                            {CATEGORIES.find(c => c.id === app.category)?.label || app.category}
                          </div>
                        </div>
                      </div>

                      {/* Status badges */}
                      {isConnected && (
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono border border-green-500/20 text-green-400 shrink-0"
                          style={{ backgroundColor: 'color-mix(in srgb, #22c55e 8%, transparent)' }}
                        >
                          <Check className="h-2.5 w-2.5" />
                          Connecté
                        </span>
                      )}
                      {isSoon && !isConnected && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-[var(--armada-accent)]/40 text-[var(--armada-text)]/30 shrink-0">
                          Bientôt
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-[var(--armada-text)]/55 leading-relaxed">
                      {app.description}
                    </p>

                    {/* Action */}
                    {isConnected ? (
                      <div className="flex gap-2">
                        <span className="flex-1 py-2 text-center text-xs font-mono text-[var(--armada-text)]/30">
                          Actif
                        </span>
                        <button
                          onClick={() => handleDisconnect(app.id)}
                          className="px-3 py-2 rounded-full border border-[var(--armada-accent)]/50 text-xs text-[var(--armada-text)]/40 hover:text-red-400 hover:border-red-400/30 transition-colors"
                        >
                          Déconnecter
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnect(app)}
                        disabled={isSoon || isConnecting}
                        className={cn(
                          'w-full flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-medium transition-all',
                          isSoon
                            ? 'border border-[var(--armada-accent)]/30 text-[var(--armada-text)]/30 cursor-not-allowed'
                            : 'text-white hover:opacity-90'
                        )}
                        style={!isSoon ? { backgroundColor: 'var(--armada-primary)' } : {}}
                      >
                        {isConnecting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            {app.authType === 'apikey' ? <Key className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                            {isSoon ? 'Disponible bientôt' : 'Connecter'}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* API Key Modal */}
      {modalApp && (
        <ApiKeyModal
          app={modalApp}
          onClose={() => setModalApp(null)}
          onSave={handleSaveApiKey}
        />
      )}
    </div>
  );
}
