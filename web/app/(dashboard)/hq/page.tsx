'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import {
  MessageSquare, Activity, Bot, Settings, Shield, Loader2,
  Zap, Clock, TrendingUp, Radio, ChevronRight,
  AlertTriangle, CheckCircle2, Package, Users,
  BarChart2, Megaphone, Heart, Globe, Plus, X,
} from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── Department classification ────────────────────────────────────────────────

interface DeptConfig {
  label: string;
  color: string;
  Icon: any;
  designation: (i: number) => string;
}

const DEPT_CONFIGS: Record<string, DeptConfig> = {
  boutique:  { label: 'Boutique',         color: '#6366f1', Icon: Package,     designation: (i) => `SHP-0${i+1}` },
  content:   { label: 'Contenu & SEO',    color: '#10b981', Icon: Globe,       designation: (i) => `CNT-0${i+1}` },
  growth:    { label: 'Acquisition & SEO',color: '#8b5cf6', Icon: TrendingUp,  designation: (i) => `GRW-0${i+1}` },
  marketing: { label: 'Marketing & Ads',  color: '#f59e0b', Icon: Megaphone,   designation: (i) => `MKT-0${i+1}` },
  finance:   { label: 'Finance & Analytics',color: '#06b6d4', Icon: BarChart2, designation: (i) => `FIN-0${i+1}` },
  cx:        { label: 'CX & Fidélisation',color: '#ec4899', Icon: Heart,       designation: (i) => `CX-0${i+1}` },
  ops:       { label: 'Opérations',       color: '#94a3b8', Icon: Users,       designation: (i) => `OPS-0${i+1}` },
};

function getDept(type: string): string {
  const t = type.toLowerCase();
  if (['product', 'inventory', 'support'].includes(t)) return 'boutique';
  if (t.includes('content') || t === 'seo' || t.includes('seo') || t.includes('blog') || t.includes('writer') || t.includes('strateg')) return 'content';
  if (t.includes('growth') || t.includes('acquisition') || t.includes('hacker')) return 'growth';
  if (t.includes('marketing') || t.includes('email') || t.includes('klaviyo') || t.includes('ads') || t.includes('paid') || t.includes('campaign')) return 'marketing';
  if (t.includes('finance') || t.includes('cfo') || t.includes('analyt') || t.includes('data') || t.includes('reporting')) return 'finance';
  if (t.includes('cx') || t.includes('vip') || t.includes('retention') || t.includes('fidel') || t.includes('customer_success')) return 'cx';
  return 'ops';
}

// Role label — prefer DB personality split on " — ", fallback to type humanization
function getRoleLabel(agent: any): string {
  if (agent.personality) {
    const parts = agent.personality.split(' — ');
    return parts[parts.length - 1]?.trim() || parts[0]?.trim() || agent.type;
  }
  return agent.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// ─── Activity messages ────────────────────────────────────────────────────────

const friendlyActivityMessages: Record<string, string> = {
  product_list:           'Catalogue produits consulté',
  product_get:            'Fiche produit vérifiée',
  product_get_by_handle:  'Page produit trouvée par URL',
  product_create:         'Nouveau produit créé',
  product_update:         'Produit mis à jour',
  product_update_metafields: 'Métachamps produit mis à jour',
  inventory_get:          'Niveaux de stock consultés',
  inventory_update:       'Stock ajusté',
  inventory_low_stock:    'Ruptures de stock détectées',
  customer_list:          'Liste clients consultée',
  customer_get:           'Profil client vérifié',
  customer_update_tags:   'Clients organisés',
  order_get:              'Commande vérifiée',
  order_list:             'Dernières commandes consultées',
  collection_update_seo:  'SEO collection optimisé',
  article_create:         'Article publié',
  blog_create:            'Section blog créée',
  redirect_create:        'Redirection URL créée',
  navigation_get:         'Navigation inspectée',
  web_browse:             'Page web analysée',
  search_performance:     'Performances de recherche analysées',
  top_keywords:           'Mots-clés analysés',
  page_performance:       'Métriques SEO vérifiées',
  issues_report:          'Opportunités SEO identifiées',
  call_klaviyo_api:       'Klaviyo — action marketing',
  memory_write:           'Mémoire mise à jour',
  memory_read:            'Mémoire consultée',
  read_objectives:        'Objectifs stratégiques consultés',
  request_approval:       'Approbation demandée',
  dispatch_to_specialist: 'Mission dispatché',
  parallel_dispatch:      'Missions parallèles dispatché',
};

function friendlyAction(op: any): string {
  return friendlyActivityMessages[op.action] || op.action;
}

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const { isConnected } = useGateway();
  const { activeStoreId, activeStore } = useActiveStore();
  const { openChat } = useChatDrawer();
  const [deploying, setDeploying] = useState(false);

  const { data: agentsData, isLoading: agentsLoading, mutate: mutateAgents } = useSWR(
    activeStoreId ? `/api/agents?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: workersData, mutate: mutateWorkers } = useSWR(
    activeStoreId ? `/api/workers?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: opsData } = useSWR(
    activeStoreId ? `/api/operations?storeId=${activeStoreId}&limit=100` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const { data: deptData, mutate: mutateDepts } = useSWR(
    activeStoreId ? `/api/agents/provision-departments?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: metricsData, isLoading: metricsLoading } = useSWR(
    activeStoreId ? `/api/metrics/store?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 120000 }
  );

  const agents: any[]     = agentsData?.agents || [];
  const operations: any[] = opsData?.operations || [];
  const departments: any[] = deptData?.departments || [];
  // Departments with no coverage at all (not deployed AND not covered by an existing agent)
  const missingDepts = departments.filter((d: any) => !d.deployed && !d.coveredBy);

  // Stats
  const oneDayAgo    = Date.now() - 86400000;
  const todayOps     = operations.filter(op => new Date(op.startedAt).getTime() > oneDayAgo);
  const completedOps = operations.filter(op => op.status === 'completed');
  const failedOps    = operations.filter(op => op.status === 'failed');
  const totalTasks   = todayOps.filter(op => op.status === 'completed').length;

  const totalAgentDurationMs = todayOps
    .filter(op => op.status === 'completed' && op.duration)
    .reduce((sum: number, op: any) => sum + op.duration, 0);
  const timeSavedMs  = Math.max(0, totalTasks * 5 * 60 * 1000 - totalAgentDurationMs);
  const timeSaved    = Math.round(timeSavedMs / 3600000 * 10) / 10;
  const efficiency   = completedOps.length + failedOps.length > 0
    ? Math.round(completedOps.length / (completedOps.length + failedOps.length) * 100)
    : null;

  // Ecommerce KPIs (from the connected Shopify store)
  const m = metricsData?.metrics;
  const fmtMoney = (n: number, currency = 'EUR') => {
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency, maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${Math.round(n)} ${currency}`;
    }
  };
  const stockAlerts = m ? (m.outOfStock || 0) + (m.lowStock || 0) : 0;

  // Build enriched member objects
  const buildMember = (agent: any) => {
    const agentTodayOps = todayOps.filter(op => op.agentId === agent.id && op.status === 'completed');
    const agentDurationMs = agentTodayOps
      .filter((op: any) => op.duration)
      .reduce((sum: number, op: any) => sum + op.duration, 0);
    const agentTimeSavedH = Math.round(
      Math.max(0, agentTodayOps.length * 5 * 60 * 1000 - agentDurationMs) / 3600000 * 10
    ) / 10;
    const inProgressOp = operations.find(op => op.agentId === agent.id && op.status === 'in_progress');
    const lastOp       = operations.find(op => op.agentId === agent.id && op.status !== 'in_progress');

    return {
      id: agent.id,
      name: agent.name,
      role: getRoleLabel(agent),
      type: agent.type,
      dept: getDept(agent.type),
      model: [agent.modelProvider, agent.modelName].filter(Boolean).join('/'),
      status: agent.isOnline ? 'online' : 'offline',
      currentTask: inProgressOp
        ? friendlyAction(inProgressOp)
        : lastOp ? friendlyAction(lastOp) : 'En attente',
      isRunning: !!inProgressOp,
      todayCount: agentTodayOps.length,
      timeSavedH: agentTimeSavedH,
      lastAction: lastOp
        ? { text: friendlyAction(lastOp), time: formatTime(lastOp.startedAt) }
        : null,
    };
  };

  const allMembers = agents.map(buildMember);
  const major      = allMembers.find(m => m.type === 'major');
  const specialists = allMembers.filter(m => m.type !== 'major');
  const activeCount = allMembers.filter(m => m.status === 'online').length;

  // Group specialists by department
  const deptGroups = Object.keys(DEPT_CONFIGS)
    .map(deptKey => ({
      key: deptKey,
      config: DEPT_CONFIGS[deptKey],
      members: specialists
        .filter(m => m.dept === deptKey)
        .map((m, i) => ({ ...m, designation: DEPT_CONFIGS[deptKey].designation(i) })),
    }))
    .filter(g => g.members.length > 0);

  const recentOps = operations.slice(0, 8);

  // Deploy missing departments
  async function deployMissingDepts() {
    if (!activeStoreId) return;
    setDeploying(true);
    try {
      const res = await fetch('/api/agents/provision-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: activeStoreId }),
      });
      const data = await res.json();
      if (data.success) {
        await Promise.all([mutateAgents(), mutateDepts()]);
      }
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>

      {/* ── Header ── */}
      <div className="border-b border-[var(--armada-accent)]/50 px-4 md:px-6 py-4 md:py-5"
        style={{ backgroundColor: 'var(--armada-surface)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-serif tracking-tight text-xl md:text-2xl text-[var(--armada-text)]">
              Quartier Général
            </h1>
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
              {activeStore ? activeStore.storeName : 'ArmadaOS — Tableau de bord'}
            </p>
          </div>

          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            {[
              { label: 'CA 7 jours',    value: metricsLoading ? '—' : m ? fmtMoney(m.revenue7d, m.currency) : '—', icon: TrendingUp },
              { label: 'Commandes 7j',  value: metricsLoading ? '—' : m ? String(m.orders7d) : '—',                icon: Package },
              { label: 'Panier moyen',  value: metricsLoading ? '—' : m ? fmtMoney(m.aov7d, m.currency) : '—',     icon: BarChart2 },
              { label: 'Alertes stock', value: metricsLoading ? '—' : m ? String(stockAlerts) : '—',              icon: AlertTriangle },
              { label: 'Tâches / 24h',  value: agentsLoading ? '—' : String(totalTasks),                          icon: Zap },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <s.icon className="h-3.5 w-3.5 text-[var(--armada-text)]/30" />
                <div>
                  <div className="text-sm font-bold font-mono text-[var(--armada-text)] leading-none">{s.value}</div>
                  <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">{s.label}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pl-3 border-l border-[var(--armada-accent)]/50">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest hidden sm:block">
                  {activeCount} En ligne
                </span>
              </div>
              <Radio className={`h-3 w-3 ${isConnected ? 'text-[var(--armada-primary)]' : 'text-[var(--armada-text)]/20'}`} />
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
        ) : allMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <Bot className="h-8 w-8 text-[var(--armada-text)]/20" />
            <p className="text-sm text-[var(--armada-text)]/50">Aucun agent configuré</p>
            <Link href="/onboarding"
              className="px-5 py-2.5 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--armada-primary)' }}>
              Configurer mon équipe
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

            {/* ── Left: team ── */}
            <div className="xl:col-span-2 space-y-6">

              {/* Missing departments banner */}
              {missingDepts.length > 0 && (
                <div
                  className="rounded-2xl border p-3.5 flex items-center gap-3"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--armada-primary) 25%, transparent)',
                  }}
                >
                  <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--armada-primary)' }} />
                  <p className="text-xs text-[var(--armada-text)]/60 flex-1">
                    <span className="font-medium text-[var(--armada-text)]">{missingDepts.length} département(s) disponible(s) : </span>
                    {missingDepts.map((d: any) => d.name).join(', ')}
                  </p>
                  <button
                    onClick={deployMissingDepts}
                    disabled={deploying}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium flex-shrink-0 transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--armada-primary)' }}
                  >
                    {deploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Déployer
                  </button>
                </div>
              )}

              {/* ── The Major — Command ── */}
              {major && (
                <div>
                  <SectionDivider label="Commandement" badge="CMD-00" color="var(--armada-primary)" />
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative rounded-2xl border border-[var(--armada-primary)]/30 overflow-hidden mt-3"
                    style={{ backgroundColor: 'var(--armada-surface)' }}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl"
                      style={{ backgroundColor: 'var(--armada-primary)' }} />
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4">
                      <div className="flex items-center gap-4 sm:min-w-[200px]">
                        <div className="flex items-center justify-center h-10 w-10 rounded-full border border-[var(--armada-primary)]/30 flex-shrink-0"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)' }}>
                          <Shield className="h-4 w-4" style={{ color: 'var(--armada-primary)' }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-serif text-base text-[var(--armada-text)]">{major.name}</span>
                            {major.status === 'online' && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
                          </div>
                          <div className="text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--armada-primary)' }}>
                            Chef des Opérations
                          </div>
                          <div className="text-[9px] font-mono text-[var(--armada-text)]/30">CMD-00</div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 hidden sm:block">
                        <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <Activity className={`h-2.5 w-2.5 ${major.isRunning ? 'text-green-500' : ''}`} />
                          {major.isRunning ? 'En cours' : 'Dernière tâche'}
                        </div>
                        <p className="text-sm text-[var(--armada-text)]/70 truncate">{major.currentTask}</p>
                      </div>
                      <div className="text-center sm:min-w-[60px]">
                        <div className="text-lg font-bold font-mono text-[var(--armada-text)] leading-none">{major.todayCount}</div>
                        <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-1">Tâches</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openChat(major.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition hover:opacity-90"
                          style={{ backgroundColor: 'var(--armada-primary)' }}>
                          <MessageSquare className="h-3 w-3" /> Briefer
                        </button>
                        <Link href={`/settings/agents/${major.id}`}
                          className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 text-xs transition hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]">
                          <Settings className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* ── Department groups ── */}
              {deptGroups.map((group, gi) => (
                <div key={group.key}>
                  <SectionDivider
                    label={group.config.label}
                    badge={`${group.members.length} agent${group.members.length > 1 ? 's' : ''}`}
                    color={group.config.color}
                    Icon={group.config.Icon}
                  />
                  <motion.div
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: gi * 0.05 } } }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3"
                  >
                    {group.members.map((member) => (
                      <AgentCard
                        key={member.id}
                        member={member}
                        deptColor={group.config.color}
                        onChat={() => openChat(member.id)}
                      />
                    ))}
                  </motion.div>
                </div>
              ))}
            </div>

            {/* ── Right: activity feed ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-[0.25em]">
                  Activité récente
                </span>
                <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
              </div>

              <div className="rounded-2xl border border-[var(--armada-accent)]/50 overflow-hidden"
                style={{ backgroundColor: 'var(--armada-surface)' }}>
                {recentOps.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Activity className="h-5 w-5 text-[var(--armada-text)]/20 mx-auto mb-2" />
                    <p className="text-xs text-[var(--armada-text)]/30 font-mono">Aucune activité récente</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--armada-accent)]/30">
                    {recentOps.map((op) => {
                      const agent = allMembers.find(m => m.id === op.agentId);
                      const statusColor =
                        op.status === 'completed'   ? 'bg-green-500' :
                        op.status === 'failed'      ? 'bg-red-400' :
                        op.status === 'in_progress' ? 'bg-yellow-400 animate-pulse' :
                        'bg-[var(--armada-text)]/20';
                      return (
                        <div key={op.id || op.operationId} className="flex items-start gap-3 px-4 py-3">
                          <div className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[var(--armada-text)]/80 truncate">{friendlyAction(op)}</p>
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
                  <Link href="/activity"
                    className="text-[10px] font-mono text-[var(--armada-text)]/40 hover:text-[var(--armada-primary)] transition-colors uppercase tracking-wider">
                    Voir tout le journal →
                  </Link>
                </div>
              </div>

              {/* Quick links */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-[0.25em]">Actions</span>
                  <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
                </div>
                <Link href="/objectives"
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--armada-accent)]/50 hover:border-[var(--armada-primary)]/30 transition-all group"
                  style={{ backgroundColor: 'var(--armada-surface)' }}>
                  <span className="text-xs text-[var(--armada-text)]/60 group-hover:text-[var(--armada-text)]">Mission Control</span>
                  <ChevronRight className="w-3 h-3 text-[var(--armada-text)]/30" />
                </Link>
                <Link href="/settings/agents"
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--armada-accent)]/50 hover:border-[var(--armada-primary)]/30 transition-all group"
                  style={{ backgroundColor: 'var(--armada-surface)' }}>
                  <span className="text-xs text-[var(--armada-text)]/60 group-hover:text-[var(--armada-text)]">Gérer les agents</span>
                  <ChevronRight className="w-3 h-3 text-[var(--armada-text)]/30" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Daemons ── */}
        {workersData && activeStoreId && (
          <WorkersSection
            kairos={workersData.kairos}
            autoDream={workersData.autoDream}
            storeId={activeStoreId}
            onToggle={mutateWorkers}
          />
        )}
      </div>
    </div>
  );
}

// ─── SectionDivider ───────────────────────────────────────────────────────────

function SectionDivider({ label, badge, color, Icon }: { label: string; badge?: string; color: string; Icon?: any }) {
  return (
    <div className="flex items-center gap-3">
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />}
      <span className="text-[9px] font-mono uppercase tracking-[0.25em] flex-shrink-0" style={{ color }}>
        {label}
      </span>
      {badge && (
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}15`, color }}>
          {badge}
        </span>
      )}
      <div className="flex-1 h-px" style={{ backgroundColor: `${color}30` }} />
    </div>
  );
}

// ─── AgentCard ────────────────────────────────────────────────────────────────

function AgentCard({ member, deptColor, onChat }: { member: any; deptColor: string; onChat: () => void }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
      className="group relative rounded-2xl border overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: 'var(--armada-surface)',
        borderColor: 'color-mix(in srgb, var(--armada-accent) 50%, transparent)',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${deptColor}40`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--armada-accent) 50%, transparent)')}
    >
      <div className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-2xl"
        style={{ backgroundColor: deptColor }} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center h-8 w-8 rounded-full flex-shrink-0"
              style={{ backgroundColor: `${deptColor}15`, border: `1px solid ${deptColor}30` }}>
              <Bot className="h-3.5 w-3.5" style={{ color: deptColor }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-serif text-sm text-[var(--armada-text)] truncate">{member.name}</span>
                {member.status === 'online' && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />}
              </div>
              <div className="text-[9px] font-mono text-[var(--armada-text)]/40 uppercase tracking-[0.1em] truncate">
                {member.role}
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono flex-shrink-0 mt-0.5" style={{ color: deptColor, opacity: 0.6 }}>
            {member.designation}
          </span>
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
              <div className="text-[9px] font-mono text-[var(--armada-text)]/50 truncate max-w-[90px]">{member.lastAction.text}</div>
              <div className="text-[8px] font-mono text-[var(--armada-text)]/30">{member.lastAction.time}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={onChat}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full border text-xs font-medium transition-all hover:opacity-90"
            style={{ borderColor: `${deptColor}40`, color: deptColor }}>
            <MessageSquare className="h-3 w-3" /> Briefer
          </button>
          <Link href={`/settings/agents/${member.id}`}
            className="flex items-center justify-center w-8 h-7 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 text-xs transition hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]">
            <Settings className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </motion.div>
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

interface DreamLog {
  date: string;
  decisionsCount: number;
  factsCount: number;
  hasContradictions: boolean;
  summary: string | null;
  content: string | null;
  ranAt: string;
}

interface KairosState {
  enabled: boolean;
  lastTick: string | null;
  thresholds?: Record<string, any> | null;
  baseline?: Record<string, any> | null;
}

function WorkersSection({ kairos, autoDream, storeId, onToggle }: {
  kairos:    KairosState;
  autoDream: { enabled: boolean; lastRun: string | null; recentLogs: DreamLog[] };
  storeId:   string;
  onToggle:  () => void;
}) {
  const lastLog = autoDream.recentLogs[0] ?? null;
  const [openDaemon, setOpenDaemon] = useState<'kairos' | 'autoDream' | null>(null);

  async function toggleWorker(worker: 'kairos' | 'autoDream', enabled: boolean) {
    await fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, worker, enabled }),
    });
    onToggle();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-[0.25em]">Daemons système</span>
        <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* KAIROS */}
        <div className="rounded-2xl border border-[var(--armada-accent)]/50 p-4 space-y-3"
          style={{ backgroundColor: 'var(--armada-surface)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${kairos.enabled ? 'bg-green-500 animate-pulse' : 'bg-[var(--armada-text)]/20'}`} />
              <span className="text-xs font-mono font-medium text-[var(--armada-text)]">KAIROS</span>
              <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-wider">Surveillance</span>
            </div>
            <button onClick={() => toggleWorker('kairos', !kairos.enabled)}
              className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                kairos.enabled
                  ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                  : 'border-[var(--armada-accent)] text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70'
              }`}>
              {kairos.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className="text-[10px] font-mono text-[var(--armada-text)]/40">
            {kairos.enabled ? `Prochain scan : ${nextKairosTick(kairos.lastTick)}` : 'Surveillance désactivée'}
          </p>
          <MoreInfoButton onClick={() => setOpenDaemon('kairos')} />
        </div>

        {/* AutoDream */}
        <div className="rounded-2xl border border-[var(--armada-accent)]/50 p-4 space-y-3"
          style={{ backgroundColor: 'var(--armada-surface)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${autoDream.enabled ? 'bg-[var(--armada-primary)] animate-pulse' : 'bg-[var(--armada-text)]/20'}`} />
              <span className="text-xs font-mono font-medium text-[var(--armada-text)]">AutoDream</span>
              <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-wider">Mémoire + Plan</span>
            </div>
            <button onClick={() => toggleWorker('autoDream', !autoDream.enabled)}
              className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                autoDream.enabled
                  ? 'border-[var(--armada-primary)]/30 hover:bg-[var(--armada-primary)]/10'
                  : 'border-[var(--armada-accent)] text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70'
              }`}
              style={autoDream.enabled ? { color: 'var(--armada-primary)' } : {}}>
              {autoDream.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {lastLog ? (
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-[var(--armada-text)]/40">
                Dernier cycle : {formatTime(lastLog.ranAt)} — {lastLog.decisionsCount} décisions, {lastLog.factsCount} faits
                {lastLog.hasContradictions && ' ⚠️'}
              </p>
              {lastLog.summary && (
                <p className="text-[10px] text-[var(--armada-text)]/30 line-clamp-2">{lastLog.summary}</p>
              )}
            </div>
          ) : (
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40">
              {autoDream.enabled ? `Prochain : ${nextDreamRun()}` : 'Planification nocturne désactivée'}
            </p>
          )}
          <MoreInfoButton onClick={() => setOpenDaemon('autoDream')} />
        </div>
      </div>

      <DaemonModal
        open={openDaemon === 'kairos'}
        onClose={() => setOpenDaemon(null)}
        title="KAIROS"
        subtitle="Surveillance temps réel"
        accent="#22c55e"
      >
        <KairosDetails kairos={kairos} />
      </DaemonModal>

      <DaemonModal
        open={openDaemon === 'autoDream'}
        onClose={() => setOpenDaemon(null)}
        title="AutoDream"
        subtitle="Consolidation mémoire + planification"
        accent="var(--armada-primary)"
      >
        <AutoDreamDetails autoDream={autoDream} />
      </DaemonModal>
    </div>
  );
}

// ── Daemon detail modal ────────────────────────────────────────────────────────

function MoreInfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--armada-text)]/40 hover:text-[var(--armada-text)] transition-colors group/info"
    >
      Plus d&apos;infos
      <ChevronRight className="w-3 h-3 transition-transform group-hover/info:translate-x-0.5" />
    </button>
  );
}

function DaemonModal({ open, onClose, title, subtitle, accent, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Close on Escape and lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-[var(--armada-accent)]/60 shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--armada-surface)' }}
          >
            <div className="h-0.5 w-full flex-shrink-0" style={{ backgroundColor: accent, opacity: 0.6 }} />

            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--armada-accent)]/40 flex-shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-mono font-medium text-[var(--armada-text)]">{title}</div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--armada-text)]/40 mt-0.5">
                  {subtitle}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="flex items-center justify-center w-7 h-7 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-5 py-4 space-y-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-[var(--armada-accent)]/25 last:border-0">
      <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--armada-text)]/40 flex-shrink-0">
        {label}
      </span>
      <span className="text-xs font-mono text-[var(--armada-text)]/80 text-right break-words">{value}</span>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[var(--armada-text)]/30 flex-shrink-0">
          {title}
        </span>
        <div className="flex-1 h-px bg-[var(--armada-accent)]/40" />
      </div>
      {children}
    </div>
  );
}

function KairosDetails({ kairos }: { kairos: KairosState }) {
  const t = kairos.thresholds;
  const b = kairos.baseline;

  return (
    <>
      <p className="text-xs leading-relaxed text-[var(--armada-text)]/60">
        KAIROS scanne la boutique toutes les 15 minutes (stock, commandes non expédiées, retards de
        traitement) et vous alerte uniquement lorsqu&apos;une situation sort de l&apos;ordinaire. Il
        observe et alerte — il ne modifie jamais vos données.
      </p>

      <DetailBlock title="État">
        <DetailRow label="Statut" value={kairos.enabled ? 'Actif' : 'Désactivé'} />
        <DetailRow
          label="Dernier scan"
          value={kairos.lastTick
            ? `${formatTime(kairos.lastTick)} — ${new Date(kairos.lastTick).toLocaleString('fr-FR')}`
            : 'Jamais exécuté'}
        />
        <DetailRow
          label="Prochain scan"
          value={kairos.enabled ? nextKairosTick(kairos.lastTick) : '—'}
        />
      </DetailBlock>

      <DetailBlock title="Seuils d'alerte">
        {t ? (
          <>
            <DetailRow label="Stock bas" value={`≤ ${t.lowStockUnits} unités`} />
            <DetailRow label="Retard commande" value={`> ${t.orderDelayHours} h`} />
            <DetailRow label="Backlog commandes" value={`> ${t.openOrdersAlertCount} en attente`} />
          </>
        ) : (
          <p className="text-[11px] font-mono text-[var(--armada-text)]/30">
            Seuils par défaut (stock ≤ 5, retard &gt; 48 h, backlog &gt; 50).
          </p>
        )}
      </DetailBlock>

      <DetailBlock title="Baseline (moyenne mobile)">
        {b ? (
          <>
            <DetailRow label="Commandes non expédiées" value={Number(b.avgUnfulfilledOrders ?? 0).toFixed(1)} />
            <DetailRow label="Commandes en retard" value={Number(b.avgDelayedOrders ?? 0).toFixed(1)} />
            <DetailRow label="Variants stock bas" value={Number(b.avgLowStockCount ?? 0).toFixed(1)} />
            <DetailRow
              label="Échantillons"
              value={`${b.samplesCount ?? 0}${Number(b.samplesCount ?? 0) < 5 ? ' (en construction)' : ''}`}
            />
          </>
        ) : (
          <p className="text-[11px] font-mono text-[var(--armada-text)]/30">
            Pas encore de baseline — elle se construit au fil des scans.
          </p>
        )}
      </DetailBlock>
    </>
  );
}

function AutoDreamDetails({ autoDream }: {
  autoDream: { enabled: boolean; lastRun: string | null; recentLogs: DreamLog[] };
}) {
  const [selectedDate, setSelectedDate] = useState(autoDream.recentLogs[0]?.date ?? null);
  const selected = autoDream.recentLogs.find(l => l.date === selectedDate) ?? null;

  return (
    <>
      <p className="text-xs leading-relaxed text-[var(--armada-text)]/60">
        Chaque nuit à 3h UTC, AutoDream relit l&apos;activité de la journée, consolide la mémoire des
        agents (décisions, faits, contradictions) puis prépare le plan stratégique du lendemain.
      </p>

      <DetailBlock title="État">
        <DetailRow label="Statut" value={autoDream.enabled ? 'Actif' : 'Désactivé'} />
        <DetailRow
          label="Dernier cycle"
          value={autoDream.lastRun
            ? `${formatTime(autoDream.lastRun)} — ${new Date(autoDream.lastRun).toLocaleString('fr-FR')}`
            : 'Jamais exécuté'}
        />
        <DetailRow label="Prochain cycle" value={autoDream.enabled ? nextDreamRun() : '—'} />
      </DetailBlock>

      {autoDream.recentLogs.length === 0 ? (
        <DetailBlock title="Rapports">
          <p className="text-[11px] font-mono text-[var(--armada-text)]/30">
            Aucun rapport pour l&apos;instant — le premier arrivera après le prochain cycle nocturne.
          </p>
        </DetailBlock>
      ) : (
        <DetailBlock title={`Rapports (${autoDream.recentLogs.length} derniers)`}>
          {/* Date selector */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {autoDream.recentLogs.map(log => {
              const active = log.date === selectedDate;
              return (
                <button
                  key={log.date}
                  onClick={() => setSelectedDate(log.date)}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'border-[var(--armada-primary)]/40 text-[var(--armada-primary)] bg-[var(--armada-primary)]/10'
                      : 'border-[var(--armada-accent)] text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70'
                  }`}
                >
                  {log.date}{log.hasContradictions && ' ⚠️'}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="rounded-xl border border-[var(--armada-accent)]/40 p-4"
              style={{ backgroundColor: 'var(--armada-bg)' }}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-3 mb-3 border-b border-[var(--armada-accent)]/30">
                <span className="text-[10px] font-mono text-[var(--armada-text)]/40">
                  {selected.decisionsCount} décisions
                </span>
                <span className="text-[10px] font-mono text-[var(--armada-text)]/40">
                  {selected.factsCount} faits
                </span>
                {selected.hasContradictions && (
                  <span className="text-[10px] font-mono text-amber-400">Contradictions détectées</span>
                )}
                <span className="text-[10px] font-mono text-[var(--armada-text)]/25 ml-auto">
                  {formatTime(selected.ranAt)}
                </span>
              </div>
              {selected.content
                ? <MarkdownView source={selected.content} />
                : (
                  <p className="text-xs leading-relaxed text-[var(--armada-text)]/70 whitespace-pre-wrap">
                    {selected.summary || 'Rapport vide.'}
                  </p>
                )}
            </div>
          )}
        </DetailBlock>
      )}
    </>
  );
}

// Minimal renderer for the markdown the workers write (# / ## headings + "- " bullets)
function MarkdownView({ source }: { source: string }) {
  const lines = source.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('## ')) {
          return (
            <div key={i} className="text-[9px] font-mono uppercase tracking-[0.25em] text-[var(--armada-text)]/35 pt-2 first:pt-0">
              {trimmed.slice(3)}
            </div>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <div key={i} className="text-xs font-mono text-[var(--armada-text)]/50">
              {trimmed.slice(2)}
            </div>
          );
        }
        if (trimmed.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 text-xs leading-relaxed text-[var(--armada-text)]/70">
              <span className="text-[var(--armada-text)]/25 flex-shrink-0">•</span>
              <span>{trimmed.slice(2)}</span>
            </div>
          );
        }
        return (
          <p key={i} className="text-xs leading-relaxed text-[var(--armada-text)]/70">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
