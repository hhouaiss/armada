'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2,
  ChevronRight, CircleOff, ExternalLink, Filter, KeyRound, Loader2, Plus, RefreshCw,
  Search, Server, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Unplug, Users, X,
} from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { cn } from '@/lib/utils';
import { missingConnectionScopes, shortScopeLabel } from '@/lib/oauth-scopes';

const fetcher = (url: string) => fetch(url).then(async (response) => {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erreur réseau');
  return data;
});

type Connector = {
  id: string; slug: string; name: string; description: string; publisher: string; category: string;
  logo?: string; transport: string; authMode: string; verificationTier: string; scopes: string[];
  capabilities: string[]; secretFields: Array<{ key: string; label: string; placeholder: string }>;
  isBeta: boolean; connectionCount: number; docsUrl?: string;
};

type Agent = { id: string; name: string; type: string };
type Tool = { name: string; description: string; readOnly: boolean; destructive: boolean };
type Connection = {
  id: string; label: string; accountEmail?: string; status: string; isDefault: boolean; lastHealthAt?: string;
  lastError?: string; discoveredTools: Tool[]; disabledTools?: string[]; connector: Connector;
  grantedScopes?: string[];
  grants: Array<{ agentId: string; agent: Agent }>;
  policies: Array<{ agentId: string; toolName: string; mode: string }>;
};

const TRUST: Record<string, { label: string; className: string }> = {
  armada_verified: { label: 'Vérifié Armada', className: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  publisher_verified: { label: 'Éditeur vérifié', className: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  community: { label: 'Communauté', className: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  custom: { label: 'Personnalisé', className: 'text-violet-500 bg-violet-500/10 border-violet-500/20' },
};

const STATUS: Record<string, { label: string; dot: string }> = {
  active: { label: 'Opérationnel', dot: 'bg-emerald-500' },
  error: { label: 'Erreur', dot: 'bg-red-500' },
  reauth_required: { label: 'À reconnecter', dot: 'bg-amber-500' },
  review_required: { label: 'À vérifier', dot: 'bg-amber-500' },
  disabled: { label: 'Désactivé', dot: 'bg-zinc-400' },
};

function TrustBadge({ tier }: { tier: string }) {
  const trust = TRUST[tier] || TRUST.community;
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-mono', trust.className)}><BadgeCheck className="h-3 w-3" />{trust.label}</span>;
}

function ConnectorCard({ connector, onOpen }: { connector: Connector; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group min-h-56 rounded-2xl border border-[var(--armada-accent)]/50 bg-[var(--armada-surface)] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--armada-primary)]/40 hover:shadow-xl hover:shadow-black/5 focus:outline-none focus:ring-2 focus:ring-[var(--armada-primary)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] text-xl font-semibold">{connector.logo || connector.name[0]}</div>
        <div className="flex flex-wrap justify-end gap-1.5"><TrustBadge tier={connector.verificationTier} />{connector.isBeta && <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[10px] font-mono text-violet-500">BETA</span>}</div>
      </div>
      <h3 className="mt-5 font-serif text-xl">{connector.name}</h3>
      <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[var(--armada-text)]/35">{connector.publisher} · {connector.transport === 'stdio' ? 'Runner isolé' : 'MCP distant'}</p>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[var(--armada-text)]/55">{connector.description}</p>
      <div className="mt-5 flex items-center justify-between border-t border-[var(--armada-accent)]/40 pt-4 text-xs">
        <span className="text-[var(--armada-text)]/40">{connector.connectionCount ? `${connector.connectionCount} compte${connector.connectionCount > 1 ? 's' : ''}` : 'Non connecté'}</span>
        <span className="flex items-center gap-1 text-[var(--armada-primary)]">Configurer <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </div>
    </button>
  );
}

function ConnectWizard({ connector, agents, storeId, onClose }: { connector: Connector; agents: Agent[]; storeId: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [label, setLabel] = useState(connector.name);
  const [scopes, setScopes] = useState<string[]>(connector.scopes || []);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const oauth = connector.authMode !== 'secret';
  const recommended = (agent: Agent) => {
    const value = `${agent.type} ${agent.name}`.toLowerCase();
    if (connector.category === 'analytics') return /seo|growth|analytics|major/.test(value);
    if (connector.category === 'marketing') return /marketing|growth|content|major/.test(value);
    if (connector.category === 'support') return /support|service|client|major/.test(value);
    if (connector.category === 'finance') return /finance|compta|ops|major/.test(value);
    if (connector.category === 'creative') return /content|design|marketing|major/.test(value);
    if (connector.category === 'engineering') return /dev|tech|ops|major/.test(value);
    if (connector.slug === 'gmail' || connector.slug === 'google-calendar') return /support|marketing|major|ops/.test(value);
    return /content|marketing|major|product/.test(value);
  };

  useEffect(() => { setAgentIds(agents.filter(recommended).map((agent) => agent.id)); }, [agents]);

  async function connect() {
    setBusy(true); setError('');
    try {
      if (oauth) {
        const base = connector.authMode === 'oauth-google' ? '/api/auth/google' : '/api/mcp/oauth/start';
        const query = new URLSearchParams({ slug: connector.slug, storeId, label, scopes: scopes.join(','), agentIds: agentIds.join(',') });
        window.location.assign(`${base}?${query}`);
        return;
      }
      const response = await fetch('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectorSlug: connector.slug, storeId, label, credentials: secrets }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Connexion impossible');
      if (agentIds.length) await fetch(`/api/connections/${data.connection.id}/grants`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentIds }) });
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  }

  const steps = ['Compte', 'Accès', 'Agents', 'Vérification'];
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={`Connecter ${connector.name}`}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-[var(--armada-accent)] bg-[var(--armada-surface)] shadow-2xl md:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--armada-accent)]/50 bg-[var(--armada-surface)]/95 px-6 py-5 backdrop-blur">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--armada-bg)] text-lg">{connector.logo}</div><div><h2 className="font-serif text-xl">Connecter {connector.name}</h2><p className="text-xs text-[var(--armada-text)]/40">Étape {step + 1} sur 4</p></div></div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-[var(--armada-bg)]" aria-label="Fermer"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 pt-5"><div className="grid grid-cols-4 gap-2">{steps.map((item, index) => <div key={item}><div className={cn('h-1 rounded-full', index <= step ? 'bg-[var(--armada-primary)]' : 'bg-[var(--armada-accent)]')} /><p className={cn('mt-2 text-[10px] font-mono', index === step ? 'text-[var(--armada-text)]' : 'text-[var(--armada-text)]/30')}>{item}</p></div>)}</div></div>
        <div className="min-h-80 p-6">
          {step === 0 && <div className="space-y-5"><div><label className="mb-2 block text-xs font-medium">Nom de ce compte</label><input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} className="w-full rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--armada-primary)]" placeholder="Ex. Gmail Support" /></div>{!oauth && connector.secretFields.map((field) => <div key={field.key}><label className="mb-2 block text-xs font-medium">{field.label}</label><input type="password" value={secrets[field.key] || ''} onChange={(event) => setSecrets({ ...secrets, [field.key]: event.target.value })} className="w-full rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--armada-primary)]" placeholder={field.placeholder} /></div>)}<div className="rounded-2xl border border-blue-500/15 bg-blue-500/5 p-4 text-sm text-[var(--armada-text)]/60"><ShieldCheck className="mb-2 h-5 w-5 text-blue-500" />Les identifiants sont chiffrés. Armada ne transmet ce compte qu’aux agents que vous confirmerez.</div></div>}
          {step === 1 && <div><h3 className="font-serif text-2xl">Choisissez les accès</h3><p className="mt-2 text-sm text-[var(--armada-text)]/50">Les lectures sont automatiques. Toute modification demandera votre approbation.</p><div className="mt-5 space-y-2">{connector.scopes?.length ? connector.scopes.map((scope) => <label key={scope} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--armada-accent)]/60 p-3 hover:bg-[var(--armada-bg)]"><input type="checkbox" checked={scopes.includes(scope)} onChange={() => setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])} className="mt-1 accent-[var(--armada-primary)]" /><div><p className="text-sm">{scope.includes('readonly') ? 'Lecture' : 'Création et modification'}</p><p className="break-all text-[10px] font-mono text-[var(--armada-text)]/35">{scope}</p></div></label>) : <div className="rounded-xl border border-[var(--armada-accent)] p-4 text-sm text-[var(--armada-text)]/50">Les autorisations seront affichées par le fournisseur pendant OAuth.</div>}</div></div>}
          {step === 2 && <div><h3 className="font-serif text-2xl">Confirmez les agents</h3><p className="mt-2 text-sm text-[var(--armada-text)]/50">Suggestions basées sur leur rôle. Aucun autre agent n’aura accès.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{agents.map((agent) => <label key={agent.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors', agentIds.includes(agent.id) ? 'border-[var(--armada-primary)] bg-[var(--armada-primary)]/5' : 'border-[var(--armada-accent)]')}><input type="checkbox" checked={agentIds.includes(agent.id)} onChange={() => setAgentIds((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id])} className="accent-[var(--armada-primary)]" /><div><p className="text-sm font-medium">{agent.name}</p><p className="text-[10px] font-mono uppercase text-[var(--armada-text)]/35">{agent.type}</p></div>{recommended(agent) && <Sparkles className="ml-auto h-3.5 w-3.5 text-[var(--armada-primary)]" />}</label>)}</div></div>}
          {step === 3 && <div><h3 className="font-serif text-2xl">Prêt à connecter</h3><div className="mt-5 divide-y divide-[var(--armada-accent)]/50 rounded-2xl border border-[var(--armada-accent)]/60">{[['Compte', label], ['Accès', `${scopes.length || 'OAuth'} autorisation(s)`], ['Agents', `${agentIds.length} agent(s)`], ['Écritures', 'Approbation requise']].map(([key, value]) => <div key={key} className="flex items-center justify-between px-4 py-3 text-sm"><span className="text-[var(--armada-text)]/45">{key}</span><span>{value}</span></div>)}</div><div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-xs leading-relaxed text-[var(--armada-text)]/55"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />Les e-mails et documents sont considérés comme du contenu externe non fiable. Les résultats bruts ne sont pas conservés dans l’historique Armada.</div></div>}
          {error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--armada-accent)]/50 px-6 py-4"><button disabled={step === 0 || busy} onClick={() => setStep((value) => value - 1)} className="flex items-center gap-2 rounded-full px-4 py-2 text-sm disabled:opacity-30"><ArrowLeft className="h-4 w-4" />Retour</button>{step < 3 ? <button disabled={!label.trim()} onClick={() => setStep((value) => value + 1)} className="flex items-center gap-2 rounded-full bg-[var(--armada-text)] px-5 py-2.5 text-sm text-[var(--armada-bg)]">Continuer <ArrowRight className="h-4 w-4" /></button> : <button disabled={busy} onClick={connect} className="flex items-center gap-2 rounded-full bg-[var(--armada-primary)] px-5 py-2.5 text-sm text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{oauth ? 'Autoriser et connecter' : 'Connecter'}</button>}</div>
      </div>
    </div>
  );
}

function ConnectionPanel({ connection, agents, onClose, refresh }: { connection: Connection; agents: Agent[]; onClose: () => void; refresh: () => void }) {
  const [agentIds, setAgentIds] = useState(connection.grants.map((grant) => grant.agentId));
  const [selectedAgent, setSelectedAgent] = useState(connection.grants[0]?.agentId || '');
  const [policies, setPolicies] = useState<Record<string, string>>(() => Object.fromEntries(connection.policies.filter((item) => item.agentId === connection.grants[0]?.agentId).map((item) => [item.toolName, item.mode])));
  const [disabledTools, setDisabledTools] = useState<string[]>(connection.disabledTools || []);
  const [busy, setBusy] = useState(false);
  const enabledCount = connection.discoveredTools.length - disabledTools.length;

  useEffect(() => setDisabledTools(connection.disabledTools || []), [connection.disabledTools]);
  useEffect(() => setPolicies(Object.fromEntries(connection.policies.filter((item) => item.agentId === selectedAgent).map((item) => [item.toolName, item.mode]))), [selectedAgent, connection.policies]);
  async function saveAgents() { setBusy(true); await fetch(`/api/connections/${connection.id}/grants`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentIds }) }); setBusy(false); refresh(); }
  async function savePolicies() { if (!selectedAgent) return; setBusy(true); await fetch(`/api/connections/${connection.id}/policies`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: selectedAgent, policies: Object.entries(policies).map(([toolName, mode]) => ({ toolName, mode })) }) }); setBusy(false); refresh(); }
  function toggleTool(name: string) { setDisabledTools((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]); }
  async function saveTools() { setBusy(true); await fetch(`/api/connections/${connection.id}/tools`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabledTools }) }); setBusy(false); refresh(); }
  async function remove() { if (!window.confirm(`Déconnecter ${connection.label} ?`)) return; setBusy(true); await fetch(`/api/connections/${connection.id}`, { method: 'DELETE' }); refresh(); onClose(); }
  const status = STATUS[connection.status] || STATUS.error;
  return <div className="fixed inset-0 z-[100] flex justify-end bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="h-full w-full max-w-2xl overflow-y-auto border-l border-[var(--armada-accent)] bg-[var(--armada-surface)] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--armada-accent)] bg-[var(--armada-surface)]/95 p-6 backdrop-blur"><div><div className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', status.dot)} /><span className="text-[10px] font-mono uppercase text-[var(--armada-text)]/45">{status.label}</span></div><h2 className="mt-1 font-serif text-2xl">{connection.label}</h2><p className="text-sm text-[var(--armada-text)]/40">{connection.connector.name}{connection.accountEmail ? ` · ${connection.accountEmail}` : ''}</p></div><button onClick={onClose} className="rounded-full p-2 hover:bg-[var(--armada-bg)]"><X className="h-4 w-4" /></button></div><div className="space-y-8 p-6">{connection.lastError && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">{connection.lastError}</div>}<section><div className="mb-3 flex items-center justify-between"><div><h3 className="font-medium">Agents autorisés</h3><p className="text-xs text-[var(--armada-text)]/40">Accès explicite à ce compte uniquement.</p></div><button onClick={saveAgents} disabled={busy} className="rounded-full bg-[var(--armada-text)] px-4 py-2 text-xs text-[var(--armada-bg)]">Enregistrer</button></div><div className="grid gap-2 sm:grid-cols-2">{agents.map((agent) => <label key={agent.id} className="flex items-center gap-3 rounded-xl border border-[var(--armada-accent)] p-3"><input type="checkbox" checked={agentIds.includes(agent.id)} onChange={() => setAgentIds((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id])} /><span className="text-sm">{agent.name}</span><span className="ml-auto text-[10px] font-mono text-[var(--armada-text)]/30">{agent.type}</span></label>)}</div></section><section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-medium">Outils actifs</h3><p className="text-xs text-[var(--armada-text)]/40">Les outils désactivés ne sont jamais transmis aux agents. Ils restent listés ici et peuvent être réactivés.</p></div><div className="flex items-center gap-3"><span className="text-[10px] font-mono text-[var(--armada-text)]/45">{enabledCount}/{connection.discoveredTools.length} ACTIFS</span><button onClick={saveTools} disabled={busy} className="rounded-full bg-[var(--armada-text)] px-4 py-2 text-xs text-[var(--armada-bg)] disabled:opacity-40">Enregistrer</button></div></div>{enabledCount > 128 && <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-500">{enabledCount} outils actifs. Au-delà de 128, les agents choisissent moins bien leur outil et consomment beaucoup de contexte — désactivez ceux dont vous n’avez pas besoin.</div>}{connection.discoveredTools?.length ? <div className="max-h-80 overflow-y-auto rounded-2xl border border-[var(--armada-accent)]"><div className="divide-y divide-[var(--armada-accent)]/50">{connection.discoveredTools.map((tool) => <label key={tool.name} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-[var(--armada-bg)]/40"><input type="checkbox" checked={!disabledTools.includes(tool.name)} onChange={() => toggleTool(tool.name)} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><code className={cn('truncate text-xs', disabledTools.includes(tool.name) && 'text-[var(--armada-text)]/30 line-through')}>{tool.name}</code><span className={cn('rounded-full px-2 py-0.5 text-[9px] font-mono', tool.readOnly ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500')}>{tool.readOnly ? 'LECTURE' : 'ÉCRITURE'}</span></div><p className="mt-0.5 line-clamp-1 text-xs text-[var(--armada-text)]/40">{tool.description}</p></div></label>)}</div></div> : <div className="rounded-xl border border-dashed border-[var(--armada-accent)] p-6 text-center text-sm text-[var(--armada-text)]/40">Les outils apparaîtront après le premier test de connexion.</div>}</section><section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-medium">Politiques des outils</h3><p className="text-xs text-[var(--armada-text)]/40">Lecture automatique, écriture avec approbation par défaut.</p></div><select value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)} className="rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-3 py-2 text-xs"><option value="">Choisir un agent</option>{connection.grants.map((grant) => <option key={grant.agentId} value={grant.agentId}>{grant.agent.name}</option>)}</select></div>{connection.discoveredTools?.length ? <div className="overflow-hidden rounded-2xl border border-[var(--armada-accent)]"><div className="divide-y divide-[var(--armada-accent)]/50">{connection.discoveredTools.filter((tool) => !disabledTools.includes(tool.name)).map((tool) => <div key={tool.name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><code className="truncate text-xs">{tool.name}</code><span className={cn('rounded-full px-2 py-0.5 text-[9px] font-mono', tool.readOnly ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500')}>{tool.readOnly ? 'LECTURE' : 'ÉCRITURE'}</span></div><p className="mt-1 line-clamp-1 text-xs text-[var(--armada-text)]/40">{tool.description}</p></div><select disabled={!selectedAgent} value={policies[tool.name] || (tool.readOnly ? 'automatic' : 'approval')} onChange={(event) => setPolicies({ ...policies, [tool.name]: event.target.value })} className="rounded-lg border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-3 py-2 text-xs"><option value="blocked">Bloqué</option><option value="automatic">Automatique</option><option value="approval">Approbation</option></select></div>)}</div><div className="flex justify-end border-t border-[var(--armada-accent)] p-3"><button onClick={savePolicies} disabled={!selectedAgent || busy} className="rounded-full bg-[var(--armada-primary)] px-4 py-2 text-xs text-white disabled:opacity-40">Enregistrer les politiques</button></div></div> : <div className="rounded-xl border border-dashed border-[var(--armada-accent)] p-6 text-center text-sm text-[var(--armada-text)]/40">Les outils apparaîtront après le premier test de connexion.</div>}</section><section className="flex flex-wrap gap-2 border-t border-[var(--armada-accent)] pt-6"><button onClick={async () => { setBusy(true); await fetch(`/api/connections/${connection.id}/test`, { method: 'POST' }); setBusy(false); refresh(); }} className="flex items-center gap-2 rounded-full border border-[var(--armada-accent)] px-4 py-2 text-xs"><RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />Tester</button><button onClick={remove} className="ml-auto flex items-center gap-2 rounded-full border border-red-500/20 px-4 py-2 text-xs text-red-500"><Trash2 className="h-3.5 w-3.5" />Déconnecter</button></section></div></div></div>;
}

function CustomConnectorModal({ storeId, onClose, onDone }: { storeId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', slug: '', url: '', label: '', authHeader: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true); setError('');
    const response = await fetch('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId, customUrl: form.url, name: form.name, slug: form.slug, label: form.label || form.name, authHeader: form.authHeader }) });
    const data = await response.json();
    if (response.status === 409 && data.oauthUrl) { window.location.assign(data.oauthUrl); return; }
    if (!response.ok) { setError(data.error || 'Connexion impossible'); setBusy(false); return; }
    onDone();
  }
  return <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center md:p-6"><div className="w-full max-w-xl rounded-t-3xl border border-[var(--armada-accent)] bg-[var(--armada-surface)] p-6 shadow-2xl md:rounded-3xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-mono uppercase tracking-widest text-violet-500">Avancé</p><h2 className="mt-1 font-serif text-2xl">Serveur MCP personnalisé</h2><p className="mt-2 text-sm text-[var(--armada-text)]/45">URL Streamable HTTP publique. OAuth MCP est utilisé si aucun header n’est fourni.</p></div><button onClick={onClose} className="rounded-full p-2 hover:bg-[var(--armada-bg)]"><X className="h-4 w-4" /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nom de l’app" className="rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-4 py-3 text-sm sm:col-span-1" /><input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="Identifiant court" className="rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-4 py-3 text-sm" /><input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://mcp.exemple.com/mcp" className="rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-4 py-3 text-sm sm:col-span-2" /><input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Nom du compte" className="rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-4 py-3 text-sm" /><input type="password" value={form.authHeader} onChange={(event) => setForm({ ...form, authHeader: event.target.value })} placeholder="Bearer … (optionnel)" className="rounded-xl border border-[var(--armada-accent)] bg-[var(--armada-bg)] px-4 py-3 text-sm" /></div><div className="mt-4 flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs text-[var(--armada-text)]/50"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />Armada bloque les réseaux privés, identifiants dans l’URL, commandes locales et packages non certifiés.</div>{error && <p className="mt-3 text-sm text-red-500">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-full px-4 py-2 text-sm">Annuler</button><button disabled={busy || !form.name || !form.url} onClick={submit} className="flex items-center gap-2 rounded-full bg-[var(--armada-primary)] px-5 py-2.5 text-sm text-white disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Connecter</button></div></div></div>;
}

export default function IntegrationsPage() {
  const featureEnabled = process.env.NEXT_PUBLIC_MCP_CONNECTOR_PLATFORM_V2 !== 'false';
  const { activeStoreId } = useActiveStore();
  const [tab, setTab] = useState<'discover' | 'connected'>('discover');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [trust, setTrust] = useState('all');
  const [wizard, setWizard] = useState<Connector | null>(null);
  const [panel, setPanel] = useState<Connection | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [banner, setBanner] = useState<{ kind: string; text: string } | null>(null);
  const { data: catalogData, isLoading: catalogLoading, mutate: refreshCatalog } = useSWR(activeStoreId ? `/api/connectors?storeId=${activeStoreId}` : null, fetcher);
  const { data: connectionData, isLoading: connectionLoading, mutate: refreshConnections } = useSWR(activeStoreId ? `/api/connections?storeId=${activeStoreId}` : null, fetcher, { refreshInterval: 30000 });
  const { data: agentData } = useSWR(activeStoreId ? `/api/agents?storeId=${activeStoreId}` : null, fetcher);
  const connectors: Connector[] = catalogData?.connectors || [];
  const connections: Connection[] = connectionData?.connections || [];
  const agents: Agent[] = agentData?.agents || [];
  const categories = ['all', ...Array.from(new Set(connectors.map((item) => item.category)))];
  const filtered = useMemo(() => connectors.filter((item) => (category === 'all' || item.category === category) && (trust === 'all' || item.verificationTier === trust) && (!search || `${item.name} ${item.description} ${item.publisher}`.toLowerCase().includes(search.toLowerCase()))), [connectors, category, trust, search]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mcp') === 'connected') {
      const partial = (params.get('partial_scopes') || '').split(',').filter(Boolean);
      setBanner(partial.length
        ? { kind: 'warn', text: `Compte connecté, mais des permissions ont été refusées : ${partial.map(shortScopeLabel).join(', ')}. Les outils qui en dépendent échoueront — reconnectez le compte et acceptez toutes les autorisations.` }
        : { kind: 'ok', text: 'Compte connecté. Vérification des outils MCP en cours…' });
      setTab('connected'); refreshConnections(); refreshCatalog(); window.history.replaceState({}, '', '/integrations');
    }
    else if (params.get('mcp') === 'error' || params.get('mcp') === 'denied') { setBanner({ kind: 'error', text: `Connexion interrompue : ${params.get('reason') || 'autorisation refusée'}` }); window.history.replaceState({}, '', '/integrations'); }
  }, []);

  async function syncRegistry() { setBanner({ kind: 'ok', text: 'Recherche du registre MCP…' }); await fetch('/api/connectors/registry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: search }) }); await refreshCatalog(); setBanner({ kind: 'ok', text: 'Catalogue communautaire actualisé.' }); }
  const loading = catalogLoading || connectionLoading;
  if (!featureEnabled) return <div className="p-8"><div className="rounded-2xl border border-[var(--armada-accent)] bg-[var(--armada-surface)] p-8"><h1 className="font-serif text-2xl">Apps & outils</h1><p className="mt-2 text-sm text-[var(--armada-text)]/50">La nouvelle plateforme MCP est désactivée pour cet environnement.</p></div></div>;
  return <div className="min-h-screen bg-[var(--armada-bg)] text-[var(--armada-text)]"><header className="border-b border-[var(--armada-accent)]/50 bg-[var(--armada-surface)]"><div className="mx-auto max-w-7xl px-4 py-6 md:px-6"><div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--armada-primary)]"><Sparkles className="h-3.5 w-3.5" />Connector Platform v2</div><h1 className="font-serif text-3xl tracking-tight md:text-4xl">Apps & outils</h1><p className="mt-2 max-w-xl text-sm text-[var(--armada-text)]/50">Connectez vos comptes, choisissez les agents autorisés et gardez le contrôle sur chaque action.</p></div><div className="flex rounded-full border border-[var(--armada-accent)] bg-[var(--armada-bg)] p-1"><button onClick={() => setTab('discover')} className={cn('rounded-full px-5 py-2 text-xs transition-colors', tab === 'discover' && 'bg-[var(--armada-text)] text-[var(--armada-bg)]')}>Découvrir</button><button onClick={() => setTab('connected')} className={cn('rounded-full px-5 py-2 text-xs transition-colors', tab === 'connected' && 'bg-[var(--armada-text)] text-[var(--armada-bg)]')}>Connectées <span className="ml-1 opacity-60">{connections.length}</span></button></div></div></div></header><main className="mx-auto max-w-7xl p-4 md:p-6">{banner && <div className={cn('mb-5 flex items-center justify-between rounded-xl border p-4 text-sm', banner.kind === 'ok' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600' : banner.kind === 'warn' ? 'border-amber-500/25 bg-amber-500/5 text-amber-600' : 'border-red-500/20 bg-red-500/5 text-red-500')}><span className="flex items-start gap-2">{banner.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}{banner.text}</span><button onClick={() => setBanner(null)}><X className="h-4 w-4" /></button></div>}{!activeStoreId ? <div className="rounded-2xl border border-dashed border-[var(--armada-accent)] p-12 text-center"><CircleOff className="mx-auto h-8 w-8 text-[var(--armada-text)]/25" /><p className="mt-3">Sélectionnez une boutique pour gérer ses connexions.</p></div> : tab === 'discover' ? <><div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]"><div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--armada-text)]/30" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher Gmail, Drive, Notion…" className="w-full rounded-full border border-[var(--armada-accent)] bg-[var(--armada-surface)] py-3 pl-11 pr-4 text-sm outline-none focus:border-[var(--armada-primary)]" /></div><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-full border border-[var(--armada-accent)] bg-[var(--armada-surface)] px-4 text-xs"><option value="all">Toutes catégories</option>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select><select value={trust} onChange={(event) => setTrust(event.target.value)} className="rounded-full border border-[var(--armada-accent)] bg-[var(--armada-surface)] px-4 text-xs"><option value="all">Tous niveaux</option><option value="armada_verified">Vérifié Armada</option><option value="publisher_verified">Éditeur vérifié</option><option value="community">Communauté</option></select><button onClick={syncRegistry} className="flex items-center justify-center gap-2 rounded-full border border-[var(--armada-accent)] bg-[var(--armada-surface)] px-4 py-3 text-xs"><Server className="h-3.5 w-3.5" />Registre MCP</button></div>{loading ? <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[var(--armada-primary)]" /></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map((connector) => <ConnectorCard key={connector.id} connector={connector} onOpen={() => setWizard(connector)} />)}</div>}<div className="mt-10 rounded-2xl border border-dashed border-[var(--armada-accent)] bg-[var(--armada-surface)]/40 p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-violet-500/10 p-2 text-violet-500"><Plus className="h-5 w-5" /></div><div><h3 className="font-medium">Serveur MCP personnalisé</h3><p className="mt-1 text-xs text-[var(--armada-text)]/45">HTTPS public uniquement. Les commandes et packages arbitraires sont bloqués.</p></div></div><button onClick={() => setShowCustom(true)} className="rounded-full border border-[var(--armada-accent)] px-4 py-2 text-xs hover:border-violet-500/40">Ajouter un serveur</button></div></div></> : <>{connections.length === 0 ? <div className="rounded-3xl border border-dashed border-[var(--armada-accent)] py-20 text-center"><Unplug className="mx-auto h-8 w-8 text-[var(--armada-text)]/25" /><h2 className="mt-4 font-serif text-2xl">Aucune app connectée</h2><p className="mt-2 text-sm text-[var(--armada-text)]/45">Connectez un premier compte puis confirmez les agents autorisés.</p><button onClick={() => setTab('discover')} className="mt-5 rounded-full bg-[var(--armada-primary)] px-5 py-2.5 text-sm text-white">Découvrir les apps</button></div> : <div className="grid gap-4 lg:grid-cols-2">{connections.map((connection) => { const state = STATUS[connection.status] || STATUS.error; const missingScopes = missingConnectionScopes(connection.connector.scopes, connection.grantedScopes); return <button key={connection.id} onClick={() => setPanel(connection)} className="rounded-2xl border border-[var(--armada-accent)] bg-[var(--armada-surface)] p-5 text-left transition-colors hover:border-[var(--armada-primary)]/40"><div className="flex items-start gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--armada-bg)] text-lg">{connection.connector.logo}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-medium">{connection.label}</h3>{connection.connector.isBeta && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-500">BETA</span>}{missingScopes.length > 0 && <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600" title={`Permissions non accordées : ${missingScopes.map(shortScopeLabel).join(', ')}`}><AlertTriangle className="h-2.5 w-2.5" />PERMISSIONS</span>}</div><p className="mt-0.5 truncate text-xs text-[var(--armada-text)]/40">{connection.accountEmail || connection.connector.name}</p></div><ChevronRight className="h-4 w-4 text-[var(--armada-text)]/25" /></div><div className="mt-5 grid grid-cols-3 divide-x divide-[var(--armada-accent)] border-t border-[var(--armada-accent)] pt-4"><div><p className="text-[10px] font-mono text-[var(--armada-text)]/35">ÉTAT</p><p className="mt-1 flex items-center gap-1.5 text-xs"><span className={cn('h-2 w-2 rounded-full', state.dot)} />{state.label}</p></div><div className="pl-4"><p className="text-[10px] font-mono text-[var(--armada-text)]/35">AGENTS</p><p className="mt-1 text-xs">{connection.grants.length}</p></div><div className="pl-4"><p className="text-[10px] font-mono text-[var(--armada-text)]/35">OUTILS</p><p className="mt-1 text-xs">{connection.discoveredTools?.length || 0}</p></div></div>{missingScopes.length > 0 && <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-600"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>{missingScopes.length} permission{missingScopes.length > 1 ? 's' : ''} non accordée{missingScopes.length > 1 ? 's' : ''} : {missingScopes.map(shortScopeLabel).join(', ')}. Les outils qui en dépendent échoueront — reconnectez ce compte.</span></div>}</button>; })}</div>}</>}</main>{showCustom && activeStoreId && <CustomConnectorModal storeId={activeStoreId} onClose={() => setShowCustom(false)} onDone={() => { setShowCustom(false); refreshConnections(); refreshCatalog(); setTab('connected'); }} />}{wizard && activeStoreId && <ConnectWizard connector={wizard} agents={agents} storeId={activeStoreId} onClose={() => { setWizard(null); refreshConnections(); refreshCatalog(); }} />}{panel && <ConnectionPanel connection={panel} agents={agents} onClose={() => setPanel(null)} refresh={() => { refreshConnections().then((data) => { const updated = data?.connections?.find((item: Connection) => item.id === panel.id); if (updated) setPanel(updated); }); refreshCatalog(); }} />}</div>;
}
