'use client';

import { motion } from 'framer-motion';
import useSWR from 'swr';
import { MessageSquare, Activity, Bot, Settings, Shield, Loader2 } from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const agentPersonalities: Record<string, { name: string; role: string; currentTask: string; designation: string }> = {
  product:   { name: 'Sarah',     role: 'Spécialiste Produit',    currentTask: 'Gestion du catalogue',               designation: 'SPEC-01' },
  inventory: { name: 'Marcus',    role: 'Gestionnaire Inventaire', currentTask: 'Surveillance des stocks',            designation: 'SPEC-02' },
  support:   { name: 'Emma',      role: 'Succès Client',           currentTask: 'Organisation des données clients',   designation: 'SPEC-03' },
  content:   { name: 'Alex',      role: 'Créateur de Contenu',     currentTask: 'Rédaction et publication',           designation: 'SPEC-04' },
  seo:       { name: 'Olivia',    role: 'SEO Stratège',            currentTask: 'Optimisation du référencement',      designation: 'SPEC-05' },
  major:     { name: 'Le Major',  role: 'Chef des Opérations',     currentTask: 'Coordination de l\'escouade',        designation: 'CMD-00' },
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

export default function CommandCenterPage() {
  const { isConnected } = useGateway();
  const { activeStoreId, activeStore } = useActiveStore();

  const { data: agentsData, isLoading: agentsLoading } = useSWR(
    activeStoreId ? `/api/agents?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: opsData } = useSWR(
    activeStoreId ? `/api/operations?storeId=${activeStoreId}&limit=100` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const agents: any[] = agentsData?.agents || [];
  const operations: any[] = opsData?.operations || [];

  const oneDayAgo = Date.now() - 86400000;
  const todayOps = operations.filter(op => new Date(op.startedAt).getTime() > oneDayAgo);
  const completedOps = operations.filter(op => op.status === 'completed');
  const failedOps   = operations.filter(op => op.status === 'failed');
  const totalTasks  = todayOps.filter(op => op.status === 'completed').length;

  // Time saved = estimated human time (5 min/task) minus actual agent processing time
  const totalAgentDurationMs = todayOps
    .filter(op => op.status === 'completed' && op.duration)
    .reduce((sum: number, op: any) => sum + op.duration, 0);
  const humanTimeMs = totalTasks * 5 * 60 * 1000;
  const timeSavedMs = Math.max(0, humanTimeMs - totalAgentDurationMs);
  const timeSaved   = Math.round(timeSavedMs / 3600000 * 10) / 10;

  const efficiency  = completedOps.length + failedOps.length > 0
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
    const lastOp = operations.find(op => op.agentId === agent.id && op.status !== 'in_progress');
    const currentTask = inProgressOp
      ? (friendlyActivityMessages[inProgressOp.action]?.() || inProgressOp.action)
      : lastOp
        ? (friendlyActivityMessages[lastOp.action]?.() || lastOp.action)
        : p.currentTask;
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
        ? { text: friendlyActivityMessages[lastOp.action]?.() || lastOp.action, time: formatTime(lastOp.startedAt) }
        : null,
    };
  };

  const teamMembers = agents.map(buildMember);
  const major       = teamMembers.find(m => m.type === 'major');
  const specialists = teamMembers.filter(m => m.type !== 'major');
  const activeCount = teamMembers.filter(m => m.status === 'online').length;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
    >

      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-6 py-5 flex items-center justify-between"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div>
          <h1 className="font-serif tracking-tight text-2xl text-[var(--armada-text)]">
            Quartier Général {/* i18n: Command Center */}
          </h1>
          <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
            {activeStore ? `${activeStore.storeName} — ${activeStore.shopifyDomain}` : 'Aucun magasin connecté'}
          </p>
        </div>

        <div className="flex items-center gap-6">
          {/* Stats */}
          {[
            { label: 'Tâches / 24h', value: agentsLoading ? '—' : String(totalTasks) }, // i18n: Tasks / 24h
            { label: 'Temps gagné',  value: agentsLoading ? '—' : `${timeSaved}h` },     // i18n: Time Saved
            { label: 'Efficacité',   value: agentsLoading ? '—' : efficiency !== null ? `${efficiency}%` : '—' }, // i18n: Efficiency
          ].map(s => (
            <div key={s.label} className="text-right">
              <div className="text-base font-bold font-mono text-[var(--armada-text)] leading-none">{s.value}</div>
              <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}

          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-[var(--armada-accent)]/50">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest">
                {activeCount} En ligne {/* i18n: Online */}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-[var(--armada-primary)] animate-pulse' : 'bg-[var(--armada-text)]/20'}`} />
              <span className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest">
                {isConnected ? 'Passerelle' : 'Hors ligne'} {/* i18n: Gateway / Offline */}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="p-6 space-y-5">
        {agentsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--armada-text)]/30" />
          </div>
        ) : !activeStore ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-14 h-14 rounded-full border border-[var(--armada-accent)] flex items-center justify-center"
              style={{ backgroundColor: 'var(--armada-surface)' }}>
              <Bot className="h-6 w-6 text-[var(--armada-text)]/30" />
            </div>
            <p className="text-sm text-[var(--armada-text)]/50">
              Connectez un magasin pour activer votre squad {/* i18n: Connect a store to activate your squad */}
            </p>
            <Link
              href="/stores"
              className="px-5 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--armada-primary)' }}
            >
              Connecter un magasin {/* i18n: Connect Store */}
            </Link>
          </div>
        ) : teamMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <div className="w-14 h-14 rounded-full border border-[var(--armada-accent)] flex items-center justify-center"
              style={{ backgroundColor: 'var(--armada-surface)' }}>
              <Bot className="h-6 w-6 text-[var(--armada-text)]/30" />
            </div>
            <p className="text-sm text-[var(--armada-text)]/50">
              Aucun agent configuré pour ce magasin {/* i18n: No agents configured for this store */}
            </p>
          </div>
        ) : (
          <>
            {/* ── Le Major ──────────────────────────────────────── */}
            {major && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="relative rounded-2xl border border-[var(--armada-primary)]/30 overflow-hidden armada-card-elevated armada-border-glow"
                style={{ backgroundColor: 'var(--armada-surface)' }}
              >
                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl" style={{ backgroundColor: 'var(--armada-primary)' }} />

                <div className="flex items-center gap-6 px-6 py-5">
                  {/* Avatar */}
                  <div
                    className="flex items-center justify-center h-11 w-11 rounded-full border border-[var(--armada-primary)]/30 flex-shrink-0"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)' }}
                  >
                    <Shield className="h-5 w-5" style={{ color: 'var(--armada-primary)' }} />
                  </div>

                  {/* Name + role */}
                  <div className="min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-lg text-[var(--armada-text)]">{major.name}</span>
                      {major.status === 'online' && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] mt-0.5" style={{ color: 'var(--armada-primary)' }}>
                      {major.role}
                    </div>
                    <div className="text-[9px] font-mono text-[var(--armada-text)]/30 mt-0.5">{major.designation} · {major.model}</div>
                  </div>

                  <div className="h-8 w-px bg-[var(--armada-accent)]/50 flex-shrink-0" />

                  {/* Current task */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Activity className={`h-2.5 w-2.5 ${major.isRunning ? 'text-green-500' : ''}`} />
                      {major.isRunning ? 'En cours' : 'Dernière tâche'} {/* i18n: Current / Last task */}
                    </div>
                    <p className="text-sm text-[var(--armada-text)]/70 truncate">{major.currentTask}</p>
                  </div>

                  <div className="h-8 w-px bg-[var(--armada-accent)]/50 flex-shrink-0" />

                  {/* Task count */}
                  <div className="text-center min-w-[60px]">
                    <div className="text-xl font-bold font-mono text-[var(--armada-text)] leading-none">{major.todayCount}</div>
                    <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-1">
                      Tâches / 24h {/* i18n: Tasks / 24h */}
                    </div>
                  </div>

                  <div className="h-8 w-px bg-[var(--armada-accent)]/50 flex-shrink-0" />

                  {/* Last action */}
                  <div className="min-w-[180px]">
                    <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-1">
                      Dernière action {/* i18n: Last Operation */}
                    </div>
                    {major.lastAction ? (
                      <>
                        <p className="text-xs text-[var(--armada-text)]/70 truncate">{major.lastAction.text}</p>
                        <p className="text-[9px] font-mono text-[var(--armada-text)]/30 mt-0.5">{major.lastAction.time}</p>
                      </>
                    ) : (
                      <p className="text-xs text-[var(--armada-text)]/30">—</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                    <Link
                      href={`/chat/${major.id}`}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-all hover:opacity-90 armada-btn-primary"
                      style={{ backgroundColor: 'var(--armada-primary)' }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      Briefer {/* i18n: Brief */}
                    </Link>
                    <Link
                      href={`/settings/agents/${major.id}`}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 text-xs font-medium transition-colors hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]"
                    >
                      <Settings className="h-3 w-3" />
                      Configurer {/* i18n: Config */}
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Spécialistes ──────────────────────────────────── */}
            {specialists.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-[0.25em]">
                    Spécialistes — {specialists.length} agents {/* i18n: Specialists */}
                  </span>
                  <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
                </div>

                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                  className="grid grid-cols-3 gap-4"
                >
                  {specialists.map((member) => (
                    <motion.div
                      key={member.id}
                      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                      className="group relative rounded-2xl border border-[var(--armada-accent)]/50 overflow-hidden hover:border-[var(--armada-primary)]/30 armada-card transition-all duration-300"
                      style={{ backgroundColor: 'var(--armada-surface)' }}
                    >
                      {/* Left hover accent */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-2xl"
                        style={{ backgroundColor: 'var(--armada-primary)' }}
                      />

                      <div className="p-5 space-y-4">
                        {/* Agent header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="flex items-center justify-center h-9 w-9 rounded-full border border-[var(--armada-accent)] flex-shrink-0"
                              style={{ backgroundColor: 'var(--armada-bg)' }}
                            >
                              <Bot className="h-4 w-4 text-[var(--armada-text)]/40" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-serif text-base text-[var(--armada-text)] truncate">{member.name}</span>
                                {member.status === 'online' && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                                )}
                              </div>
                              <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-[0.15em] truncate">
                                {member.role}
                              </div>
                            </div>
                          </div>
                          <span className="text-[9px] font-mono text-[var(--armada-text)]/25 flex-shrink-0 mt-0.5">{member.designation}</span>
                        </div>

                        {/* Model */}
                        {member.model && (
                          <div className="text-[9px] font-mono text-[var(--armada-text)]/30 truncate">{member.model}</div>
                        )}

                        {/* Stats row */}
                        <div className="flex items-center gap-4 py-3 border-t border-b border-[var(--armada-accent)]/40">
                          <div>
                            <div className="text-sm font-bold font-mono text-[var(--armada-text)] leading-none">{member.todayCount}</div>
                            <div className="text-[8px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
                              Tâches {/* i18n: Tasks */}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-bold font-mono text-[var(--armada-text)] leading-none">
                              {member.timeSavedH}h
                            </div>
                            <div className="text-[8px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
                              Économisé {/* i18n: Saved */}
                            </div>
                          </div>
                          <div className="ml-auto">
                            {member.lastAction ? (
                              <div className="text-right">
                                <div className="text-[9px] font-mono text-[var(--armada-text)]/50 truncate max-w-[100px]">
                                  {member.lastAction.text}
                                </div>
                                <div className="text-[8px] font-mono text-[var(--armada-text)]/30">{member.lastAction.time}</div>
                              </div>
                            ) : (
                              <div className="text-[9px] font-mono text-[var(--armada-text)]/30">
                                Aucune activité {/* i18n: No activity */}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/chat/${member.id}`}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full border text-xs font-medium transition-all hover:opacity-90 armada-btn-primary"
                            style={{
                              borderColor: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)',
                              color: 'var(--armada-primary)',
                            }}
                          >
                            <MessageSquare className="h-3 w-3" />
                            Briefer {/* i18n: Chat */}
                          </Link>
                          <Link
                            href={`/settings/agents/${member.id}`}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 text-xs font-medium transition-colors hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]"
                          >
                            <Settings className="h-3 w-3" />
                            Config
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
