'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Plus, ChevronDown, ChevronRight, Trash2,
  CheckCircle2, AlertCircle, Clock, Pause, Loader2,
  Calendar, Bot, Zap, Shield, Users,
  X, Check, TrendingUp, DollarSign, Megaphone, Heart,
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
  status: 'active' | 'completed' | 'archived' | 'blocked';
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
  active:    { label: 'Actif',    Icon: Zap,           color: 'text-[var(--armada-primary)]' },
  completed: { label: 'Terminé', Icon: CheckCircle2,  color: 'text-emerald-400' },
  blocked:   { label: 'Bloqué',  Icon: AlertCircle,   color: 'text-red-400' },
  archived:  { label: 'Archivé', Icon: Clock,         color: 'text-[var(--armada-text)]/30' },
  paused:    { label: 'Pausé',   Icon: Pause,         color: 'text-amber-400' },
};

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: 'Faible',    color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  medium:   { label: 'Moyen',    color: 'text-amber-400',   bg: 'bg-amber-400/10' },
  high:     { label: 'Élevé',    color: 'text-red-400',     bg: 'bg-red-400/10' },
  critical: { label: 'Critique', color: 'text-red-600',     bg: 'bg-red-600/10' },
};

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

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'quarterly',
    priority: 2,
    dueDate: '',
    notes: '',
  });

  useEffect(() => {
    if (storeId) {
      loadAll();
    }
  }, [storeId, statusFilter]);

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
      // Auto-expand high-priority active ones
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

  async function createObjective() {
    if (!form.title.trim() || !storeId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      });
      if (res.ok) {
        setForm({ title: '', description: '', type: 'quarterly', priority: 2, dueDate: '', notes: '' });
        setShowCreate(false);
        await loadAll();
      }
    } finally {
      setSaving(false);
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

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
    >
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
                {departments.filter((d) => !d.deployed).length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'var(--armada-primary)' }}>
                    {departments.filter((d) => !d.deployed).length}
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
              <h2 className="text-sm font-semibold text-[var(--armada-text)]">Nouvel objectif</h2>
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
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Créer l'objectif
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
                Créez votre premier objectif — The Major le lira à chaque session
                et dispatche l'équipe pour l'atteindre.
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
          {/* Info banner */}
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
                Nouveaux départements stratégiques
              </p>
              <p className="text-xs text-[var(--armada-text)]/50 leading-relaxed">
                Déployez les 4 nouveaux départements pour couvrir toutes les fonctions business.
                Après déploiement, redémarrez le gateway pour activer les agents.
              </p>
            </div>
            {departments.some((d) => !d.deployed) && (
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

          {/* Department cards */}
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

// ─── ObjectiveCard ────────────────────────────────────────────────────────────

function ObjectiveCard({
  objective,
  expanded,
  onToggle,
  onStatusChange,
  onDelete,
}: {
  objective: Objective;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (s: string) => void;
  onDelete: () => void;
}) {
  const typeConfig = OBJECTIVE_TYPES[objective.type] ?? OBJECTIVE_TYPES.onetime;
  const priority = PRIORITY_CONFIG[objective.priority] ?? PRIORITY_CONFIG[2];
  const status = STATUS_CONFIG[objective.status] ?? STATUS_CONFIG.active;
  const StatusIcon = status.Icon;

  const activeProjects = objective.projects.filter((p) => p.status === 'active');
  const completedProjects = objective.projects.filter((p) => p.status === 'completed');

  return (
    <motion.div
      layout
      className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: 'var(--armada-card)', borderColor: 'var(--armada-accent)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        {/* Priority dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priority.dot}`} />

        {/* Type badge */}
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{
            backgroundColor: `${typeConfig.color}18`,
            color: typeConfig.color,
          }}
        >
          {typeConfig.icon} {typeConfig.label}
        </span>

        {/* Title */}
        <span className="text-sm font-medium text-[var(--armada-text)] flex-1 min-w-0 truncate">
          {objective.title}
        </span>

        {/* Status */}
        <span className={`text-xs flex items-center gap-1 flex-shrink-0 ${status.color}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>

        {/* Projects count */}
        {objective.projects.length > 0 && (
          <span className="text-xs text-[var(--armada-text)]/30 flex-shrink-0">
            {completedProjects.length}/{objective.projects.length} projets
          </span>
        )}

        {/* Due date */}
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
              {/* Description */}
              {objective.description && (
                <p className="text-sm text-[var(--armada-text)]/60 pt-4 leading-relaxed">
                  {objective.description}
                </p>
              )}

              {/* Notes */}
              {objective.notes && (
                <div
                  className="rounded-xl p-3 text-xs text-[var(--armada-text)]/50 leading-relaxed"
                  style={{ backgroundColor: 'var(--armada-bg)' }}
                >
                  <span className="font-medium text-[var(--armada-text)]/30 block mb-1">Notes pour The Major</span>
                  {objective.notes}
                </div>
              )}

              {/* Projects */}
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
                  className="rounded-xl p-3 text-center text-xs text-[var(--armada-text)]/30"
                  style={{ backgroundColor: 'var(--armada-bg)' }}
                >
                  <Bot className="w-4 h-4 mx-auto mb-1 opacity-40" />
                  The Major créera des projets pour atteindre cet objectif
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {objective.status === 'active' && (
                  <button
                    onClick={() => onStatusChange('completed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Marquer terminé
                  </button>
                )}
                {objective.status !== 'active' && (
                  <button
                    onClick={() => onStatusChange('active')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-[var(--armada-primary)]/30 hover:bg-[var(--armada-primary)]/10 transition-colors"
                    style={{ color: 'var(--armada-primary)' }}
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
            <CheckCircle2 className="w-3 h-3" /> Déployé
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
