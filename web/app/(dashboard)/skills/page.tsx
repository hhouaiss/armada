'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Book, Sparkles, Trash2, Edit, Users, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const SKILL_TYPES: Record<string, { label: string }> = {
  knowledge:  { label: 'Connaissance' },  // i18n: Knowledge
  template:   { label: 'Modèle' },        // i18n: Template
  guideline:  { label: 'Directive' },     // i18n: Guideline
  example:    { label: 'Exemple' },       // i18n: Example
};

export default function SkillsPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => { loadSkills(); }, []);

  const loadSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (skillId: string) => {
    if (!confirm('Supprimer cette capacité ? Elle sera retirée de tous les agents.')) return; // i18n: Are you sure? This will remove the skill from all agents.
    try {
      await fetch(`/api/skills/${skillId}`, { method: 'DELETE' });
      loadSkills();
    } catch (error) {
      console.error('Failed to delete skill:', error);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-5" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>

      {/* ── Header ── */}
      <div className="border-b border-[var(--armada-accent)]/50 pb-5 flex items-start justify-between">
        <div>
          <h1 className="font-serif tracking-tight text-2xl text-[var(--armada-text)]">
            Capacités {/* i18n: Agent Skills */}
          </h1>
          <p className="text-xs text-[var(--armada-text)]/40 mt-1">
            Entraînez vos agents avec des connaissances persistantes {/* i18n: Teach your agents persistent knowledge */}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 armada-btn-primary"
          style={{ backgroundColor: 'var(--armada-primary)' }}
        >
          <Plus className="w-4 h-4" />
          Nouvelle capacité {/* i18n: Create Skill */}
        </button>
      </div>

      {/* ── Info box ── */}
      <div
        className="rounded-2xl border border-[var(--armada-primary)]/20 p-4 flex items-start gap-3"
        style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 5%, transparent)' }}
      >
        <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--armada-primary)' }} />
        <div>
          <p className="text-sm font-medium text-[var(--armada-text)] mb-1">
            Qu'est-ce que les Capacités ? {/* i18n: What are Skills? */}
          </p>
          <p className="text-xs text-[var(--armada-text)]/60 leading-relaxed">
            Les capacités sont des manuels d'entraînement pour vos agents. Ajoutez des directives de ton de marque,
            des modèles d'emails, des connaissances produit ou des patterns de communication.
            Vos agents les mémoriseront et les utiliseront automatiquement.
          </p>
        </div>
      </div>

      {/* ── Example cards (empty state) ── */}
      {skills.length === 0 && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: '✉️', name: 'Modèles d\'emails fournisseurs', desc: 'Modèles standard pour communiquer avec les fournisseurs' },
            { icon: '🎨', name: 'Guide Ton de Marque',           desc: 'Le ton, le style et les directives de communication de votre marque' },
            { icon: '📦', name: 'Connaissance Produits',          desc: 'Informations sur vos produits, catégories et fonctionnalités' },
          ].map((ex) => (
            <button
              key={ex.name}
              onClick={() => setShowCreateForm(true)}
              className="group rounded-2xl border-2 border-dashed border-[var(--armada-accent)] p-6 text-left hover:border-[var(--armada-primary)]/40 hover:bg-[var(--armada-surface)] transition-all"
            >
              <div className="text-3xl mb-3">{ex.icon}</div>
              <h3 className="text-sm font-medium text-[var(--armada-text)] mb-1.5 group-hover:text-[var(--armada-primary)] transition-colors">
                {ex.name}
              </h3>
              <p className="text-xs text-[var(--armada-text)]/40">{ex.desc}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Skills grid ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--armada-primary)' }} />
          <p className="text-xs text-[var(--armada-text)]/40">Chargement…</p> {/* i18n: Loading skills... */}
        </div>
      ) : skills.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onDelete={() => handleDelete(skill.id)}
              onEdit={() => router.push(`/skills/${skill.id}`)}
            />
          ))}
        </motion.div>
      ) : (
        <div
          className="rounded-2xl border border-[var(--armada-accent)]/50 p-16 text-center"
          style={{ backgroundColor: 'var(--armada-surface)' }}
        >
          <Book className="w-12 h-12 mx-auto mb-4 text-[var(--armada-text)]/20" />
          <h3 className="font-serif text-xl text-[var(--armada-text)] mb-2">
            Aucune capacité {/* i18n: No Skills Yet */}
          </h3>
          <p className="text-sm text-[var(--armada-text)]/40 mb-6 max-w-sm mx-auto">
            Créez votre première capacité pour commencer à entraîner vos agents {/* i18n: Create your first skill to start training your agents */}
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-2.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 armada-btn-primary"
            style={{ backgroundColor: 'var(--armada-primary)' }}
          >
            Créer ma première capacité {/* i18n: Create First Skill */}
          </button>
        </div>
      )}

      {/* ── Modal ── */}
      {showCreateForm && (
        <CreateSkillModal
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); loadSkills(); }}
        />
      )}
    </div>
  );
}

function SkillCard({ skill, onDelete, onEdit }: any) {
  const typeInfo = SKILL_TYPES[skill.type] || SKILL_TYPES.knowledge;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[var(--armada-accent)]/50 p-5 armada-card hover:border-[var(--armada-primary)]/30 transition-all duration-200 group"
      style={{ backgroundColor: 'var(--armada-surface)' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-2xl flex-shrink-0">{skill.icon || '📚'}</div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-[var(--armada-text)] truncate">{skill.name}</h3>
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40 mt-0.5 uppercase tracking-widest">
              {typeInfo.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-full hover:bg-[var(--armada-surface-hover)] transition-colors"
          >
            <Edit className="w-3.5 h-3.5 text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-[var(--armada-text)]/40 hover:text-red-500" />
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--armada-text)]/60 mb-4 line-clamp-2">{skill.description}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--armada-text)]/40">
          <Users className="w-3 h-3" />
          <span>{skill._count.agents} agent(s)</span>
        </div>
        <button
          onClick={onEdit}
          className="text-[10px] font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--armada-primary)' }}
        >
          Modifier → {/* i18n: Edit → */}
        </button>
      </div>
    </motion.div>
  );
}

function CreateSkillModal({ onClose, onCreated }: any) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    content: '',
    type: 'knowledge',
    category: '',
    icon: '📚',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        onCreated();
      } else {
        const error = await res.json();
        alert(error.error || 'Erreur lors de la création'); // i18n: Failed to create skill
      }
    } catch {
      alert('Erreur lors de la création'); // i18n: Failed to create skill
    } finally {
      setSaving(false);
    }
  };

  const inputClass = `w-full rounded-xl border border-[var(--armada-accent)]/60 px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-2 focus:ring-[var(--armada-primary)]/10 transition-colors`;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-6 z-50 backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-2xl border border-[var(--armada-accent)]/50 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto armada-card-elevated"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <h2 className="font-serif tracking-tight text-xl text-[var(--armada-text)] mb-5">
          Nouvelle Capacité {/* i18n: Create New Skill */}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-2 block">
              Nom {/* i18n: Name */}
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              className={inputClass}
              style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
              placeholder="modeles-email-fournisseurs"
            />
            <p className="text-[10px] font-mono text-[var(--armada-text)]/30 mt-1">
              Minuscules, chiffres et tirets uniquement {/* i18n: Lowercase letters, numbers, and hyphens only */}
            </p>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-2 block">
              Description {/* i18n: Description */}
            </label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={inputClass}
              style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
              rows={2}
              placeholder="Ce que cette capacité apporte et quand les agents doivent l'utiliser"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-2 block">
              Contenu {/* i18n: Content */}
            </label>
            <textarea
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={`${inputClass} font-mono text-xs`}
              style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
              rows={10}
              placeholder="# Instructions&#10;&#10;## Exemples&#10;Exemple 1...&#10;&#10;## Directives&#10;- Toujours...&#10;- Jamais..."
            />
            <p className="text-[10px] font-mono text-[var(--armada-text)]/30 mt-1">
              Supporte le format Markdown {/* i18n: Supports Markdown formatting */}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-2 block">
                Type {/* i18n: Type */}
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className={inputClass}
                style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
              >
                <option value="knowledge">Connaissance</option> {/* i18n: Knowledge */}
                <option value="template">Modèle</option>          {/* i18n: Template */}
                <option value="guideline">Directive</option>      {/* i18n: Guideline */}
                <option value="example">Exemple</option>          {/* i18n: Example */}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mb-2 block">
                Icône {/* i18n: Icon */}
              </label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className={inputClass}
                style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
                placeholder="📚"
                maxLength={2}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-full border border-[var(--armada-accent)] text-[var(--armada-text)]/50 text-sm font-medium hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-all"
            >
              Annuler {/* i18n: Cancel */}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50 armada-btn-primary"
              style={{ backgroundColor: 'var(--armada-primary)' }}
            >
              {saving ? 'Création en cours…' : 'Créer la capacité'} {/* i18n: Creating... / Create Skill */}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
