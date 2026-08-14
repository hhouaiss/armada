'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Check, ExternalLink, Key, Loader2, Search, X, Plug,
  Globe, ShoppingBag, Server, AlertCircle, Unplug, Plus,
} from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { cn } from '@/lib/utils';
import {
  CATALOG, CATALOG_CATEGORIES, buildMcpCredentials, type CatalogApp,
} from '@/lib/mcp-catalog';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const inputClass = 'w-full rounded-xl border border-[var(--armada-accent)]/60 px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 transition-colors';
const inputStyle = { backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' } as const;

// ── Connect modal (MCP + native) ──────────────────────────────────────────────

function ConnectModal({
  app, onClose, onSave,
}: {
  app: CatalogApp;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const fields = app.kind === 'mcp'
    ? app.mcp!.secrets.map(s => ({ key: s.key, label: s.label, placeholder: s.placeholder }))
    : (app.nativeFields || []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allFilled = fields.every(f => (values[f.key] || '').trim());

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Échec de la connexion');
    } finally {
      setSaving(false);
    }
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
            <p className="text-xs text-[var(--armada-text)]/50 mt-0.5">
              {app.kind === 'mcp' ? 'Connexion via MCP — vos agents auront accès à ses outils.' : 'Entrez vos identifiants.'}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--armada-text)]/40 hover:text-[var(--armada-text)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {fields.map(field => (
          <div key={field.key} className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--armada-text)]/50">
              {field.label} <span className="text-[var(--armada-primary)]">*</span>
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--armada-text)]/30" />
              <input
                type="password"
                value={values[field.key] || ''}
                onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className={cn(inputClass, 'pl-9')}
                style={inputStyle}
                autoComplete="off" data-lpignore="true" data-1p-ignore
              />
            </div>
          </div>
        ))}

        <p className="text-[10px] text-[var(--armada-text)]/30 font-mono">
          Chiffré (AES-256) et stocké de façon sécurisée. Les outils apparaissent au prochain démarrage du gateway.
        </p>
        {app.docsUrl && (
          <a href={app.docsUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] font-mono text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]">
            <ExternalLink className="h-3 w-3" />Documentation {app.name}
          </a>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-500 font-mono">
            <AlertCircle className="h-3.5 w-3.5" />{error}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-full border border-[var(--armada-accent)] text-sm text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] transition-colors">
            Annuler
          </button>
          <button onClick={handleSave} disabled={!allFilled || saving}
            className="flex-1 py-2.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--armada-primary)' }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Connecter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom MCP server form ────────────────────────────────────────────────────

function CustomMcpForm({ onDone }: { onDone: () => Promise<any> }) {
  const [form, setForm] = useState({ slug: '', url: '', authHeader: '', category: '', allowedTools: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!slug || !form.url.trim()) { setError('Nom et URL sont requis.'); return; }
    setSaving(true);
    setError(null);
    try {
      const credentials: Record<string, any> = { url: form.url.trim() };
      if (form.authHeader.trim()) credentials.headers = { Authorization: form.authHeader.trim() };
      if (form.category.trim()) credentials.category = form.category.trim();
      if (form.allowedTools.trim()) {
        credentials.allowedTools = form.allowedTools.split(',').map(t => t.trim()).filter(Boolean);
      }
      const res = await fetch('/api/integrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: `mcp:${slug}`, credentials }),
      });
      if (!res.ok) throw new Error('Échec de l\'enregistrement');
      await onDone();
      setForm({ slug: '', url: '', authHeader: '', category: '', allowedTools: '' });
    } catch (e: any) {
      setError(e?.message || 'Échec de l\'enregistrement');
    } finally { setSaving(false); }
  };

  const fields = [
    { key: 'slug', label: 'Nom (slug)', placeholder: 'mon-serveur', type: 'text' },
    { key: 'url', label: 'URL du serveur MCP (Streamable HTTP)', placeholder: 'https://mcp.exemple.com/mcp', type: 'text' },
    { key: 'authHeader', label: 'En-tête Authorization (optionnel)', placeholder: 'Bearer sk_…', type: 'password' },
    { key: 'category', label: 'Catégorie d\'outils (optionnel)', placeholder: 'marketing — défaut : mcp', type: 'text' },
    { key: 'allowedTools', label: 'Outils autorisés (optionnel, virgules, * accepté)', placeholder: 'get_*, send_campaign', type: 'text' },
  ] as const;

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <div key={field.key}>
          <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-1.5 block">
            {field.label}
          </label>
          <input type={field.type} placeholder={field.placeholder}
            value={form[field.key]}
            onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
            className={inputClass} style={inputStyle}
            autoComplete="off" data-lpignore="true" data-1p-ignore
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleAdd} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-all hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--armada-primary)' }}>
          {saving ? 'Connexion…' : 'Connecter le serveur'}
        </button>
        {error && (
          <span className="text-xs text-red-500 font-mono flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />{error}
          </span>
        )}
      </div>
    </div>
  );
}

// ── App card ──────────────────────────────────────────────────────────────────

function AppCard({
  app, isConnected, onConnect, onDisconnect,
}: {
  app: CatalogApp;
  isConnected: boolean;
  onConnect: (app: CatalogApp) => void;
  onDisconnect: (app: CatalogApp) => void;
}) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border transition-all duration-200 overflow-hidden',
        isConnected
          ? 'border-[var(--armada-primary)]/30'
          : 'border-[var(--armada-accent)]/50 hover:border-[var(--armada-primary)]/20'
      )}
      style={{ backgroundColor: 'var(--armada-surface)' }}
    >
      {isConnected && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--armada-primary)' }} />
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-[var(--armada-accent)]/50 flex items-center justify-center text-base font-bold shrink-0"
              style={{ backgroundColor: 'var(--armada-bg)' }}>
              {app.logo}
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--armada-text)]">{app.name}</div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--armada-text)]/30">
                {app.kind === 'mcp' ? 'via MCP' : app.kind === 'shopify' ? 'API Shopify' : CATALOG_CATEGORIES.find(c => c.id === app.category)?.label}
              </div>
            </div>
          </div>
          {isConnected && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono border border-green-500/20 text-green-400 shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, #22c55e 8%, transparent)' }}>
              <Check className="h-2.5 w-2.5" />Connecté
            </span>
          )}
        </div>

        <p className="text-xs text-[var(--armada-text)]/55 leading-relaxed">{app.description}</p>

        {app.kind === 'shopify' ? (
          <Link href="/stores"
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-full border border-[var(--armada-accent)]/50 text-xs font-medium text-[var(--armada-text)]/70 hover:text-[var(--armada-text)] transition-colors">
            <ShoppingBag className="h-3 w-3" />
            {isConnected ? 'Gérer depuis Boutiques' : 'Connecter depuis Boutiques'}
          </Link>
        ) : isConnected ? (
          <div className="flex gap-2">
            <span className="flex-1 py-2 text-center text-xs font-mono text-[var(--armada-text)]/30">Actif</span>
            <button onClick={() => onDisconnect(app)}
              className="px-3 py-2 rounded-full border border-[var(--armada-accent)]/50 text-xs text-[var(--armada-text)]/40 hover:text-red-400 hover:border-red-400/30 transition-colors">
              Déconnecter
            </button>
          </div>
        ) : (
          <button onClick={() => onConnect(app)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-medium text-white hover:opacity-90 transition-all"
            style={{ backgroundColor: 'var(--armada-primary)' }}>
            <Plug className="h-3 w-3" />Connecter
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { activeStore, activeStoreId } = useActiveStore();
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [modalApp, setModalApp] = useState<CatalogApp | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const { data, mutate } = useSWR(
    activeStoreId ? `/api/integrations?storeId=${activeStoreId}` : '/api/integrations',
    fetcher
  );

  const integrations: any[] = (data?.integrations || []).filter((i: any) => i.isActive);
  const connectedPlatforms = new Set(integrations.map((i: any) => i.platform));

  const catalogSlugs = new Set(CATALOG.map(a => `mcp:${a.slug}`));
  const customServers = integrations.filter(
    (i: any) => i.platform?.startsWith('mcp:') && !catalogSlugs.has(i.platform)
  );

  const isAppConnected = (app: CatalogApp) =>
    app.kind === 'shopify' ? Boolean(activeStore)
      : app.kind === 'mcp' ? connectedPlatforms.has(`mcp:${app.slug}`)
      : connectedPlatforms.has(app.nativePlatform || app.slug);

  const filtered = CATALOG.filter(app => {
    const matchCat = activeCategory === 'all' || app.category === activeCategory;
    const matchSearch = !search
      || app.name.toLowerCase().includes(search.toLowerCase())
      || app.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const connectedCount = CATALOG.filter(isAppConnected).length + customServers.length;

  const handleSave = async (app: CatalogApp, values: Record<string, string>) => {
    const platform = app.kind === 'mcp' ? `mcp:${app.slug}` : (app.nativePlatform || app.slug);
    const credentials = app.kind === 'mcp' ? buildMcpCredentials(app, values) : values;
    const res = await fetch('/api/integrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, credentials, storeId: activeStoreId }),
    });
    if (!res.ok) throw new Error('Échec de la connexion');
    await mutate();
  };

  const disconnectPlatform = async (platform: string) => {
    await fetch(`/api/integrations?platform=${encodeURIComponent(platform)}`, { method: 'DELETE' });
    mutate();
  };

  const handleDisconnect = (app: CatalogApp) => {
    const platform = app.kind === 'mcp' ? `mcp:${app.slug}` : (app.nativePlatform || app.slug);
    disconnectPlatform(platform);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>
      {/* ── Header ── */}
      <div className="border-b border-[var(--armada-accent)]/50 px-4 md:px-6 py-4 md:py-5"
        style={{ backgroundColor: 'var(--armada-surface)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-serif tracking-tight text-xl md:text-2xl text-[var(--armada-text)]">Apps</h1>
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
              Vos agents accèdent aux apps via MCP — {connectedCount} connectée{connectedCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--armada-text)]/30" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une app…"
              className={cn(inputClass, 'pl-9')} style={inputStyle} />
          </div>
        </div>

        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
          {CATALOG_CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono whitespace-nowrap transition-colors',
                activeCategory === cat.id
                  ? 'text-[var(--armada-text)]'
                  : 'text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
              )}
              style={activeCategory === cat.id ? { backgroundColor: 'var(--armada-text)', color: 'var(--armada-bg)' } : {}}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-8">
        {/* ── Catalog grid ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-[var(--armada-text)]/40">Aucune app trouvée</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(app => (
              <AppCard key={app.slug} app={app}
                isConnected={isAppConnected(app)}
                onConnect={setModalApp}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}

        {/* ── Custom MCP servers ── */}
        <section className="space-y-3 max-w-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-[var(--armada-text)]/40" />
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/50">
                Serveurs MCP personnalisés
              </h2>
            </div>
            <button onClick={() => setShowCustomForm(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-[10px] font-mono text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] transition-colors uppercase tracking-widest">
              {showCustomForm ? <><X className="h-3 w-3" />Annuler</> : <><Plus className="h-3 w-3" />Ajouter</>}
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--armada-accent)]/50 overflow-hidden"
            style={{ backgroundColor: 'var(--armada-surface)' }}>
            {customServers.length === 0 && !showCustomForm && (
              <p className="px-5 py-4 text-xs text-[var(--armada-text)]/40">
                Connectez n&apos;importe quel serveur MCP (URL Streamable HTTP) — ses outils seront exposés à vos agents.
              </p>
            )}
            {customServers.map((server: any) => (
              <div key={server.platform}
                className="px-5 py-3 flex items-center justify-between border-b border-[var(--armada-accent)]/30 last:border-b-0">
                <div className="flex items-center gap-3">
                  <Globe className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs font-mono text-[var(--armada-text)]/80">{server.platform.slice(4)}</span>
                </div>
                <button onClick={() => disconnectPlatform(server.platform)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-500/20 text-red-500 text-[10px] font-mono hover:bg-red-500/10 transition-colors">
                  <Unplug className="h-3 w-3" />Retirer
                </button>
              </div>
            ))}
            {showCustomForm && (
              <div className={cn('p-5', customServers.length > 0 && 'border-t border-[var(--armada-accent)]/50')}>
                <CustomMcpForm onDone={async () => { await mutate(); setShowCustomForm(false); }} />
              </div>
            )}
          </div>

          <p className="text-[10px] font-mono text-[var(--armada-text)]/40 leading-relaxed">
            Par défaut, seuls les outils annotés lecture seule s&apos;exécutent sans approbation — le reste passe
            par le flux d&apos;approbation (Mission Control / Telegram). Redémarrez le gateway après un ajout.
          </p>
        </section>
      </div>

      {modalApp && (
        <ConnectModal app={modalApp} onClose={() => setModalApp(null)}
          onSave={values => handleSave(modalApp, values)} />
      )}
    </div>
  );
}
