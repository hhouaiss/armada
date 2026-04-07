'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2, Users } from 'lucide-react';
import Link from 'next/link';

export default function SkillEditorPage() {
  const params = useParams();
  const router = useRouter();
  const skillId = params.skillId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skill, setSkill] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    content: '',
    type: 'knowledge',
    icon: '📚',
  });

  useEffect(() => {
    loadSkill();
  }, [skillId]);

  const loadSkill = async () => {
    try {
      const res = await fetch(`/api/skills/${skillId}`);
      const data = await res.json();
      setSkill(data.skill);
      setFormData({
        name: data.skill.name,
        description: data.skill.description,
        content: data.skill.content,
        type: data.skill.type,
        icon: data.skill.icon || '📚',
      });
    } catch (error) {
      console.error('Failed to load skill:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        alert('Skill updated successfully!');
        loadSkill();
      }
    } catch (error) {
      console.error('Failed to save skill:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this skill? It will be removed from all agents.')) return;

    try {
      await fetch(`/api/skills/${skillId}`, { method: 'DELETE' });
      router.push('/skills');
    } catch (error) {
      console.error('Failed to delete skill:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Skill not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <Link
          href="/skills"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm uppercase tracking-wide">Back to Skills</span>
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="text-5xl">{formData.icon}</div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2 uppercase">{formData.name}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="uppercase tracking-wide">{formData.type}</span>
                <span>•</span>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{skill._count.agents} agent(s) using this skill</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              className="px-6 py-2 rounded border border-border text-foreground/80 hover:border-red-500/50 hover:text-red-400 transition-all uppercase tracking-wide flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 rounded bg-[#FF6B35] text-white hover:bg-[#FF6B35]/90 transition-colors uppercase tracking-wide flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Edit Form */}
        <div className="space-y-6">
          <div>
            <label className="text-sm text-muted-foreground uppercase tracking-wide mb-2 block">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-card border border-border rounded px-4 py-2 text-foreground focus:outline-none focus:border-[#FF6B35]"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground uppercase tracking-wide mb-2 block">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-card border border-border rounded px-4 py-2 text-foreground focus:outline-none focus:border-[#FF6B35]"
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground uppercase tracking-wide mb-2 block">
              Content (Markdown)
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full bg-card border border-border rounded px-4 py-2 text-foreground focus:outline-none focus:border-[#FF6B35] font-mono text-sm"
              rows={20}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground uppercase tracking-wide mb-2 block">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full bg-card border border-border rounded px-4 py-2 text-foreground focus:outline-none focus:border-[#FF6B35]"
              >
                <option value="knowledge">Knowledge</option>
                <option value="template">Template</option>
                <option value="guideline">Guideline</option>
                <option value="example">Example</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-muted-foreground uppercase tracking-wide mb-2 block">Icon</label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full bg-card border border-border rounded px-4 py-2 text-foreground focus:outline-none focus:border-[#FF6B35]"
                maxLength={2}
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-4">Preview</h3>
          <div className="prose prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-sm text-foreground/80">
              {formData.content}
            </div>
          </div>
        </div>
      </div>

      {/* Agents Using This Skill */}
      {skill.agents && skill.agents.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-4">Agents Using This Skill</h3>
          <div className="space-y-2">
            {skill.agents.map((agentSkill: any) => (
              <div
                key={agentSkill.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded"
              >
                <div>
                  <p className="text-foreground font-medium">{agentSkill.agent.name}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{agentSkill.agent.type}</p>
                </div>
                <Link
                  href={`/settings/agents/${agentSkill.agent.id}`}
                  className="text-xs text-[#FF6B35] hover:text-[#FF6B35]/80 uppercase tracking-wide"
                >
                  Configure →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
