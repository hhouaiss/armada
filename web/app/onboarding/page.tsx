'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Shield, Bot, Check, ChevronLeft, ShoppingBag, Briefcase,
  Code2, UtensilsCrossed, User, Home, Heart, GraduationCap,
  Sparkles, Loader2, ArrowRight, Wrench, Building2, Pen,
  Target, Zap, BarChart2, Mail, Users, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BusinessForm {
  name: string;
  type: string;
  description: string;
  teamSize: string;
}

interface GeneratedAgent {
  name: string;
  role: string;
  designation: string;
  description: string;
  capabilities: string[];
  tone: string;
  personality: string;
  // editable by user
  editedName?: string;
  editedRole?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { id: 'ecommerce',  label: 'E-commerce',       icon: ShoppingBag },
  { id: 'agency',     label: 'Agence',            icon: Briefcase },
  { id: 'saas',       label: 'SaaS / Tech',       icon: Code2 },
  { id: 'restaurant', label: 'Restaurant',        icon: UtensilsCrossed },
  { id: 'freelance',  label: 'Freelance',         icon: User },
  { id: 'realestate', label: 'Immobilier',        icon: Home },
  { id: 'health',     label: 'Santé / Bien-être', icon: Heart },
  { id: 'education',  label: 'Formation',         icon: GraduationCap },
  { id: 'consulting', label: 'Consulting',        icon: Building2 },
  { id: 'artisan',    label: 'Artisan / Créatif', icon: Pen },
  { id: 'other',      label: 'Autre',             icon: Sparkles },
];

const TEAM_SIZES = [
  { id: 'solo',    label: 'Solo' },
  { id: '2-10',    label: '2–10' },
  { id: '10-50',   label: '10–50' },
  { id: '50+',     label: '50+' },
];

const GOAL_OPTIONS = [
  { id: 'emails',    label: 'Réduire le temps passé sur les emails',        icon: Mail },
  { id: 'content',   label: 'Générer du contenu régulièrement',             icon: Pen },
  { id: 'sales',     label: 'Suivre mes ventes et alertes',                 icon: BarChart2 },
  { id: 'clients',   label: 'Coordonner mes clients et projets',            icon: Users },
  { id: 'analytics', label: 'Analyser mes données et performances',         icon: BarChart2 },
  { id: 'automate',  label: 'Automatiser mes tâches répétitives',           icon: Zap },
  { id: 'growth',    label: 'Accélérer ma croissance',                      icon: Target },
  { id: 'tools',     label: 'Mieux organiser mes outils et processus',      icon: Wrench },
];

const ANALYSIS_STEPS = [
  'Lecture du profil business…',
  'Analyse des objectifs…',
  'Identification des besoins opérationnels…',
  'Composition de l\'équipe optimale…',
  'Finalisation des agents…',
];

const TONES: Record<string, string> = {
  'Professionnel': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Chaleureux':    'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Analytique':    'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Direct':        'bg-red-500/10 text-red-400 border-red-500/20',
  'Créatif':       'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [generatedAgents, setGeneratedAgents] = useState<GeneratedAgent[]>([]);
  const [generationSource, setGenerationSource] = useState<'llm' | 'fallback'>('llm');

  const [form, setForm] = useState<BusinessForm>({
    name: '',
    type: '',
    description: '',
    teamSize: '',
  });
  const [goals, setGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState('');

  // ── Analysis animation ──
  useEffect(() => {
    if (step !== 3) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setAnalysisStep(i);
      if (i >= ANALYSIS_STEPS.length - 1) clearInterval(interval);
    }, 700);
    return () => clearInterval(interval);
  }, [step]);

  // ── Generate agents via LLM ──
  const generateAgents = useCallback(async () => {
    setStep(3); // show analysis animation
    setAnalysisStep(0);

    const allGoals = [...goals, ...(customGoal.trim() ? [customGoal.trim()] : [])];

    try {
      const res = await fetch('/api/onboarding/generate-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType: form.type,
          businessName: form.name,
          description: form.description,
          goals: allGoals,
          teamSize: form.teamSize,
        }),
      });
      const data = await res.json();
      setGeneratedAgents(data.agents || []);
      setGenerationSource(data.source || 'llm');
    } catch {
      setGeneratedAgents([]);
    }

    // Ensure animation completes (min 3.5s feel)
    await new Promise(r => setTimeout(r, Math.max(0, 3500 - Date.now() % 3500)));
    setStep(4);
  }, [form, goals, customGoal]);

  // ── Deploy team ──
  const handleDeploy = async () => {
    setIsSubmitting(true);
    try {
      // 1. Mark onboarding complete
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          businessType: form.type,
          selectedAgents: generatedAgents.map((a, i) => ({
            id: `gen-${i}`,
            name: a.editedName || a.name,
            role: a.editedRole || a.role,
            designation: a.designation,
            capabilities: a.capabilities,
            tone: a.tone,
            personality: a.personality,
          })),
        }),
      });
      router.push('/hq');
    } catch {
      setIsSubmitting(false);
    }
  };

  // ── Toggle goal ──
  const toggleGoal = (id: string) => {
    setGoals(prev =>
      prev.includes(id)
        ? prev.filter(g => g !== id)
        : prev.length < 3 ? [...prev, id] : prev
    );
  };

  // ── Update agent fields ──
  const updateAgent = (idx: number, field: 'editedName' | 'editedRole', value: string) => {
    setGeneratedAgents(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  // ── Step validators ──
  const canGoToGoals = form.type !== '';
  const canGenerate  = goals.length > 0 || customGoal.trim() !== '';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
    >
      {/* Progress bar */}
      {step > 0 && step < 4 && (
        <div className="fixed top-0 left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--armada-accent)' }}>
          <motion.div
            className="h-full"
            style={{ backgroundColor: 'var(--armada-primary)' }}
            initial={{ width: '0%' }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* ── Step 0: Welcome ─────────────────────────────────── */}
        {step === 0 && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center max-w-md w-full space-y-8"
          >
            <div className="flex justify-center">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center border border-[var(--armada-primary)]/30"
                style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)' }}
              >
                <Shield className="h-9 w-9" style={{ color: 'var(--armada-primary)' }} />
              </div>
            </div>
            <div className="space-y-3">
              <h1 className="font-serif text-4xl tracking-tight text-[var(--armada-text)]">
                armada
              </h1>
              <p className="text-[var(--armada-text)]/60 leading-relaxed">
                Déployez votre équipe d'agents IA en 4 minutes. Ils travaillent pour vous, 24h/24.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => setStep(1)}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-white font-medium transition-all hover:opacity-90"
                style={{ backgroundColor: 'var(--armada-primary)' }}
              >
                Commencer la mission
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-widest">
                Environ 4 minutes · Aucune carte bancaire requise
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Step 1: Business profile ─────────────────────────── */}
        {step === 1 && (
          <motion.div
            key="business"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="w-full max-w-lg space-y-6"
          >
            <button
              onClick={() => setStep(0)}
              className="flex items-center gap-1.5 text-sm text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Retour
            </button>

            <div>
              <div className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-widest mb-1">Étape 1 / 3</div>
              <h2 className="font-serif text-2xl text-[var(--armada-text)]">Votre business</h2>
              <p className="text-sm text-[var(--armada-text)]/50 mt-1">Pour créer une équipe adaptée à vos besoins réels.</p>
            </div>

            {/* Business name */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-[var(--armada-text)]/50 uppercase tracking-wider">
                Nom de votre entreprise <span className="text-[var(--armada-primary)]">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Studio Pixel, La Boulangerie du Coin…"
                className="w-full px-4 py-3 rounded-xl border border-[var(--armada-accent)]/60 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-2 focus:ring-[var(--armada-primary)]/10 transition-colors"
                style={{ backgroundColor: 'var(--armada-surface)', color: 'var(--armada-text)' }}
              />
            </div>

            {/* Business type */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-[var(--armada-text)]/50 uppercase tracking-wider">
                Type d'activité <span className="text-[var(--armada-primary)]">*</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {BUSINESS_TYPES.map(bt => (
                  <button
                    key={bt.id}
                    onClick={() => setForm(p => ({ ...p, type: bt.id }))}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-mono transition-all',
                      form.type === bt.id
                        ? 'border-[var(--armada-primary)] text-[var(--armada-text)]'
                        : 'border-[var(--armada-accent)]/50 text-[var(--armada-text)]/50 hover:border-[var(--armada-primary)]/30 hover:text-[var(--armada-text)]'
                    )}
                    style={form.type === bt.id ? {
                      backgroundColor: 'color-mix(in srgb, var(--armada-primary) 8%, var(--armada-surface))',
                    } : { backgroundColor: 'var(--armada-surface)' }}
                  >
                    <bt.icon className="h-4 w-4" />
                    <span className="text-[10px] text-center leading-tight">{bt.label}</span>
                    {form.type === bt.id && (
                      <Check className="h-2.5 w-2.5 absolute" style={{ color: 'var(--armada-primary)' }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Team size */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-[var(--armada-text)]/50 uppercase tracking-wider">Taille d'équipe</label>
              <div className="flex gap-2">
                {TEAM_SIZES.map(ts => (
                  <button
                    key={ts.id}
                    onClick={() => setForm(p => ({ ...p, teamSize: ts.id }))}
                    className={cn(
                      'flex-1 py-2 rounded-xl border text-xs font-mono transition-all',
                      form.teamSize === ts.id
                        ? 'border-[var(--armada-primary)] text-[var(--armada-text)]'
                        : 'border-[var(--armada-accent)]/50 text-[var(--armada-text)]/50 hover:border-[var(--armada-primary)]/30 hover:text-[var(--armada-text)]'
                    )}
                    style={form.teamSize === ts.id
                      ? { backgroundColor: 'color-mix(in srgb, var(--armada-primary) 8%, var(--armada-surface))' }
                      : { backgroundColor: 'var(--armada-surface)' }
                    }
                  >
                    {ts.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description (optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-[var(--armada-text)]/50 uppercase tracking-wider">
                Description (optionnel)
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Ex: Boutique de vêtements éthiques pour femmes 25-40 ans…"
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-[var(--armada-accent)]/60 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 resize-none transition-colors"
                style={{ backgroundColor: 'var(--armada-surface)', color: 'var(--armada-text)' }}
              />
            </div>

            <button
              onClick={() => canGoToGoals && setStep(2)}
              disabled={!canGoToGoals}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-white font-medium transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--armada-primary)' }}
            >
              Continuer
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {/* ── Step 2: Goals ────────────────────────────────────── */}
        {step === 2 && (
          <motion.div
            key="goals"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="w-full max-w-lg space-y-6"
          >
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-sm text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Retour
            </button>

            <div>
              <div className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-widest mb-1">Étape 2 / 3</div>
              <h2 className="font-serif text-2xl text-[var(--armada-text)]">Vos objectifs</h2>
              <p className="text-sm text-[var(--armada-text)]/50 mt-1">
                Qu'est-ce que vous voulez accomplir avec votre équipe IA ?
                <span className="text-[var(--armada-text)]/30"> (max 3)</span>
              </p>
            </div>

            <div className="space-y-2">
              {GOAL_OPTIONS.map(goal => {
                const isSelected = goals.includes(goal.id);
                const isDisabled = !isSelected && goals.length >= 3;
                return (
                  <button
                    key={goal.id}
                    onClick={() => !isDisabled && toggleGoal(goal.id)}
                    disabled={isDisabled}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm text-left transition-all',
                      isSelected
                        ? 'border-[var(--armada-primary)] text-[var(--armada-text)]'
                        : isDisabled
                          ? 'border-[var(--armada-accent)]/30 text-[var(--armada-text)]/25 cursor-not-allowed'
                          : 'border-[var(--armada-accent)]/50 text-[var(--armada-text)]/70 hover:border-[var(--armada-primary)]/30 hover:text-[var(--armada-text)]'
                    )}
                    style={isSelected
                      ? { backgroundColor: 'color-mix(in srgb, var(--armada-primary) 8%, var(--armada-surface))' }
                      : { backgroundColor: 'var(--armada-surface)' }
                    }
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors',
                      isSelected
                        ? 'border-[var(--armada-primary)]'
                        : 'border-[var(--armada-accent)]/50'
                    )}
                    style={isSelected ? { backgroundColor: 'var(--armada-primary)' } : {}}>
                      {isSelected
                        ? <Check className="h-3 w-3 text-white" />
                        : <goal.icon className="h-3 w-3 text-[var(--armada-text)]/30" />
                      }
                    </div>
                    {goal.label}
                  </button>
                );
              })}
            </div>

            {/* Custom goal */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-[var(--armada-text)]/50 uppercase tracking-wider">
                Autre objectif (optionnel)
              </label>
              <input
                type="text"
                value={customGoal}
                onChange={e => setCustomGoal(e.target.value)}
                placeholder="Décrivez votre besoin spécifique…"
                className="w-full px-4 py-3 rounded-xl border border-[var(--armada-accent)]/60 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-2 focus:ring-[var(--armada-primary)]/10 transition-colors"
                style={{ backgroundColor: 'var(--armada-surface)', color: 'var(--armada-text)' }}
              />
            </div>

            <button
              onClick={() => canGenerate && generateAgents()}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-white font-medium transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--armada-primary)' }}
            >
              Créer mon équipe IA
              <Sparkles className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {/* ── Step 3: Analysis animation ───────────────────────── */}
        {step === 3 && (
          <motion.div
            key="analysis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center max-w-sm w-full space-y-8"
          >
            {/* Animated shield */}
            <div className="flex justify-center">
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center border border-[var(--armada-primary)]/30"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)' }}
                >
                  <Shield className="h-9 w-9" style={{ color: 'var(--armada-primary)' }} />
                </div>
                <motion.div
                  className="absolute inset-0 rounded-2xl border border-[var(--armada-primary)]/20"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </div>

            <div>
              <h2 className="font-serif text-2xl text-[var(--armada-text)] mb-2">Le Major analyse…</h2>
              <p className="text-sm text-[var(--armada-text)]/50">Composition de votre équipe optimale</p>
            </div>

            {/* Steps */}
            <div className="space-y-2 text-left">
              {ANALYSIS_STEPS.map((s, i) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: i <= analysisStep ? 1 : 0.2, x: 0 }}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--armada-accent)]/30"
                  style={{ backgroundColor: 'var(--armada-surface)' }}
                >
                  {i < analysisStep ? (
                    <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : i === analysisStep ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" style={{ color: 'var(--armada-primary)' }} />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-[var(--armada-accent)]/50 shrink-0" />
                  )}
                  <span className="text-xs font-mono text-[var(--armada-text)]/70">{s}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Step 4: Validate & deploy ─────────────────────────── */}
        {step === 4 && (
          <motion.div
            key="validate"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-xl space-y-6"
          >
            <div className="text-center">
              <div className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-widest mb-1">Étape 3 / 3</div>
              <h2 className="font-serif text-2xl text-[var(--armada-text)]">Votre équipe est prête</h2>
              <p className="text-sm text-[var(--armada-text)]/50 mt-1">
                {generationSource === 'llm'
                  ? 'Agents créés sur mesure pour vos objectifs. Modifiez si nécessaire.'
                  : 'Équipe générée. Modifiez les noms et rôles selon vos besoins.'
                }
              </p>
            </div>

            {generatedAgents.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <Bot className="h-8 w-8 text-[var(--armada-text)]/20 mx-auto" />
                <p className="text-sm text-[var(--armada-text)]/40">Aucun agent généré. Réessayez.</p>
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 mx-auto px-4 py-2 rounded-full border border-[var(--armada-accent)] text-sm text-[var(--armada-text)]/60 hover:text-[var(--armada-text)] transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Réessayer
                </button>
              </div>
            ) : (
              <>
                {/* Agent cards */}
                <div className="space-y-3">
                  {generatedAgents.map((agent, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="relative rounded-2xl border border-[var(--armada-accent)]/50 overflow-hidden"
                      style={{ backgroundColor: 'var(--armada-surface)' }}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--armada-primary)' }} />
                      <div className="px-5 py-4 space-y-3">
                        {/* Editable name + role */}
                        <div className="flex items-start gap-4">
                          <div
                            className="w-10 h-10 rounded-full border border-[var(--armada-accent)] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: 'var(--armada-bg)' }}
                          >
                            <Bot className="h-4 w-4 text-[var(--armada-text)]/40" />
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <input
                              type="text"
                              value={agent.editedName ?? agent.name}
                              onChange={e => updateAgent(idx, 'editedName', e.target.value)}
                              className="font-serif text-base text-[var(--armada-text)] bg-transparent border-b border-[var(--armada-accent)]/30 focus:border-[var(--armada-primary)]/50 focus:outline-none w-full pb-0.5 transition-colors"
                            />
                            <input
                              type="text"
                              value={agent.editedRole ?? agent.role}
                              onChange={e => updateAgent(idx, 'editedRole', e.target.value)}
                              className="text-[10px] font-mono uppercase tracking-widest bg-transparent border-b border-[var(--armada-accent)]/20 focus:border-[var(--armada-primary)]/30 focus:outline-none w-full pb-0.5 transition-colors"
                              style={{ color: 'var(--armada-primary)' }}
                            />
                          </div>
                          {agent.tone && (
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-[9px] font-mono border shrink-0',
                              TONES[agent.tone] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                            )}>
                              {agent.tone}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[var(--armada-text)]/60 leading-relaxed">
                          {agent.description}
                        </p>

                        {/* Capabilities */}
                        <div className="flex flex-wrap gap-1.5">
                          {agent.capabilities.map(cap => (
                            <span
                              key={cap}
                              className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-[var(--armada-accent)]/40 text-[var(--armada-text)]/50"
                              style={{ backgroundColor: 'var(--armada-bg)' }}
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Deploy button */}
                <button
                  onClick={handleDeploy}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-white font-medium transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: 'var(--armada-primary)' }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Déploiement en cours…
                    </>
                  ) : (
                    <>
                      Déployer mon équipe
                      <Zap className="h-4 w-4" />
                    </>
                  )}
                </button>

                <button
                  onClick={() => { setStep(2); setGeneratedAgents([]); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Régénérer l'équipe
                </button>
              </>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
