'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Search, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const STATUS_FILTERS = [
  { id: 'all',       label: 'Toutes' },      // i18n: All
  { id: 'completed', label: 'Réussies' },    // i18n: Completed
  { id: 'pending',   label: 'En cours' },    // i18n: Pending
  { id: 'failed',    label: 'Échouées' },    // i18n: Failed
] as const;

const statusStyles: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  failed:    'bg-red-500/10 text-red-500 border-red-500/20',
  pending:   'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  processing:'bg-[var(--armada-primary)]/10 border-[var(--armada-primary)]/20',
};

const statusLabels: Record<string, string> = {
  completed:  'Réussie',    // i18n: Completed
  failed:     'Échouée',    // i18n: Failed
  pending:    'En cours',   // i18n: Pending
  processing: 'En cours',   // i18n: Processing
};

export default function ActivityPage() {
  const { activeStoreId } = useActiveStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useSWR(
    activeStoreId ? `/api/operations?storeId=${activeStoreId}&limit=50` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const operations = data?.operations || [];

  const filteredOperations = operations.filter((op: any) => {
    if (statusFilter !== 'all' && op.status !== statusFilter) return false;
    if (searchQuery && !op.action.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatTimestamp = (dateStr: string) =>
    new Date(dateStr).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>

      {/* ── Header ── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-6 py-5"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <h1 className="font-serif tracking-tight text-2xl text-[var(--armada-text)]">
          Journal de Bord {/* i18n: Activity Center */}
        </h1>
        <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
          Toutes les opérations agents {/* i18n: All agent operations */}
        </p>
      </div>

      {/* ── Filters ── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-6 py-3 flex items-center gap-4"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--armada-text)]/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher des opérations…" /* i18n: Search operations */
            className="w-full rounded-full border border-[var(--armada-accent)]/60 pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-2 focus:ring-[var(--armada-primary)]/10 transition-colors"
            style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
          />
        </div>

        {/* Status pills */}
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setStatusFilter(id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                statusFilter === id
                  ? 'text-white armada-btn-primary'
                  : 'border border-[var(--armada-accent)] text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
              }`}
              style={statusFilter === id ? { backgroundColor: 'var(--armada-primary)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="p-6 max-w-5xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--armada-text)]/30" />
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredOperations.map((op: any) => (
              <div
                key={op.id}
                className="rounded-2xl border border-[var(--armada-accent)]/50 armada-card hover:border-[var(--armada-primary)]/30 transition-all duration-200"
                style={{ backgroundColor: 'var(--armada-surface)' }}
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  {/* Avatar */}
                  <Avatar className="h-9 w-9 flex-shrink-0 border border-[var(--armada-primary)]/20">
                    <AvatarFallback
                      className="text-xs font-mono font-bold"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)', color: 'var(--armada-primary)' }}
                    >
                      {(op.agent?.name?.[0] || op.agent?.type?.[0] || 'S').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm text-[var(--armada-text)] truncate">{op.action}</h3>
                        {op.result && (
                          <p className="text-xs text-[var(--armada-text)]/40 font-mono mt-0.5 truncate max-w-lg">
                            {typeof op.result === 'string' ? op.result : JSON.stringify(op.result).slice(0, 100)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[10px] font-mono text-[var(--armada-text)]/30">
                          {formatTimestamp(op.startedAt)}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-mono ${statusStyles[op.status] || 'text-[var(--armada-text)]/40 border-[var(--armada-accent)]'}`}
                          style={op.status === 'processing' ? { color: 'var(--armada-primary)' } : undefined}
                        >
                          {statusLabels[op.status] || op.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-[var(--armada-text)]/30">
                        Agent : {op.agent?.name || op.agent?.type || 'Système'} {/* i18n: Agent: ... SYSTEM */}
                      </span>
                      {op.duration && (
                        <>
                          <span className="text-[var(--armada-accent)]">·</span>
                          <span className="text-[10px] font-mono text-[var(--armada-text)]/30">
                            {(op.duration / 1000).toFixed(1)}s
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && filteredOperations.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-[var(--armada-text)]/30 font-mono">
              {operations.length === 0
                ? 'Aucune opération enregistrée'        // i18n: No operations recorded yet
                : 'Aucune opération correspondante'}    // i18n: No matching operations
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
