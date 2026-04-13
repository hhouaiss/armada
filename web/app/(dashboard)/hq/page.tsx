'use client';

import { motion } from 'framer-motion';
import useSWR from 'swr';
import {
  MessageSquare, Activity, Bot, Settings, Shield, Loader2,
  Zap, Clock, TrendingUp, Radio, Eye, Moon, ChevronRight,
  Sparkles, AlertTriangle, CheckCircle2, CircleDot,
} from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const agentPersonalities: Record<string, { name: string; role: string; currentTask: string; designation: string }> = {
  product:   { name: 'Sarah',     role: 'Spécialiste Produit',     currentTask: 'Gestion du catalogue',             designation: 'SPEC-01' },
  inventory: { name: 'Marcus',    role: 'Gestionnaire Inventaire', currentTask: 'Surveillance des stocks',          designation: 'SPEC-02' },
  support:   { name: 'Emma',      role: 'Succès Client',           currentTask: 'Organisation des données clients', designation: 'SPEC-03' },
  content:   { name: 'Alex',      role: 'Créateur de Contenu',     currentTask: 'Rédaction et publication',         designation: 'SPEC-04' },
  seo:       { name: 'Olivia',    role: 'SEO Stratège',            currentTask: 'Optimisation du référencement',    designation: 'SPEC-05' },
  major:     { name: 'Le Major',  role: 'Chef des Opérations',     currentTask: 'Coordination de l\'escouade',      designation: 'CMD-00' },
};

const friendlyActivityMessages: Record<string, () => string> = {
  product_list:          () => 'Catalogue produits consulté',
  product_get:           () => 'Fiche produit vérifiée',
  product_create:        () => 'Nouveau produit créé',
  product_update:        () => 'Produit mis à jour',
  inventory_get:         () => 'Niveaux de stock consultés',
  inventory_update:      () => 'Stock ajusté',
  inventory_low_stock:   () => 'Ruptures de stock détectées',
  customer_list:         () => 'Liste clients consultée',
  customer_get:          () => 'Profil client vérifié',
  customer_update_tags:  () => 'Clients organisés',
  order_get:             () => 'Commande vérifiée',
  order_list:            () => 'Dernières commandes consultées',
  collection_update_seo: () => 'SEO collection optimisé',
  article_create:        () => 'Article publié',
  blog_create:           () => 'Section blog créée',
  seo_search_analytics:  () => 'Performances de recherche analysées',
  seo_top_keywords:      () => 'Mots-clés analysés',
  seo_page_performance:  () => 'Métriques SEO vérifiées',
  seo_issues_report:     () => 'Opportunités SEO identifiées',
  memory_write:          () => 'Mémoire mise à jour',
  memory_read:           () => 'Mémoire consultée',
};

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function friendlyAction(op: any): string {
  return friendlyActivityMessages[op.action]?.() || op.action;
}

export default function CommandCenterPage() {
  const { isConnected } = useGateway();
  const { activeStoreId, activeStore } = useActiveStore();
  const { openChat } = useChatDrawer();

  const { data: agentsData, isLoading: agentsLoading } = useSWR(
    activeStoreId ? `/api/agents?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: workersData } = useSWR(
    activeStoreId ? `/api/workers?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: opsData } = useSWR(
    activeStoreId ? `/api/operations?storeId=${activeStoreId}&limit=100` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const agents: any[] = agentsData?.agents || [];
  const operations: any[] = opsData?.operations || [];

  const oneDayAgo = Date.now() - 86400000;
  const todayOps    = operations.filter(op => new Date(op.startedAt).getTime() > oneDayAgo);
  const completedOps = operations.filter(op => op.status === 'completed');
  const failedOps    = operations.filter(op => op.status === 'failed');
  const totalTasks   = todayOps.filter(op => op.status === 'completed').length;

  const totalAgentDurationMs = todayOps
    .filter(op => op.status === 'completed' && op.duration)
    .reduce((sum: number, op: any) => sum + op.duration, 0);
  const timeSavedMs = Math.max(0, totalTasks * 5 * 60 * 1000 - totalAgentDurationMs);
  const timeSaved   = Math.round(timeSavedMs / 3600000 * 10) / 10;

  const efficiency = completedOps.length + failedOps.length > 0
    ? Math.round(completedOps.length / (completedOps.length + failedOps.length) * 100)
    : null;

  const buildMember = (agent: any) => {
    const p = agentPersonalities[agent.type] || { name: agent.name, role: agent.type, currentTask: 'Prêt', designation: 'UNK' };
    const agentTodayOps = todayOps.filter(op => op.agentId === agent.id && op.status === 'completed');
    const agentDurationMs = agentTodayOps
      .filter((op: any) => op.duration)
      .reduce((sum: number, op: any) => sum + op.duration, 0);
    const agentTimeSavedH = Math.round(
      Math.max(0, agentTodayOps.length * 5 * 60 * 1000 - agentDurationMs) / 3600000 * 10
    ) / 10;
    const inProgressOp = operations.find(op => op.agentId === agent.id && op.status === 'in_progress');
    const lastOp       = operations.find(op => op.agentId === agent.id && op.status !== 'in_progress');
    const currentTask  = inProgressOp
      ? friendlyAction(inProgressOp)
      : lastOp ? friendlyAction(lastOp) : p.currentTask;
    return {
      id: agent.id,
      name: p.name,
      role: p.role,
      designation: p.designation,
      type: agent.type,
      model: [agent.modelProvider, agent.modelName].filter(Boolean).join('/'),
      status: agent.isOnline ? 'online' : 'offline',
      currentTask,
      isRunning: !!inProgressOp,
      todayCount: agentTodayOps.length,
      timeSavedH: agentTimeSavedH,
      lastAction: lastOp
        ? { text: friendlyAction(lastOp), time: formatTime(lastOp.startedAt) }
        : null,
    };
  };

  const teamMembers = agents.map(buildMember);
  const major       = teamMembers.find(m => m.type === 'major');
  const specialists = teamMembers.filter(m => m.type !== 'major');
  const activeCount = teamMembers.filter(m => m.status === 'online').length;

  // Last 8 ops for activity feed
  const recentOps = operations.slice(0, 8);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
    >
      {/* ── Header ── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-4 md:px-6 py-4 md:py-5"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-serif tracking-tight text-xl md:text-2xl text-[var(--armada-text)]">
              Quartier Général
            </h1>
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
              {activeStore ? activeStore.storeName : 'ArmadaOS — Tableau de bord'}
            </p>
          </div>

          {/* Metrics strip */}
          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            {[
              { label: 'Tâches / 24h', value: agentsLoading ? '—' : String(totalTasks),                             icon: Zap },
              { label: 'Temps gagné',  value: agentsLoading ? '—' : `${timeSaved}h`,                                icon: Clock },
              { label: 'Efficacité',   value: agentsLoading ? '—' : efficiency !== null ? `${efficiency}%` : '—',   icon: TrendingUp },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <s.icon className="h-3.5 w-3.5 text-[var(--armada-text)]/30" />
                <div>
                  <div className="text-sm font-bold font-mono text-[var(--armada-text)] leading-none">{s.value}</div>
                  <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">{s.label}</div>
                </div>
              </div>
            ))}

            {/* Connection indicators */}
            <div className="flex items-center gap-3 pl-3 border-l border-[var(--armada-accent)]/50">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest hidden sm:block">
                  {activeCount} En ligne
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Radio className={`h-3 w-3 ${isConnected ? 'text-[var(--armada-primary)]' : 'text-[var(--armada-text)]/20'}`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-4 md:p-6 space-y-5">
        {agentsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--armada-text)]/30" />
          </div>
        ) : teamMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div
              className="w-14 h-14 rounded-full border border-[var(--armada-accent)] flex items-center justify-center"
              style={{ backgroundColor: 'var(--armada-surface)' }}
            >
              <Bot className="h-6 w-6 text-[var(--armada-text)]/30" />
            </div>
            <p className="text-sm text-[var(--armada-text)]/50">
              Aucun agent configuré — complétez l'onboarding pour déployer votre équipe
            </p>
            <Link
              href="/onboarding"
              className="px-5 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--armada-primary)' }}
            >
              Configurer mon équipe
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* ── Left: agents ── */}
            <div className="xl:col-span-2 space-y-5">

              {/* Le Major */}
              {major && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="relative rounded-2xl border border-[var(--armada-primary)]/30 overflow-hidden armada-card-elevated armada-border-glow"
                  style={{ backgroundColor: 'var(--armada-surface)' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl" style={{ backgroundColor: 'var(--armada-primary)' }} />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-4 sm:min-w-[180px]">
                      <div
                        className="flex items-center justify-center h-10 w-10 rounded-full border border-[var(--armada-primary)]/30 flex-shrink-0"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)' }}
                      >
                        <Shield className="h-4 w-4" style={{ color: 'var(--armada-primary)' }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-base text-[var(--armada-text)]">{major.name}</span>
                          {major.status === 'online' && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
                        </div>
                        <div className="text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--armada-primary)' }}>
                          {major.role}
                        </div>
                        <div className="text-[9px] font-mono text-[var(--armada-text)]/30">{major.designation}</div>
                      </div>
                    </div>

                    {/* Current task */}
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Activity className={`h-2.5 w-2.5 ${major.isRunning ? 'text-green-500' : ''}`} />
                        {major.isRunning ? 'En cours' : 'Dernière tâche'}
                      </div>
                      <p className="text-sm text-[var(--armada-text)]/70 truncate">{major.currentTask}</p>
                    </div>

                    {/* Stats */}
                    <div className="text-center sm:min-w-[60px]">
                      <div className="text-lg font-bold font-mono text-[var(--armada-text)] leading-none">{major.todayCount}</div>
                      <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-1">Tâches</div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => openChat(major.id)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-all hover:opacity-90"
                        style={{ backgroundColor: 'var(--armada-primary)' }}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Briefer
                      </button>
                      <Link
                        href={`/settings/agents/${major.id}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 text-xs font-medium transition-colors hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]"
                      >
                        <Settings className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Spécialistes */}
              {specialists.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-[0.25em]">
                      Spécialistes — {specialists.length} agents
                    </span>
                    <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
                  </div>

                  <motion.div
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {specialists.map((member) => (
                      <motion.div
                        key={member.id}
                        variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                        className="group relative rounded-2xl border border-[var(--armada-accent)]/50 overflow-hidden hover:border-[var(--armada-primary)]/30 armada-card transition-all duration-300"
                        style={{ backgroundColor: 'var(--armada-surface)' }}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-2xl"
                          style={{ backgroundColor: 'var(--armada-primary)' }} />

                        <div className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="flex items-center justify-center h-8 w-8 rounded-full border border-[var(--armada-accent)] flex-shrink-0"
                                style={{ backgroundColor: 'var(--armada-bg)' }}
                              >
                                <Bot className="h-3.5 w-3.5 text-[var(--armada-text)]/40" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-serif text-sm text-[var(--armada-text)] truncate">{member.name}</span>
                                  {member.status === 'online' && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                                  )}
                                </div>
                                <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-[0.12em] truncate">
                                  {member.role}
                                </div>
                              </div>
                            </div>
                            <span className="text-[9px] font-mono text-[var(--armada-text)]/25 flex-shrink-0 mt-0.5">{member.designation}</span>
                          </div>

                          {/* Stats */}
                          <div className="flex items-center gap-3 py-2.5 border-t border-b border-[var(--armada-accent)]/40">
                            <div>
                              <div className="text-sm font-bold font-mono text-[var(--armada-text)] leading-none">{member.todayCount}</div>
                              <div className="text-[8px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">Tâches</div>
                            </div>
                            <div>
                              <div className="text-sm font-bold font-mono text-[var(--armada-text)] leading-none">{member.timeSavedH}h</div>
                              <div className="text-[8px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">Économisé</div>
                            </div>
                            {member.lastAction && (
                              <div className="ml-auto text-right">
                                <div className="text-[9px] font-mono text-[var(--armada-text)]/50 truncate max-w-[90px]">
                                  {member.lastAction.text}
                                </div>
                                <div className="text-[8px] font-mono text-[var(--armada-text)]/30">{member.lastAction.time}</div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openChat(member.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full border text-xs font-medium transition-all hover:opacity-90"
                              style={{
                                borderColor: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)',
                                color: 'var(--armada-primary)',
                              }}
                            >
                              <MessageSquare className="h-3 w-3" />
                              Briefer
                            </button>
                            <Link
                              href={`/settings/agents/${member.id}`}
                              className="flex items-center justify-center w-8 h-7 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 text-xs transition-colors hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]"
                            >
                              <Settings className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </>
              )}
            </div>

            {/* ── Right: activity feed ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-[0.25em]">
                  Activité récente
                </span>
                <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
              </div>

              <div
                className="rounded-2xl border border-[var(--armada-accent)]/50 overflow-hidden"
                style={{ backgroundColor: 'var(--armada-surface)' }}
              >
                {recentOps.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Activity className="h-5 w-5 text-[var(--armada-text)]/20 mx-auto mb-2" />
                    <p className="text-xs text-[var(--armada-text)]/30 font-mono">Aucune activité récente</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--armada-accent)]/30">
                    {recentOps.map((op) => {
                      const agent = teamMembers.find(m => m.id === op.agentId);
                      const statusColor =
                        op.status === 'completed' ? 'bg-green-500' :
                        op.status === 'failed'    ? 'bg-red-400' :
                        op.status === 'in_progress' ? 'bg-yellow-400 animate-pulse' :
                        'bg-[var(--armada-text)]/20';
                      return (
                        <div key={op.id || op.operationId} className="flex items-start gap-3 px-4 py-3">
                          <div className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[var(--armada-text)]/80 truncate">
                              {friendlyActivityMessages[op.action]?.() || op.action}
                            </p>
                            <p className="text-[9px] font-mono text-[var(--armada-text)]/30 mt-0.5">
                              {agent ? agent.name : '—'} · {formatTime(op.startedAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-[var(--armada-accent)]/30 px-4 py-2.5">
                  <Link
                    href="/activity"
                    className="text-[10px] font-mono text-[var(--armada-text)]/40 hover:text-[var(--armada-primary)] transition-colors uppercase tracking-wider"
                  >
                    Voir tout le journal →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Workers / Daemons section ── */}
        {workersData && (
          <WorkersSection kairos={workersData.kairos} autoDream={workersData.autoDream} />
        )}
      </div>
    </div>
  );
}

// ── Workers helpers ────────────────────────────────────────────────────────────

function nextKairosTick(lastTick: string | null): string {
  if (!lastTick) return 'Prochaine occurrence';
  const next = new Date(lastTick).getTime() + 15 * 60 * 1000;
  const diff = next - Date.now();
  if (diff <= 0) return 'Imminente';
  const m = Math.ceil(diff / 60000);
  return `dans ~${m} min`;
}

function nextDreamRun(): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  const diff = next.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h === 0) return `dans ${m} min`;
  return `dans ${h}h${m > 0 ? ` ${m}min` : ''}`;
}

// ── Workers section component ──────────────────────────────────────────────────

function WorkersSection({ kairos, autoDream }: {
  kairos:    { enabled: boolean; lastTick: string | null };
  autoDream: { lastRun: string | null; recentLogs: Array<{ date: string; decisionsCount: number; factsCount: number; hasContradictions: boolean; summary: string | null; ranAt: string }> };
}) {
  const lastLog = autoDream.recentLogs[0] ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15 }}
      className="space-y-4"
    >
      {/* Section header */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-[0.25em]">
          Daemons système — 2 workers
        </span>
        <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* ── KAIROS card ── */}
        <div
          className="relative rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--armada-surface)',
            borderColor: kairos.enabled
              ? 'rgba(59,130,246,0.25)'
              : 'rgba(255,255,255,0.06)',
          }}
        >
          {/* Top accent bar */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: kairos.enabled ? 'linear-gradient(90deg, #3b82f6 0%, transparent 100%)' : 'transparent' }}
          />

          <div className="p-5 space-y-4">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center h-9 w-9 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.20)' }}
                >
                  <Eye className="h-4 w-4" style={{ color: '#3b82f6' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm text-[var(--armada-text)]">KAIROS</span>
                    {kairos.enabled && (
                      <span
                        className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}
                      >
                        <span className="h-1 w-1 rounded-full bg-green-500 animate-pulse inline-block" />
                        Actif
                      </span>
                    )}
                    {!kairos.enabled && (
                      <span
                        className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}
                      >
                        En pause
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] font-mono text-[var(--armada-text)]/35 uppercase tracking-widest mt-0.5">
                    Surveillance proactive
                  </p>
                </div>
              </div>
              <Link
                href="/settings"
                className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--armada-accent)] text-[var(--armada-text)]/30 hover:text-[var(--armada-text)]/60 transition-colors"
              >
                <Settings className="h-3 w-3" />
              </Link>
            </div>

            {/* Stats row */}
            <div
              className="grid grid-cols-2 gap-3 rounded-xl p-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
            >
              <div>
                <p className="text-[9px] font-mono text-[var(--armada-text)]/35 uppercase tracking-widest mb-1">
                  Dernière vérification
                </p>
                <p className="text-xs font-mono text-[var(--armada-text)]/70">
                  {kairos.lastTick ? formatTime(kairos.lastTick) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono text-[var(--armada-text)]/35 uppercase tracking-widest mb-1">
                  Prochaine
                </p>
                <p className="text-xs font-mono" style={{ color: kairos.enabled ? '#3b82f6' : 'rgba(255,255,255,0.3)' }}>
                  {kairos.enabled ? nextKairosTick(kairos.lastTick) : 'En pause'}
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-[11px] text-[var(--armada-text)]/40 leading-relaxed">
              Analyse les stocks et commandes toutes les 15 minutes. Alerte uniquement si quelque chose nécessite votre attention.
            </p>
          </div>
        </div>

        {/* ── AutoDream card ── */}
        <div
          className="relative rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--armada-surface)',
            borderColor: 'rgba(168,85,247,0.25)',
          }}
        >
          {/* Top accent bar */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, #a855f7 0%, transparent 100%)' }}
          />

          <div className="p-5 space-y-4">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center h-9 w-9 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.20)' }}
                >
                  <Moon className="h-4 w-4" style={{ color: '#a855f7' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm text-[var(--armada-text)]">AutoDream</span>
                    <span
                      className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(168,85,247,0.12)', color: '#a855f7' }}
                    >
                      <Sparkles className="h-2 w-2" />
                      Auto
                    </span>
                  </div>
                  <p className="text-[9px] font-mono text-[var(--armada-text)]/35 uppercase tracking-widest mt-0.5">
                    Consolidation mémoire — 03:00 UTC
                  </p>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div
              className="grid grid-cols-2 gap-3 rounded-xl p-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
            >
              <div>
                <p className="text-[9px] font-mono text-[var(--armada-text)]/35 uppercase tracking-widest mb-1">
                  Dernier cycle
                </p>
                <p className="text-xs font-mono text-[var(--armada-text)]/70">
                  {autoDream.lastRun ? formatTime(autoDream.lastRun) : 'Jamais exécuté'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono text-[var(--armada-text)]/35 uppercase tracking-widest mb-1">
                  Prochain cycle
                </p>
                <p className="text-xs font-mono" style={{ color: '#a855f7' }}>
                  {nextDreamRun()}
                </p>
              </div>
            </div>

            {/* Last dream log summary */}
            {lastLog ? (
              <div
                className="rounded-xl p-3 space-y-2"
                style={{ backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest">
                    Dernier rapport — {lastLog.date}
                  </span>
                  {lastLog.hasContradictions && (
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                      <span className="text-[9px] font-mono text-amber-400">Contradictions</span>
                    </div>
                  )}
                </div>

                {/* Counters */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" style={{ color: '#a855f7' }} />
                    <span className="text-xs font-mono text-[var(--armada-text)]/60">
                      {lastLog.decisionsCount} décision{lastLog.decisionsCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CircleDot className="h-3 w-3" style={{ color: '#a855f7' }} />
                    <span className="text-xs font-mono text-[var(--armada-text)]/60">
                      {lastLog.factsCount} fait{lastLog.factsCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Summary text */}
                {lastLog.summary && (
                  <p className="text-[11px] text-[var(--armada-text)]/50 leading-relaxed line-clamp-2">
                    {lastLog.summary}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--armada-text)]/35 leading-relaxed">
                Analyse les conversations des 7 derniers jours chaque nuit et consolide les décisions et faits clés en mémoire.
              </p>
            )}

            {/* Dream log history link */}
            {autoDream.recentLogs.length > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[9px] font-mono text-[var(--armada-text)]/25">
                  {autoDream.recentLogs.length} cycles enregistrés
                </span>
                <button className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider transition-colors hover:opacity-80" style={{ color: '#a855f7' }}>
                  Voir l'historique <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
