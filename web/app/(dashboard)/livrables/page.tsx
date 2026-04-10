'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR, { mutate as globalMutate } from 'swr';
import {
  FileText, CheckCircle2, Circle, ChevronRight, ExternalLink,
  Plus, Zap, Layers, Filter, Bot, Clock, Sparkles, ArrowUpRight,
  X, Loader2, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { AGENT_COLORS, dispatchLivrablesChanged, type Livrable } from '@/lib/livrables';
import { ContentRenderer } from '@/components/livrables/content-renderer';

// ── Fetcher ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hier' : `il y a ${d}j`;
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Action buttons (UI placeholders) ─────────────────────────────────────────

function ActionBar() {
  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--armada-accent)]/40">
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all">
        <Plus className="h-3 w-3" />
        Créer une tâche {/* i18n: Create a task */}
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all">
        <Zap className="h-3 w-3" />
        Lancer avec un agent {/* i18n: Launch with an agent */}
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all">
        <Layers className="h-3 w-3" />
        Ajouter à une mission {/* i18n: Add to a mission */}
      </button>
    </div>
  );
}

// ── List item ─────────────────────────────────────────────────────────────────

function LivrableListItem({
  livrable, isSelected, onClick,
}: {
  livrable: Livrable; isSelected: boolean; onClick: () => void;
}) {
  const color = AGENT_COLORS[livrable.agentType] ?? AGENT_COLORS.major;
  const preview = livrable.content.replace(/[#*`\-]/g, '').slice(0, 120).trim();

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-200 group ${
        isSelected
          ? 'border-[var(--armada-primary)]/40 bg-[var(--armada-primary)]/5'
          : 'border-transparent hover:border-[var(--armada-accent)]/60 hover:bg-[var(--armada-surface-hover)]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <div className="mt-1.5 shrink-0">
          {livrable.isRead
            ? <div className="w-2 h-2 rounded-full bg-[var(--armada-accent)]" />
            : <div className="w-2 h-2 rounded-full bg-[var(--armada-primary)] shadow-[0_0_6px_var(--armada-primary)]" />
          }
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <p className={`text-sm leading-tight truncate ${
            livrable.isRead ? 'text-[var(--armada-text)]/70 font-normal' : 'text-[var(--armada-text)] font-medium'
          }`}>
            {livrable.title}
          </p>
          <p className="text-xs text-[var(--armada-text)]/40 line-clamp-2 leading-relaxed">
            {preview}
          </p>
          <div className="flex items-center gap-2 pt-0.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono ${color}`}>
              <Bot className="h-2.5 w-2.5" />
              {livrable.agentName}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--armada-text)]/30">
              <Clock className="h-2.5 w-2.5" />
              {formatRelativeDate(livrable.createdAt)}
            </span>
          </div>
        </div>

        <ChevronRight className={`h-3.5 w-3.5 mt-1 shrink-0 transition-opacity ${
          isSelected ? 'opacity-100 text-[var(--armada-primary)]' : 'opacity-0 group-hover:opacity-40'
        }`} />
      </div>
    </button>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function LivrableDetail({
  livrable, storeId,
}: {
  livrable: Livrable; storeId: string;
}) {
  const color = AGENT_COLORS[livrable.agentType] ?? AGENT_COLORS.major;

  return (
    <motion.div
      key={livrable.id}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full overflow-y-auto"
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 border-b border-[var(--armada-accent)]/50 px-8 py-5"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <h1 className="font-serif tracking-tight text-2xl text-[var(--armada-text)] leading-tight">
              {livrable.title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-mono ${color}`}>
                <Bot className="h-3 w-3" />
                {livrable.agentName}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--armada-text)]/30">
                <Clock className="h-3 w-3" />
                {formatFullDate(livrable.createdAt)}
              </span>
            </div>
          </div>
          <Link
            href={`/livrables/${livrable.id}`}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all"
          >
            <ExternalLink className="h-3 w-3" />
            Plein écran {/* i18n: Full screen */}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6 max-w-3xl space-y-5">
        {/* Summary (first 300 chars) */}
        <div
          className="p-5 rounded-2xl border border-[var(--armada-primary)]/20"
          style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, var(--armada-surface))' }}
        >
          <p className="text-[10px] font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-2">
            Résumé {/* i18n: Summary */}
          </p>
          <p className="text-sm text-[var(--armada-text)]/80 leading-relaxed">
            {livrable.content.replace(/[#*`]/g, '').split('\n').find((l) => l.trim().length > 30) ?? livrable.content.slice(0, 300)}
          </p>
          <ActionBar />
        </div>

        {/* Full content */}
        <div
          className="p-6 rounded-2xl border border-[var(--armada-accent)]/50"
          style={{ backgroundColor: 'var(--armada-surface)' }}
        >
          <p className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-widest mb-4">
            Contenu complet {/* i18n: Full content */}
          </p>
          <ContentRenderer content={livrable.content} />
          <ActionBar />
        </div>

        {/* Collaboration */}
        <div
          className="rounded-2xl border border-[var(--armada-accent)]/50 p-5 space-y-3"
          style={{ backgroundColor: 'var(--armada-surface)' }}
        >
          <p className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-widest">
            Collaboration {/* i18n: Collaboration */}
          </p>
          <div className="flex gap-3">
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)] transition-all">
              <Plus className="h-3.5 w-3.5" />
              Annoter {/* i18n: Annotate */}
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)] transition-all">
              <Zap className="h-3.5 w-3.5" />
              Demander une révision {/* i18n: Request a revision */}
            </button>
          </div>
          <p className="text-[10px] font-mono text-[var(--armada-text)]/20 text-center">
            Armada HQ — Collaboration humain × agent
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptySelection() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-8">
      <div className="w-16 h-16 rounded-2xl border border-[var(--armada-accent)]/50 flex items-center justify-center"
        style={{ backgroundColor: 'var(--armada-surface)' }}>
        <FileText className="h-7 w-7 text-[var(--armada-text)]/20" />
      </div>
      <div className="space-y-1.5">
        <p className="font-serif text-lg text-[var(--armada-text)]/50">Sélectionnez un livrable</p>
        <p className="text-xs text-[var(--armada-text)]/30 max-w-xs leading-relaxed">
          Les analyses et rapports produits par vos agents apparaissent ici, structurés et prêts à l'action.
        </p>
      </div>
    </div>
  );
}

function NoLivrables({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <CheckCircle2 className="h-8 w-8 text-[var(--armada-text)]/20 mb-3" />
      <p className="text-sm text-[var(--armada-text)]/40 font-serif">
        {filter === 'unread' ? 'Tout est lu !' : 'Aucun livrable pour ce filtre.'}
      </p>
      <p className="text-xs text-[var(--armada-text)]/25 mt-1">
        {filter === 'all' ? 'Vos agents publieront leurs analyses ici.' : ''}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'unread' | string;

export default function LivrablesPage() {
  const { activeStoreId } = useActiveStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  const swrKey = activeStoreId ? `/api/livrables?storeId=${activeStoreId}` : null;
  const { data, isLoading, error, mutate } = useSWR<{
    livrables: Livrable[];
    unreadCount: number;
  }>(swrKey, fetcher, { refreshInterval: 15000 });

  const livrables: Livrable[] = data?.livrables ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Mark as read via API then revalidate
  const handleSelect = useCallback(
    async (livrable: Livrable) => {
      setSelectedId(livrable.id);
      if (!livrable.isRead) {
        await fetch(`/api/livrables/${livrable.id}`, { method: 'PATCH' });
        mutate();
        dispatchLivrablesChanged();
      }
    },
    [mutate]
  );

  // Unique agent types for filter pills
  const agentTypes = [...new Set(livrables.map((l) => l.agentType))];

  const filtered = livrables.filter((l) => {
    if (filter === 'unread') return !l.isRead;
    if (filter !== 'all') return l.agentType === filter;
    return true;
  });

  const selected = selectedId ? livrables.find((l) => l.id === selectedId) : null;

  // ── Loading / no store state ──
  if (!activeStoreId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--armada-bg)' }}>
        <div className="text-center space-y-3">
          <FileText className="h-8 w-8 text-[var(--armada-text)]/20 mx-auto" />
          <p className="font-serif text-lg text-[var(--armada-text)]/50">Aucun magasin actif</p>
          <p className="text-xs text-[var(--armada-text)]/30">Connectez un magasin pour voir les livrables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--armada-bg)' }}>

      {/* ── Left panel — list ── */}
      <div
        className="w-[380px] shrink-0 flex flex-col border-r border-[var(--armada-accent)]/50 h-full"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        {/* Header */}
        <div className="border-b border-[var(--armada-accent)]/50 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="font-serif tracking-tight text-xl text-[var(--armada-text)]">
                Livrables {/* i18n: Deliverables */}
              </h1>
              <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
                {isLoading ? (
                  <span className="inline-flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Chargement…</span>
                ) : unreadCount > 0 ? (
                  <span style={{ color: 'var(--armada-primary)' }}>{unreadCount} non lu{unreadCount > 1 ? 's' : ''}</span>
                ) : (
                  'Tout lu'
                )}{!isLoading && ` · ${livrables.length} total`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-mono text-white shadow-[0_0_10px_var(--armada-primary)]"
                  style={{ backgroundColor: 'var(--armada-primary)' }}
                >
                  {unreadCount}
                </span>
              )}
              <button
                onClick={() => mutate()}
                className="p-1.5 rounded-full text-[var(--armada-text)]/30 hover:text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] transition-all"
                title="Rafraîchir"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              onClick={() => setFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-mono transition-all ${
                filter === 'all'
                  ? 'bg-[var(--armada-text)] text-[var(--armada-bg)]'
                  : 'text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono transition-all ${
                filter === 'unread'
                  ? 'text-white'
                  : 'text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
              }`}
              style={filter === 'unread' ? { backgroundColor: 'var(--armada-primary)' } : {}}
            >
              <Circle className="h-2 w-2 fill-current" />
              Non lus {unreadCount > 0 && `(${unreadCount})`}
            </button>
            {agentTypes.map((type) => {
              const name = livrables.find((l) => l.agentType === type)?.agentName ?? type;
              return (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-mono transition-all ${
                    filter === type
                      ? 'bg-[var(--armada-text)] text-[var(--armada-bg)]'
                      : 'text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-[var(--armada-text)]/20 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <p className="text-xs text-red-500 font-mono">Erreur de chargement</p>
              <button onClick={() => mutate()} className="mt-2 text-[10px] text-[var(--armada-text)]/40 hover:text-[var(--armada-text)] underline">
                Réessayer
              </button>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <NoLivrables filter={filter} />
                </motion.div>
              ) : (
                filtered.map((livrable) => (
                  <motion.div
                    key={livrable.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <LivrableListItem
                      livrable={livrable}
                      isSelected={selectedId === livrable.id}
                      onClick={() => handleSelect(livrable)}
                    />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--armada-accent)]/50 px-5 py-3 flex items-center justify-between">
          <p className="text-[10px] font-mono text-[var(--armada-text)]/25">
            Mis à jour toutes les 15 s {/* i18n: Updated every 15s */}
          </p>
          <Filter className="h-3 w-3 text-[var(--armada-text)]/20" />
        </div>
      </div>

      {/* ── Right panel — detail ── */}
      <div className="flex-1 h-full" style={{ backgroundColor: 'var(--armada-bg)' }}>
        <AnimatePresence mode="wait">
          {selected ? (
            <LivrableDetail key={selected.id} livrable={selected} storeId={activeStoreId} />
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <EmptySelection />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
