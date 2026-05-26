'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Plus, ChevronDown, ChevronRight, Trash2,
  CheckCircle2, AlertCircle, Clock, Pause, Loader2,
  Calendar, Bot, Zap, Shield, Users,
  X, Check, TrendingUp, DollarSign, Megaphone, Heart,
  Sparkles, SendHorizonal, Package, Globe, BarChart2,
} from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  title: string;
  description?: string;
  ownerAgentId?: string;
  status: 'active' | 'completed' | 'blocked' | 'paused';
  createdAt: string;
}

interface Objective {
  id: string;
  title: string;
  description?: string;
  type: 'mission' | 'quarterly' | 'weekly' | 'onetime';
  priority: 1 | 2 | 3;
  status: 'backlog' | 'active' | 'completed' | 'archived' | 'blocked';
  dueDate?: string;
  notes?: string;
  projects: Project[];
  createdAt: string;
}

interface ApprovalRequest {
  id: string;
  agentName?: string;
  action: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
}

interface Department {
  type: string;
  name: string;
  designation: string;
  role: string;
  specialty: string;
  capabilities: string[];
  deployed: boolean;
  coveredBy?: string;
  coveredByName?: string;
}

interface PlanTask {
  agentType: string;
  agentName: string;
  agentPersonality?: string;
  task: string;
  rationale?: string;
  priority?: 'high' | 'medium' | 'low';
  estimatedDays?: number;
}

interface Plan {
  analysis: string;
  tasks: PlanTask[];
}

interface DispatchedAgent {
  agentId: string;
  agentName: string;
  agentType: string;
}

interface PendingPlan {
  objectiveId: string;
  objectiveTitle: string;
  plan: Plan;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const OBJECTIVE_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  mission:   { label: 'Mission',          icon: '🎯', color: 'var(--armada-primary)' },
  quarterly: { label: 'Objectif Q',       icon: '📊', color: '#6366f1' },
  weekly:    { label: 'Sprint semaine',   icon: '⚡', color: '#10b981' },
  onetime:   { label: 'Tâche unique',     icon: '✅', color: '#f59e0b' },
};

const PRIORITY_CONFIG: Record<number, { label: string; color: string; dot: string }> = {
  1: { label: 'Basse',   color: 'text-[var(--armada-text)]/40', dot: 'bg-[var(--armada-text)]/20' },
  2: { label: 'Moyenne', color: 'text-amber-400',               dot: 'bg-amber-400' },
  3: { label: 'Haute',   color: 'text-red-400',                 dot: 'bg-red-400' },
};

const STATUS_CONFIG: Record<string, { label: string; Icon: any; color: string }> = {
  backlog:   { label: 'En attente', Icon: Clock,         color: 'text-[var(--armada-text)]/30' },
  active:    { label: 'Actif',      Icon: Zap,           color: 'text-[var(--armada-primary)]' },
  completed: { label: 'Terminé',    Icon: CheckCircle2,  color: 'text-emerald-400' },
  blocked:   { label: 'Bloqué',     Icon: AlertCircle,   color: 'text-red-400' },
  archived:  { label: 'Archivé',    Icon: Clock,         color: 'text-[var(--armada-text)]/30' },
  paused:    { label: 'Pausé',      Icon: Pause,         color: 'text-amber-400' },
};

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: 'Faible',    color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  medium:   { label: 'Moyen',     color: 'text-amber-400',   bg: 'bg-amber-400/10' },
  high:     { label: 'Élevé',     color: 'text-red-400',     bg: 'bg-red-400/10' },
  critical: { label: 'Critique',  color: 'text-red-600',     bg: 'bg-red-600/10' },
};

// Dept icon/color for plan task cards
const AGENT_DEPT_ICON: Record<string, any> = {
  growth: TrendingUp, finance: BarChart2, ads: Megaphone, cx: Heart,
  content: Globe, seo: Globe, product: Package, inventory: Package,
  email: Megaphone, klaviyo: Megaphone,
};
const AGENT_DEPT_COLOR: Record<string, string> = {
  growth: '#8b5cf6', finance: '#06b6d4', ads: '#f59e0b', cx: '#ec4899',
  content: '#10b981', seo: '#10b981', product: '#6366f1', inventory: '#6366f1',
  email: '#f59e0b', klaviyo: '#f59e0b',
};

function agentDeptKey(type: string): string {
  const t = type.toLowerCase();
  for (const key of ['growth', 'finance', 'ads', 'cx', 'content', 'seo', 'product', 'inventory', 'email', 'klaviyo']) {
    if (t.includes(key)) return key;
  }
  return 'ops';
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ObjectivesPage() {
  const { activeStore } = useActiveStore();
  const storeId = activeStore?.id;

  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'objectives' | 'approvals' | 'departments'>('objectives');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [saving, setSaving] = useState(false);

  // ── Plan modal state ───────────────────────────────────────────────────────
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [dispatchedAgents, setDispatchedAgents] = useState<DispatchedAgent[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'quarterly',
    priority: 2,
    dueDate: '',
    notes: '',
  });

  useEffect(() => {
    if (storeId) loadAll();
  }, [storeId, statusFilter]);

  // Auto-refresh every 15s when agents are running (dispatched) to pick up project completions
  useEffect(() => {
    if (!storeId || dispatchedAgents.length === 0) return;
    const interval = setInterval(() => loadAll(), 8000);
    return () => clearInterval(interval);
  }, [storeId, dispatchedAgents.length]);

  async function loadAll() {
    setLoading(true);
    try {
      const [objRes, appRes, deptRes] = await Promise.all([
        fetch(`/api/objectives?storeId=${storeId}&status=${statusFilter}`),
        fetch(`/api/approvals?storeId=${storeId}&status=pending`),
        fetch(`/api/agents/provision-departments?storeId=${storeId}`),
      ]);
      const objData = await objRes.json();
      const appData = await appRes.json();
      const deptData = await deptRes.json();
      setObjectives(objData.objectives || []);
      setApprovals(appData.approvals || []);
      setDepartments(deptData.departments || []);
      const highPrioIds = (objData.objectives || [])
        .filter((o: Objective) => o.priority === 3 && o.status === 'active')
        .map((o: Objective) => o.id);
      setExpandedIds(new Set(highPrioIds));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function deployAllDepartments() {
    if (!storeId) return;
    setDeploying(true);
    try {
      const res = await fetch('/api/agents/provision-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (data.success) {
        await loadAll();
        alert(data.message + '\n\nRedémarrez le gateway pour activer les nouveaux agents.');
      }
    } finally {
      setDeploying(false);
    }
  }

  // ── Create + immediately analyze ──────────────────────────────────────────
  async function createObjective() {
    if (!form.title.trim() || !storeId) return;
    setSaving(true);
    setAnalyzeError(null);
    try {
      // 1. Save objective (as backlog)
      const res = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form, status: 'backlog' }),
      });
      if (!res.ok) return;
      const { objective: created } = await res.json();

      // 2. Close form, refresh list
      setForm({ title: '', description: '', type: 'quarterly', priority: 2, dueDate: '', notes: '' });
      setShowCreate(false);
      await loadAll();

      // 3. Open modal with spinner and start analysis
      setAnalyzing(true);
      setPendingPlan(null);

      const analyzeRes = await fetch(`/api/objectives/${created.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const analyzeData = await analyzeRes.json();

      if (!analyzeRes.ok || !analyzeData.plan) {
        setAnalyzeError(analyzeData.error ?? 'The Major n\'a pas pu analyser cet objectif.');
        return;
      }

      setPendingPlan({
        objectiveId: created.id,
        objectiveTitle: created.title ?? form.title,
        plan: analyzeData.plan,
      });
    } finally {
      setSaving(false);
      setAnalyzing(false);
    }
  }

  // ── Analyze an existing objective ─────────────────────────────────────────
  async function analyzeObjective(obj: Objective) {
    if (!storeId) return;
    setAnalyzeError(null);
    setAnalyzing(true);
    setPendingPlan(null);

    try {
      const res = await fetch(`/api/objectives/${obj.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();

      if (!res.ok || !data.plan) {
        setAnalyzeError(data.error ?? 'Erreur lors de l\'analyse.');
        setAnalyzing(false);
        return;
      }

      setPendingPlan({
        objectiveId: obj.id,
        objectiveTitle: obj.title,
        plan: data.plan,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Confirm and dispatch plan ─────────────────────────────────────────────
  async function confirmPlan() {
    if (!pendingPlan || !storeId) return;
    setConfirming(true);
    setDispatchedAgents([]);
    try {
      const res = await fetch(`/api/objectives/${pendingPlan.objectiveId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, tasks: pendingPlan.plan.tasks }),
      });
      const data = await res.json();

      // Show "agents working" state before closing the modal
      if (data.agents?.length > 0) {
        setDispatchedAgents(data.agents);
        // Auto-dismiss after 6s so user can click on agent links
        setTimeout(() => {
          setPendingPlan(null);
          setDispatchedAgents([]);
        }, 8000);
      } else {
        setPendingPlan(null);
      }
      await loadAll();
    } finally {
      setConfirming(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch('/api/objectives', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    await loadAll();
  }

  async function deleteObjective(id: string) {
    if (!confirm('Supprimer cet objectif et tous ses projets ?')) return;
    await fetch(`/api/objectives?id=${id}`, { method: 'DELETE' });
    await loadAll();
  }

  async function decideApproval(id: string, decision: 'approved' | 'rejected') {
    await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, decision }),
    });
    await loadAll();
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  // Show plan modal when analyzing, plan is ready, or agents were dispatched
  const showPlanModal = analyzing || !!pendingPlan || !!analyzeError || dispatchedAgents.length > 0;

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
    >
      {/* ── Plan Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPlanModal && (
          <PlanModal
            analyzing={analyzing}
            plan={pendingPlan}
            error={analyzeError}
            confirming={confirming}
            dispatchedAgents={dispatchedAgents}
            onConfirm={confirmPlan}
            onDismiss={() => {
              setPendingPlan(null);
              setAnalyzeError(null);
              setDispatchedAgents([]);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="border-b border-[var(--armada-accent)]/50 pb-5 flex items-start justify-between">
        <div>
          <h1 className="font-serif tracking-tight text-2xl text-[var(--armada-text)]">
            Mission Control
          </h1>
          <p className="text-xs text-[var(--armada-text)]/40 mt-1">
            Pilotez vos objectifs stratégiques — The Major les lit et dispatche l'équipe
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: 'var(--armada-primary)' }}
        >
          <Plus className="w-4 h-4" />
          Nouvel objectif
        </button>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-4 border-b border-[var(--armada-accent)]/30">
        {(['objectives', 'approvals', 'departments'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab
                ? 'border-b-2 text-[var(--armada-text)]'
                : 'text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70'
            }`}
            style={activeTab === tab ? { borderColor: 'var(--armada-primary)' } : {}}
          >
            {tab === 'objectives' ? (
              <><Target className="w-3.5 h-3.5" /> Objectifs ({objectives.length})</>
            ) : tab === 'approvals' ? (
              <>
                <Shield className="w-3.5 h-3.5" /> Approbations
                {pendingApprovals.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold text-white bg-red-500">
                    {pendingApprovals.length}
                  </span>
                )}
              </>
            ) : (
              <>
                <Users className="w-3.5 h-3.5" /> Départements
                {departments.filter((d) => !d.deployed && !d.coveredBy).length > 0 && (
                  <span
                    className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: 'var(--armada-primary)' }}
                  >
                    {departments.filter((d) => !d.deployed && !d.coveredBy).length}
                  </span>
                )}
              </>
            )}
          </button>
        ))}

        {activeTab === 'objectives' && (
          <div className="ml-auto pb-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs rounded-lg px-3 py-1.5 border"
              style={{
                backgroundColor: 'var(--armada-card)',
                borderColor: 'var(--armada-accent)',
                color: 'var(--armada-text)',
              }}
            >
              <option value="active">Actifs seulement</option>
              <option value="all">Tous</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Create form ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border p-5 space-y-4"
            style={{ backgroundColor: 'var(--armada-card)', borderColor: 'var(--armada-accent)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--armada-text)]">Nouvel objectif</h2>
                <span className="text-xs text-[var(--armada-text)]/30">
                  — The Major analysera et proposera un plan d'action
                </span>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                placeholder="Titre de l'objectif (ex: Augmenter les ventes de 30% ce trimestre)"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && createObjective()}
                className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none"
                style={{
                  backgroundColor: 'var(--armada-bg)',
                  borderColor: 'var(--armada-accent)',
                  color: 'var(--armada-text)',
                }}
              />
              <textarea
                placeholder="Description détaillée (optionnel) — aide The Major à comprendre le contexte"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none resize-none"
                style={{
                  backgroundColor: 'var(--armada-bg)',
                  borderColor: 'var(--armada-accent)',
                  color: 'var(--armada-text)',
                }}
              />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-[var(--armada-text)]/40 mb-1 block">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: 'var(--armada-bg)',
                      borderColor: 'var(--armada-accent)',
                      color: 'var(--armada-text)',
                    }}
                  >
                    {Object.entries(OBJECTIVE_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--armada-text)]/40 mb-1 block">Priorité</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: 'var(--armada-bg)',
                      borderColor: 'var(--armada-accent)',
                      color: 'var(--armada-text)',
                    }}
                  >
                    <option value={1}>Basse</option>
                    <option value={2}>Moyenne</option>
                    <option value={3}>Haute</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--armada-text)]/40 mb-1 block">Échéance</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: 'var(--armada-bg)',
                      borderColor: 'var(--armada-accent)',
                      color: 'var(--armada-text)',
                    }}
                  />
                </div>
              </div>
              <textarea
                placeholder="Notes pour The Major (optionnel) — instructions spécifiques ou contraintes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none resize-none"
                style={{
                  backgroundColor: 'var(--armada-bg)',
                  borderColor: 'var(--armada-accent)',
                  color: 'var(--armada-text)',
                }}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={createObjective}
                disabled={saving || !form.title.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-medium disabled:opacity-40 transition-all hover:opacity-90"
                style={{ backgroundColor: 'var(--armada-primary)' }}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {saving ? 'The Major analyse...' : 'Créer & Analyser avec The Major'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-5 py-2 rounded-full text-sm border hover:border-[var(--armada-text)]/40 transition-all"
                style={{ borderColor: 'var(--armada-accent)', color: 'var(--armada-text)' }}
              >
                Annuler
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--armada-text)]/30" />
        </div>
      )}

      {/* ── Objectives Tab ──────────────────────────────────────────── */}
      {!loading && activeTab === 'objectives' && (
        <div className="space-y-3">
          {objectives.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <Target className="w-10 h-10 mx-auto text-[var(--armada-text)]/20" />
              <p className="text-[var(--armada-text)]/40 text-sm">
                Aucun objectif {statusFilter === 'active' ? 'actif' : ''}.
              </p>
              <p className="text-[var(--armada-text)]/30 text-xs max-w-sm mx-auto">
                Créez votre premier objectif — The Major le décompose en tâches
                et dispatche l'équipe automatiquement.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mx-auto flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm"
                style={{ backgroundColor: 'var(--armada-primary)' }}
              >
                <Plus className="w-4 h-4" /> Créer un objectif
              </button>
            </div>
          )}

          {objectives.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              expanded={expandedIds.has(obj.id)}
              onToggle={() => toggleExpand(obj.id)}
              onStatusChange={(s) => updateStatus(obj.id, s)}
              onDelete={() => deleteObjective(obj.id)}
              onAnalyze={() => analyzeObjective(obj)}
            />
          ))}
        </div>
      )}

      {/* ── Approvals Tab ───────────────────────────────────────────── */}
      {!loading && activeTab === 'approvals' && (
        <div className="space-y-3">
          {pendingApprovals.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <Shield className="w-10 h-10 mx-auto text-[var(--armada-text)]/20" />
              <p className="text-[var(--armada-text)]/40 text-sm">
                Aucune approbation en attente.
              </p>
              <p className="text-[var(--armada-text)]/30 text-xs max-w-sm mx-auto">
                Lorsqu'un agent demande l'autorisation pour une action sensible,
                elle apparaîtra ici et vous serez notifié par Telegram.
              </p>
            </div>
          )}

          {pendingApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onDecide={(d) => decideApproval(approval.id, d)}
            />
          ))}
        </div>
      )}

      {/* ── Departments Tab ──────────────────────────────────────────── */}
      {!loading && activeTab === 'departments' && (
        <div className="space-y-5">
          <div
            className="rounded-2xl border p-4 flex items-start gap-3"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, transparent)',
              borderColor: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)',
            }}
          >
            <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--armada-primary)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--armada-text)] mb-0.5">
                Départements stratégiques
              </p>
              <p className="text-xs text-[var(--armada-text)]/50 leading-relaxed">
                Déployez les agents manquants pour couvrir toutes les fonctions business.
                Les agents existants couvrant déjà un département sont mis à jour automatiquement.
              </p>
            </div>
            {departments.some((d) => !d.deployed && !d.coveredBy) && (
              <button
                onClick={deployAllDepartments}
                disabled={deploying}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-xs font-medium flex-shrink-0 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--armada-primary)' }}
              >
                {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Tout déployer
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {departments.map((dept) => (
              <DepartmentCard key={dept.type} dept={dept} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PlanModal ────────────────────────────────────────────────────────────────

function PlanModal({
  analyzing,
  plan,
  error,
  confirming,
  dispatchedAgents,
  onConfirm,
  onDismiss,
}: {
  analyzing: boolean;
  plan: PendingPlan | null;
  error: string | null;
  confirming: boolean;
  dispatchedAgents: DispatchedAgent[];
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const isDispatched = dispatchedAgents.length > 0 && !plan;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl rounded-2xl border overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--armada-card)', borderColor: 'var(--armada-accent)' }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--armada-accent)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: isDispatched ? 'rgba(16,185,129,0.15)' : 'color-mix(in srgb, var(--armada-primary) 15%, transparent)' }}
            >
              {isDispatched
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : <Bot className="w-4 h-4" style={{ color: 'var(--armada-primary)' }} />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--armada-text)]">
                {isDispatched ? 'Équipe déployée — tâches en cours' : 'The Major — Plan d\'action'}
              </p>
              {plan && (
                <p className="text-xs text-[var(--armada-text)]/40 truncate max-w-xs">{plan.objectiveTitle}</p>
              )}
              {isDispatched && (
                <p className="text-xs text-emerald-400/70">
                  Les agents travaillent • Résultats visibles dans leurs chats
                </p>
              )}
            </div>
          </div>
          {!analyzing && (
            <button
              onClick={onDismiss}
              className="text-[var(--armada-text)]/30 hover:text-[var(--armada-text)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[65vh] overflow-y-auto space-y-4">
          {/* Dispatched state — agents are now working */}
          {isDispatched && (
            <div className="space-y-4">
              <div
                className="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-3"
              >
                <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-400">
                    {dispatchedAgents.length} agent{dispatchedAgents.length > 1 ? 's' : ''} en cours d'exécution
                  </p>
                  <p className="text-xs text-[var(--armada-text)]/40 mt-0.5 leading-relaxed">
                    Chaque agent analyse et exécute sa tâche maintenant. Les résultats apparaissent
                    dans leurs conversations au fil des secondes.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--armada-text)]/30 uppercase tracking-wider">
                  Accéder aux conversations
                </p>
                {dispatchedAgents.map((a) => {
                  const deptKey = agentDeptKey(a.agentType);
                  const Icon = AGENT_DEPT_ICON[deptKey] ?? Bot;
                  const color = AGENT_DEPT_COLOR[deptKey] ?? 'var(--armada-primary)';
                  return (
                    <a
                      key={a.agentId}
                      href={`/hq?agent=${a.agentId}`}
                      onClick={onDismiss}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 border transition-all hover:bg-white/[0.03] group"
                      style={{ backgroundColor: 'var(--armada-bg)', borderColor: `${color}25` }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}15` }}
                      >
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--armada-text)]">{a.agentName}</p>
                        <p className="text-xs text-[var(--armada-text)]/30 flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          En train de travailler…
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--armada-text)]/20 group-hover:text-[var(--armada-text)]/50 transition-colors" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Analyzing state */}
          {analyzing && !plan && !error && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)' }}
                >
                  <Sparkles className="w-6 h-6" style={{ color: 'var(--armada-primary)' }} />
                </div>
                <Loader2
                  className="w-16 h-16 animate-spin absolute -inset-2"
                  style={{ color: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)' }}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--armada-text)]">The Major analyse l'objectif…</p>
                <p className="text-xs text-[var(--armada-text)]/40 mt-1">
                  Identification des agents et création du plan de tâches
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="rounded-xl p-4 border border-red-500/20 bg-red-500/5 space-y-2">
              <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Erreur d'analyse
              </p>
              <p className="text-xs text-red-400/70">{error}</p>
              <p className="text-xs text-[var(--armada-text)]/30">
                Vérifiez qu'une clé API est configurée dans Paramètres → Modèles.
              </p>
            </div>
          )}

          {/* Plan */}
          {plan && (
            <>
              {/* Analysis text */}
              <div
                className="rounded-xl p-4 border-l-2 text-sm text-[var(--armada-text)]/70 leading-relaxed"
                style={{
                  backgroundColor: 'var(--armada-bg)',
                  borderLeftColor: 'var(--armada-primary)',
                }}
              >
                {plan.plan.analysis}
              </div>

              {/* Task cards */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-[var(--armada-text)]/30 uppercase tracking-wider">
                  {plan.plan.tasks.length} tâche{plan.plan.tasks.length > 1 ? 's' : ''} à dispatcher
                </p>

                {plan.plan.tasks.map((task, i) => {
                  const deptKey = agentDeptKey(task.agentType);
                  const Icon = AGENT_DEPT_ICON[deptKey] ?? Bot;
                  const color = AGENT_DEPT_COLOR[deptKey] ?? 'var(--armada-primary)';
                  const roleLabel = task.agentPersonality?.split(' — ')[0] ?? task.agentType;

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="rounded-xl border p-4 space-y-2"
                      style={{
                        backgroundColor: 'var(--armada-bg)',
                        borderColor: `${color}30`,
                        borderLeftWidth: '3px',
                        borderLeftColor: color,
                      }}
                    >
                      {/* Agent info */}
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${color}15` }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--armada-text)]">
                              {task.agentName}
                            </span>
                            {task.priority && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{
                                  backgroundColor: task.priority === 'high' ? 'rgba(239,68,68,0.1)' : task.priority === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
                                  color: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#6366f1',
                                }}
                              >
                                {task.priority === 'high' ? 'Priorité haute' : task.priority === 'medium' ? 'Moyen' : 'Faible'}
                              </span>
                            )}
                            {task.estimatedDays && (
                              <span className="text-[10px] text-[var(--armada-text)]/30 ml-auto">
                                ~{task.estimatedDays}j
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--armada-text)]/40 truncate">{roleLabel}</p>
                        </div>
                      </div>

                      {/* Task description */}
                      <p className="text-xs text-[var(--armada-text)]/70 leading-relaxed pl-9">
                        {task.task}
                      </p>

                      {/* Rationale */}
                      {task.rationale && (
                        <p className="text-[10px] text-[var(--armada-text)]/30 leading-relaxed pl-9 italic">
                          {task.rationale}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!analyzing && (
          <div
            className="flex items-center justify-between px-5 py-4 border-t"
            style={{ borderColor: 'var(--armada-accent)' }}
          >
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded-full text-sm border hover:border-[var(--armada-text)]/40 transition-all"
              style={{ borderColor: 'var(--armada-accent)', color: 'var(--armada-text)' }}
            >
              {isDispatched ? 'Fermer' : plan ? 'Plus tard' : 'Fermer'}
            </button>

            {plan && !isDispatched && (
              <button
                onClick={onConfirm}
                disabled={confirming}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-medium disabled:opacity-50 transition-all hover:opacity-90"
                style={{ backgroundColor: 'var(--armada-primary)' }}
              >
                {confirming ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Lancement en cours…</>
                ) : (
                  <><SendHorizonal className="w-4 h-4" /> Lancer {plan.plan.tasks.length} tâche{plan.plan.tasks.length > 1 ? 's' : ''}</>
                )}
              </button>
            )}

            {isDispatched && (
              <span className="text-xs text-[var(--armada-text)]/30">
                Fermeture automatique dans quelques secondes…
              </span>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── ObjectiveCard ────────────────────────────────────────────────────────────

function ObjectiveCard({
  objective,
  expanded,
  onToggle,
  onStatusChange,
  onDelete,
  onAnalyze,
}: {
  objective: Objective;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (s: string) => void;
  onDelete: () => void;
  onAnalyze: () => void;
}) {
  const typeConfig = OBJECTIVE_TYPES[objective.type] ?? OBJECTIVE_TYPES.onetime;
  const priority = PRIORITY_CONFIG[objective.priority] ?? PRIORITY_CONFIG[2];
  const status = STATUS_CONFIG[objective.status] ?? STATUS_CONFIG.active;
  const StatusIcon = status.Icon;

  const activeProjects = objective.projects.filter((p) => p.status === 'active');
  const completedProjects = objective.projects.filter((p) => p.status === 'completed');
  const isBacklog = objective.status === 'backlog';

  return (
    <motion.div
      layout
      className="rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--armada-card)',
        borderColor: isBacklog ? 'color-mix(in srgb, var(--armada-primary) 20%, var(--armada-accent))' : 'var(--armada-accent)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priority.dot}`} />

        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{ backgroundColor: `${typeConfig.color}18`, color: typeConfig.color }}
        >
          {typeConfig.icon} {typeConfig.label}
        </span>

        <span className="text-sm font-medium text-[var(--armada-text)] flex-1 min-w-0 truncate">
          {objective.title}
        </span>

        <span className={`text-xs flex items-center gap-1 flex-shrink-0 ${status.color}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>

        {objective.projects.length > 0 && (
          <span className="text-xs text-[var(--armada-text)]/30 flex-shrink-0">
            {completedProjects.length}/{objective.projects.length} projets
          </span>
        )}

        {objective.dueDate && (
          <span className="text-xs text-[var(--armada-text)]/30 flex items-center gap-1 flex-shrink-0">
            <Calendar className="w-3 h-3" />
            {new Date(objective.dueDate).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--armada-text)]/30 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--armada-text)]/30 flex-shrink-0" />
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 space-y-4 border-t"
              style={{ borderColor: 'var(--armada-accent)' }}
            >
              {objective.description && (
                <p className="text-sm text-[var(--armada-text)]/60 pt-4 leading-relaxed">
                  {objective.description}
                </p>
              )}

              {objective.notes && (
                <div
                  className="rounded-xl p-3 text-xs text-[var(--armada-text)]/50 leading-relaxed"
                  style={{ backgroundColor: 'var(--armada-bg)' }}
                >
                  <span className="font-medium text-[var(--armada-text)]/30 block mb-1">Notes pour The Major</span>
                  {objective.notes}
                </div>
              )}

              {/* Projects or empty state */}
              {objective.projects.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--armada-text)]/30 uppercase tracking-wider">
                    Projets dispatché
                  </p>
                  {objective.projects.map((project) => (
                    <ProjectRow key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ backgroundColor: 'var(--armada-bg)' }}
                >
                  <div className="flex items-center gap-2 text-xs text-[var(--armada-text)]/40">
                    <Bot className="w-3.5 h-3.5" />
                    <span>Aucun projet dispatché — lancez The Major pour planifier</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: 'var(--armada-primary)' }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Analyser avec The Major
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1 flex-wrap">
                {isBacklog && (
                  <button
                    onClick={() => onStatusChange('active')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors"
                    style={{ borderColor: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)', color: 'var(--armada-primary)' }}
                  >
                    <Zap className="w-3 h-3" /> Activer
                  </button>
                )}
                {objective.status === 'active' && (
                  <button
                    onClick={() => onStatusChange('completed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Marquer terminé
                  </button>
                )}
                {!isBacklog && objective.status !== 'active' && (
                  <button
                    onClick={() => onStatusChange('active')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors"
                    style={{ borderColor: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)', color: 'var(--armada-primary)' }}
                  >
                    <Zap className="w-3 h-3" /> Réactiver
                  </button>
                )}
                <button
                  onClick={() => onStatusChange('archived')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-[var(--armada-accent)] text-[var(--armada-text)]/30 hover:text-[var(--armada-text)]/60 transition-colors"
                >
                  <Clock className="w-3 h-3" /> Archiver
                </button>
                <button
                  onClick={onDelete}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── ProjectRow ───────────────────────────────────────────────────────────────

function ProjectRow({ project }: { project: Project }) {
  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.active;
  const StatusIcon = status.Icon;

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: 'var(--armada-bg)' }}
    >
      <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${status.color}`} />
      <span className="text-xs text-[var(--armada-text)]/70 flex-1 min-w-0">{project.title}</span>
      {project.ownerAgentId && (
        <span className="text-xs text-[var(--armada-text)]/30 flex items-center gap-1 flex-shrink-0">
          <Bot className="w-3 h-3" />
          {project.ownerAgentId.split(':').pop()}
        </span>
      )}
    </div>
  );
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: ApprovalRequest;
  onDecide: (d: 'approved' | 'rejected') => void;
}) {
  const risk = RISK_CONFIG[approval.riskLevel] ?? RISK_CONFIG.medium;
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null);

  async function decide(d: 'approved' | 'rejected') {
    setDeciding(d);
    await onDecide(d);
    setDeciding(null);
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border p-4 space-y-3"
      style={{ backgroundColor: 'var(--armada-card)', borderColor: 'var(--armada-accent)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 flex-shrink-0 text-[var(--armada-text)]/40" />
          <span className="text-sm font-medium text-[var(--armada-text)] truncate">
            {approval.action.replace(/_/g, ' ')}
          </span>
          {approval.agentName && (
            <span className="text-xs text-[var(--armada-text)]/30 flex-shrink-0">
              par {approval.agentName}
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${risk.color} ${risk.bg}`}>
          {risk.label}
        </span>
      </div>

      <p className="text-sm text-[var(--armada-text)]/60 leading-relaxed">
        {approval.description}
      </p>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => decide('approved')}
          disabled={!!deciding}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
        >
          {deciding === 'approved' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Approuver
        </button>
        <button
          onClick={() => decide('rejected')}
          disabled={!!deciding}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {deciding === 'rejected' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          Refuser
        </button>
        <span className="ml-auto text-xs text-[var(--armada-text)]/20">
          {new Date(approval.createdAt).toLocaleString('fr-FR', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
          })}
        </span>
      </div>
    </motion.div>
  );
}

// ─── DepartmentCard ───────────────────────────────────────────────────────────

const DEPT_ICONS: Record<string, any> = {
  growth:  TrendingUp,
  finance: DollarSign,
  ads:     Megaphone,
  cx:      Heart,
};

const DEPT_COLORS: Record<string, string> = {
  growth:  '#6366f1',
  finance: '#10b981',
  ads:     '#f59e0b',
  cx:      '#ec4899',
};

function DepartmentCard({ dept }: { dept: Department }) {
  const Icon = DEPT_ICONS[dept.type] ?? Bot;
  const color = DEPT_COLORS[dept.type] ?? 'var(--armada-primary)';

  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{
        backgroundColor: 'var(--armada-card)',
        borderColor: dept.deployed ? `${color}40` : 'var(--armada-accent)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--armada-text)]">{dept.name}</span>
            <span className="text-xs text-[var(--armada-text)]/30 font-mono">{dept.designation}</span>
          </div>
          <p className="text-xs text-[var(--armada-text)]/50">{dept.role}</p>
        </div>
        {dept.deployed ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1 flex-shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            {dept.coveredBy ? `Couvert par ${dept.coveredByName ?? dept.coveredBy}` : 'Déployé'}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--armada-text)]/5 text-[var(--armada-text)]/30 flex-shrink-0">
            Non déployé
          </span>
        )}
      </div>

      <p className="text-xs text-[var(--armada-text)]/50 leading-relaxed">{dept.specialty}</p>

      <div className="flex flex-wrap gap-1.5">
        {dept.capabilities.map((cap) => (
          <span
            key={cap}
            className="text-[10px] px-2 py-0.5 rounded-full font-mono"
            style={{ backgroundColor: `${color}10`, color }}
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}
