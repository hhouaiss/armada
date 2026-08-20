'use client';

import useSWR from 'swr';
import { Check, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((response) => response.json());

export function AgentAppTools({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { data, isLoading, mutate } = useSWR(`/api/agents/${agentId}/connections`, fetcher);
  const connections = data?.connections || [];
  async function toggle(connectionId: string, granted: boolean) {
    await fetch(`/api/agents/${agentId}/connections`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId, granted }) });
    await mutate();
  }
  return <div className="mt-8 border-t border-border pt-8"><div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-blue-500/10 p-2 text-blue-500"><KeyRound className="h-5 w-5" /></div><div><h2 className="text-xl font-bold tracking-tight">APPS & OUTILS</h2><p className="mt-1 text-sm text-muted-foreground">Choisissez précisément les comptes externes accessibles à {agentName}. Les écritures restent soumises à approbation.</p></div></div>{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : connections.length ? <div className="grid gap-3 sm:grid-cols-2">{connections.map((connection: any) => <button key={connection.id} onClick={() => toggle(connection.id, !connection.granted)} className={cn('flex items-center gap-3 rounded-xl border p-4 text-left transition-all', connection.granted ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-card hover:border-blue-500/25')}><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-lg">{connection.connector.logo || connection.connector.name[0]}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{connection.label}</p><p className="truncate text-xs text-muted-foreground">{connection.connector.name}{connection.accountEmail ? ` · ${connection.accountEmail}` : ''}</p></div><div className={cn('flex h-6 w-6 items-center justify-center rounded-full border', connection.granted ? 'border-blue-500 bg-blue-500 text-white' : 'border-border')}>{connection.granted && <Check className="h-3.5 w-3.5" />}</div></button>)}</div> : <div className="rounded-xl border border-dashed border-border p-6 text-center"><ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Aucun compte connecté pour cette boutique.</p><a href="/integrations" className="mt-3 inline-block text-sm text-blue-500">Ouvrir Apps & outils</a></div>}</div>;
}
