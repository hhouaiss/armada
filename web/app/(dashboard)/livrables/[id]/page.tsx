'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Clock, FileText, Plus, Zap, Layers, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { AGENT_COLORS, dispatchLivrablesChanged, type Livrable } from '@/lib/livrables';
import { ContentRenderer } from '@/components/livrables/content-renderer';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function ActionButtons() {
  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--armada-accent)]/40">
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all">
        <Plus className="h-3 w-3" />Créer une tâche
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all">
        <Zap className="h-3 w-3" />Lancer avec un agent
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all">
        <Layers className="h-3 w-3" />Ajouter à une mission
      </button>
    </div>
  );
}

export default function LivrableDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data, isLoading, error } = useSWR<{ livrable: Livrable }>(
    id ? `/api/livrables/${id}` : null,
    fetcher
  );
  const livrable = data?.livrable;

  // Mark as read on mount
  useEffect(() => {
    if (!livrable || livrable.isRead) return;
    fetch(`/api/livrables/${livrable.id}`, { method: 'PATCH' }).then(() => {
      dispatchLivrablesChanged();
    });
  }, [livrable]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--armada-bg)' }}>
        <Loader2 className="h-6 w-6 text-[var(--armada-text)]/30 animate-spin" />
      </div>
    );
  }

  // ── Error / not found ──
  if (error || !livrable) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--armada-bg)' }}>
        <div className="w-14 h-14 rounded-full border border-[var(--armada-accent)] flex items-center justify-center">
          <FileText className="h-6 w-6 text-[var(--armada-text)]/30" />
        </div>
        <p className="font-serif text-xl text-[var(--armada-text)]">Livrable introuvable</p>
        <Link href="/livrables" className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--armada-accent)] text-sm text-[var(--armada-text)]/70 hover:bg-[var(--armada-surface-hover)] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour aux livrables
        </Link>
      </div>
    );
  }

  const agentColor = AGENT_COLORS[livrable.agentType] ?? AGENT_COLORS.major;
  const summary = livrable.content.replace(/[#*`]/g, '').split('\n').find((l) => l.trim().length > 30) ?? livrable.content.slice(0, 300);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-20 border-b border-[var(--armada-accent)]/50 px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/livrables')}
            className="flex items-center gap-1.5 text-sm text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Livrables
          </button>
          <span className="text-[var(--armada-accent)]">/</span>
          <span className="text-sm text-[var(--armada-text)]/70 truncate max-w-sm">{livrable.title}</span>
        </div>
        {livrable.isRead && (
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--armada-text)]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--armada-text)]/20" />
            Lu
          </span>
        )}
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-3xl mx-auto px-6 py-10 space-y-6"
      >
        {/* Hero */}
        <div className="space-y-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-mono ${agentColor}`}>
            <Bot className="h-3 w-3" />
            {livrable.agentName}
          </span>
          <h1 className="font-serif tracking-tight text-4xl md:text-5xl text-[var(--armada-text)] leading-tight">
            {livrable.title}
          </h1>
          <p className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--armada-text)]/30">
            <Clock className="h-3 w-3" />
            {new Date(livrable.createdAt).toLocaleString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>

        {/* Summary */}
        <div
          className="p-6 rounded-2xl border border-[var(--armada-primary)]/20"
          style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, var(--armada-surface))' }}
        >
          <p className="text-[10px] font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-3">
            Résumé exécutif
          </p>
          <p className="text-base text-[var(--armada-text)]/80 leading-relaxed">{summary}</p>
          <ActionButtons />
        </div>

        {/* Full content */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-[var(--armada-accent)]/50 overflow-hidden"
          style={{ backgroundColor: 'var(--armada-surface)' }}
        >
          <div className="px-6 py-4 border-b border-[var(--armada-accent)]/40">
            <h2 className="font-serif text-base text-[var(--armada-text)]">Analyse complète</h2>
          </div>
          <div className="px-6 py-5">
            <ContentRenderer content={livrable.content} />
            <ActionButtons />
          </div>
        </motion.div>

        {/* Collaboration footer */}
        <div
          className="rounded-2xl border border-[var(--armada-accent)]/50 p-6 space-y-4"
          style={{ backgroundColor: 'var(--armada-surface)' }}
        >
          <p className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-widest">
            Collaboration avec vos agents
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)] transition-all">
              <Plus className="h-3.5 w-3.5" />Annoter ce livrable
            </button>
            <button className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)] transition-all">
              <Zap className="h-3.5 w-3.5" />Demander une révision
            </button>
            <button className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--armada-accent)] text-xs text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)] transition-all">
              <ExternalLink className="h-3.5 w-3.5" />Exporter (PDF / Notion)
            </button>
            <button
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--armada-primary)]/30 text-xs text-[var(--armada-primary)] transition-all"
              style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, transparent)' }}
            >
              <Layers className="h-3.5 w-3.5" />Créer une mission
            </button>
          </div>
          <p className="text-[10px] font-mono text-[var(--armada-text)]/20 text-center">
            Armada HQ — Collaboration humain × agent en temps réel
          </p>
        </div>
      </motion.div>
    </div>
  );
}
