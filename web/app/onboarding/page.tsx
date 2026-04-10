'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Shield, Bot, Check, ChevronLeft, ShoppingBag, Briefcase,
  Code2, UtensilsCrossed, User, Home, Heart, GraduationCap,
  Sparkles, Plus, Loader2, Activity, ArrowRight, Zap,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BusinessForm {
  name: string;
  type: string;
  description: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  designation: string;
  description: string;
  capabilities: string[];
  selected: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { id: 'ecommerce',  label: 'E-commerce',       icon: ShoppingBag },
  { id: 'agency',     label: 'Agence',            icon: Briefcase },
  { id: 'saas',       label: 'SaaS / Tech',       icon: Code2 },
  { id: 'restaurant', label: 'Restaurant',        icon: UtensilsCrossed },
  { id: 'freelance',  label: 'Freelance',         icon: User },
  { id: 'realestate', label: 'Immobilier',        icon: Home },
  { id: 'health',     label: 'Santé / Bien-être', icon: Heart },
  { id: 'education',  label: 'Formation',         icon: GraduationCap },
  { id: 'other',      label: 'Autre',             icon: Sparkles },
];

const AGENT_CATALOG: Record<string, Omit<Agent, 'selected'>[]> = {
  ecommerce: [
    {
      id: 'product', name: 'Sophie', role: 'Spécialiste Produit', designation: 'SPEC-01',
      description: 'Gère votre catalogue, optimise les fiches produit et identifie les opportunités de vente croisée.',
      capabilities: ['Fiches produit', 'Catalogue', 'Prix', 'Vente croisée'],
    },
    {
      id: 'inventory', name: 'Marcus', role: 'Gestionnaire Stock', designation: 'SPEC-02',
      description: 'Surveille vos niveaux de stock, anticipe les ruptures et automatise les réapprovisionnements.',
      capabilities: ['Alertes stock', 'Réapprovisionnement', 'Prévisions'],
    },
    {
      id: 'content', name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-03',
      description: 'Rédige des descriptions produits, des articles de blog et des posts pour vos réseaux sociaux.',
      capabilities: ['Descriptions', 'Blog', 'Réseaux sociaux', 'Email'],
    },
    {
      id: 'seo', name: 'Olivia', role: 'SEO Stratège', designation: 'SPEC-04',
      description: 'Optimise votre référencement naturel, analyse les mots-clés et suit vos positions Google.',
      capabilities: ['Audit SEO', 'Mots-clés', 'Search Console', 'Backlinks'],
    },
  ],
  agency: [
    {
      id: 'pm', name: 'Thomas', role: 'Chef de Projet', designation: 'SPEC-01',
      description: 'Coordonne vos projets clients, suit les livrables et envoie des rapports d\'avancement automatiques.',
      capabilities: ['Suivi projets', 'Rapports clients', 'Jalons', 'Alertes'],
    },
    {
      id: 'crm', name: 'Clara', role: 'Gestionnaire CRM', designation: 'SPEC-02',
      description: 'Gère votre pipeline commercial, suit vos prospects et automatise les relances clients.',
      capabilities: ['Pipeline', 'Relances', 'Devis', 'Contrats'],
    },
    {
      id: 'content', name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-03',
      description: 'Produit du contenu pour vos clients et votre agence — articles, études de cas, posts LinkedIn.',
      capabilities: ['Études de cas', 'Blog', 'LinkedIn', 'Newsletters'],
    },
    {
      id: 'analytics', name: 'Raphaël', role: 'Analyste Performance', designation: 'SPEC-04',
      description: 'Génère des rapports de performance pour vos clients avec données, insights et recommandations.',
      capabilities: ['Reporting', 'Métriques', 'Dashboards', 'Insights'],
    },
  ],
  saas: [
    {
      id: 'support', name: 'Emma', role: 'Support Client', designation: 'SPEC-01',
      description: 'Répond aux tickets, rédige de la documentation et identifie les problèmes récurrents.',
      capabilities: ['Tickets', 'Documentation', 'FAQ', 'Escalade'],
    },
    {
      id: 'growth', name: 'Nathan', role: 'Growth Analyst', designation: 'SPEC-02',
      description: 'Analyse la rétention, identifie les signaux de churn et optimise les parcours d\'activation.',
      capabilities: ['Churn prédictif', 'Activation', 'Cohortes', 'A/B testing'],
    },
    {
      id: 'content', name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-03',
      description: 'Crée du contenu product-led — documentation, tutoriels, changelog et newsletters.',
      capabilities: ['Documentation', 'Tutoriels', 'Changelog', 'Blog'],
    },
    {
      id: 'crm', name: 'Clara', role: 'Gestionnaire CRM', designation: 'SPEC-04',
      description: 'Qualifie les leads entrants, planifie les démos et suit le pipeline commercial.',
      capabilities: ['Qualification', 'Démos', 'Pipeline', 'Onboarding'],
    },
  ],
  restaurant: [
    {
      id: 'social', name: 'Zoé', role: 'Community Manager', designation: 'SPEC-01',
      description: 'Anime vos réseaux sociaux, répond aux avis et crée du contenu visuel autour de vos plats.',
      capabilities: ['Instagram', 'Google My Business', 'Avis', 'Stories'],
    },
    {
      id: 'marketing', name: 'Lucas', role: 'Marketing Local', designation: 'SPEC-02',
      description: 'Lance des promotions ciblées, gère votre référencement local et attire de nouveaux clients.',
      capabilities: ['Promotions', 'SEO local', 'Google Ads', 'Fidélisation'],
    },
    {
      id: 'ops', name: 'Marie', role: 'Coordinatrice Ops', designation: 'SPEC-03',
      description: 'Gère les réservations, coordonne avec vos plateformes de livraison et suit les retours clients.',
      capabilities: ['Réservations', 'Livraison', 'Clients', 'Planning'],
    },
    {
      id: 'content', name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-04',
      description: 'Rédige des descriptions de menu, des newsletters et des contenus saisonniers engageants.',
      capabilities: ['Menu', 'Newsletters', 'Événements', 'Recettes'],
    },
  ],
  freelance: [
    {
      id: 'crm', name: 'Clara', role: 'Gestionnaire Clients', designation: 'SPEC-01',
      description: 'Suit vos projets en cours, relance les prospects et automatise les propositions commerciales.',
      capabilities: ['CRM', 'Devis', 'Relances', 'Contrats'],
    },
    {
      id: 'finance', name: 'Hugo', role: 'Assistant Financier', designation: 'SPEC-02',
      description: 'Génère vos factures, suit les paiements en retard et produit des rapports de trésorerie.',
      capabilities: ['Facturation', 'Impayés', 'Trésorerie', 'Notes de frais'],
    },
    {
      id: 'content', name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-03',
      description: 'Alimente votre portfolio, publie sur LinkedIn et crée des études de cas pour attirer des clients.',
      capabilities: ['Portfolio', 'LinkedIn', 'Études de cas', 'Testimonials'],
    },
    {
      id: 'planning', name: 'Samir', role: 'Planificateur', designation: 'SPEC-04',
      description: 'Organise votre agenda, alloue le temps par projet et évite la surcharge de travail.',
      capabilities: ['Agenda', 'Time tracking', 'Capacité', 'Priorités'],
    },
  ],
};

// Fallback for unmapped types
AGENT_CATALOG.realestate = [
  {
    id: 'listings', name: 'Camille', role: 'Gestionnaire Annonces', designation: 'SPEC-01',
    description: 'Publie et optimise vos annonces sur les portails, rédige des descriptions valorisantes.',
    capabilities: ['Annonces', 'Rédaction', 'Portails', 'Photos'],
  },
  {
    id: 'crm', name: 'Clara', role: 'Gestionnaire CRM', designation: 'SPEC-02',
    description: 'Suit vos prospects acquéreurs et vendeurs, automatise les relances et les rendez-vous.',
    capabilities: ['Prospects', 'Relances', 'Rendez-vous', 'Contrats'],
  },
  {
    id: 'social', name: 'Zoé', role: 'Community Manager', designation: 'SPEC-03',
    description: 'Anime votre présence en ligne, partage les biens à vendre et génère des leads locaux.',
    capabilities: ['Instagram', 'LinkedIn', 'Google', 'Avis'],
  },
  {
    id: 'analytics', name: 'Raphaël', role: 'Analyste Marché', designation: 'SPEC-04',
    description: 'Suit les tendances du marché immobilier local et produit des rapports pour vos clients.',
    capabilities: ['Prix du marché', 'Tendances', 'Rapports', 'Données'],
  },
];
AGENT_CATALOG.health = [
  {
    id: 'crm', name: 'Clara', role: 'Coordinatrice Patients', designation: 'SPEC-01',
    description: 'Gère les rendez-vous, les rappels et le suivi des patients ou clients.',
    capabilities: ['RDV', 'Rappels', 'Suivi', 'Dossiers'],
  },
  {
    id: 'content', name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-02',
    description: 'Produit du contenu éducatif, des newsletters santé et des posts pour vos réseaux sociaux.',
    capabilities: ['Articles santé', 'Newsletter', 'Réseaux sociaux', 'Conseils'],
  },
  {
    id: 'social', name: 'Zoé', role: 'Community Manager', designation: 'SPEC-03',
    description: 'Anime votre communauté en ligne, répond aux questions et développe votre réputation.',
    capabilities: ['Instagram', 'Avis Google', 'FAQ', 'Engagement'],
  },
  {
    id: 'analytics', name: 'Raphaël', role: 'Analyste Performance', designation: 'SPEC-04',
    description: 'Suit vos indicateurs clés — taux de rétention, satisfaction, occupation.',
    capabilities: ['Rétention', 'Satisfaction', 'KPIs', 'Rapports'],
  },
];
AGENT_CATALOG.education = [
  {
    id: 'content', name: 'Léa', role: 'Ingénieure Pédagogique', designation: 'SPEC-01',
    description: 'Crée des modules de formation, des exercices et du contenu pédagogique engageant.',
    capabilities: ['Modules', 'Exercices', 'Vidéos scripts', 'Quiz'],
  },
  {
    id: 'crm', name: 'Clara', role: 'Gestionnaire Apprenants', designation: 'SPEC-02',
    description: 'Suit la progression des apprenants, automatise les relances et améliore la complétion.',
    capabilities: ['Suivi progression', 'Relances', 'Certification', 'Support'],
  },
  {
    id: 'marketing', name: 'Lucas', role: 'Marketing Formation', designation: 'SPEC-03',
    description: 'Lance des campagnes pour recruter de nouveaux apprenants et fidéliser les existants.',
    capabilities: ['Campagnes', 'Tunnels de vente', 'Emails', 'Webinaires'],
  },
  {
    id: 'analytics', name: 'Raphaël', role: 'Analyste Learning', designation: 'SPEC-04',
    description: 'Mesure l\'efficacité de vos formations, le taux de complétion et la satisfaction.',
    capabilities: ['Analytics', 'Complétion', 'NPS', 'Rapports'],
  },
];
AGENT_CATALOG.other = [
  {
    id: 'ops', name: 'Alex', role: 'Responsable Opérations', designation: 'SPEC-01',
    description: 'Automatise vos processus récurrents, centralise vos données et produit des rapports opérationnels.',
    capabilities: ['Automatisation', 'Reporting', 'Workflows', 'Données'],
  },
  {
    id: 'crm', name: 'Clara', role: 'Gestionnaire Relations', designation: 'SPEC-02',
    description: 'Gère vos contacts, suit vos interactions et automatise les communications régulières.',
    capabilities: ['Contacts', 'Suivi', 'Emails', 'Relances'],
  },
  {
    id: 'content', name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-03',
    description: 'Produit du contenu adapté à votre activité — textes, posts, newsletters et présentations.',
    capabilities: ['Rédaction', 'Réseaux sociaux', 'Newsletters', 'Présentation'],
  },
  {
    id: 'analytics', name: 'Raphaël', role: 'Analyste', designation: 'SPEC-04',
    description: 'Collecte et analyse vos données clés pour vous aider à prendre de meilleures décisions.',
    capabilities: ['Données', 'Rapports', 'Insights', 'KPIs'],
  },
];

const MAJOR_MESSAGES: Record<string, string> = {
  ecommerce:  "J'ai analysé votre catalogue et vos flux opérationnels. Pour maximiser vos ventes et automatiser votre logistique, j'ai sélectionné quatre spécialistes qui travailleront ensemble en permanence.",
  agency:     "J'ai étudié votre modèle d'agence. Pour améliorer la rentabilité de vos projets et la satisfaction client, j'ai constitué une équipe orientée livraison et croissance commerciale.",
  saas:       "J'ai analysé votre contexte SaaS. Pour réduire le churn, accélérer l'activation et développer votre base, j'ai recruté quatre agents avec des compétences complémentaires.",
  restaurant: "J'ai étudié votre établissement. Pour remplir vos tables, soigner votre réputation en ligne et fidéliser vos clients, j'ai sélectionné une équipe orientée proximité et visibilité locale.",
  freelance:  "J'ai analysé votre profil indépendant. Pour vous libérer des tâches chronophages — admin, facturation, prospection — j'ai assemblé une équipe légère mais efficace.",
  realestate: "J'ai étudié votre activité immobilière. Pour maximiser la visibilité de vos biens et convertir plus de prospects, j'ai sélectionné quatre spécialistes complémentaires.",
  health:     "J'ai analysé votre activité dans le domaine de la santé. Pour améliorer l'expérience patient et développer votre patientèle, j'ai constitué une équipe dédiée.",
  education:  "J'ai étudié votre offre de formation. Pour recruter des apprenants, améliorer la complétion et automatiser le suivi, j'ai sélectionné quatre agents spécialisés.",
  default:    "J'ai analysé votre activité en détail. Pour répondre à vos besoins opérationnels et vous faire gagner un maximum de temps, j'ai composé une équipe d'agents sur mesure.",
};

const FIRST_MISSIONS: Record<string, string> = {
  ecommerce:  "Demandez à Sophie de faire un audit de votre catalogue et d'identifier les 10 fiches produits qui nécessitent le plus d'amélioration.",
  agency:     "Demandez à Thomas de générer un rapport de statut pour tous vos projets actifs et d'identifier les retards potentiels.",
  saas:       "Demandez à Emma d'analyser vos tickets support des 30 derniers jours et de rédiger une FAQ basée sur les questions les plus fréquentes.",
  restaurant: "Demandez à Zoé de répondre à tous vos avis Google non traités et de planifier 2 semaines de contenu Instagram.",
  freelance:  "Demandez à Hugo de générer un rapport de vos factures en attente et de préparer des relances pour les impayés.",
  default:    "Briefez Le Major sur votre première priorité opérationnelle — il coordonnera l'équipe pour vous fournir un plan d'action dans les minutes qui suivent.",
};

const ANALYSIS_STEPS = [
  "Lecture du profil business...",
  "Identification des besoins opérationnels...",
  "Évaluation des agents disponibles...",
  "Composition de l'équipe optimale...",
  "Préparation du briefing...",
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const total = 4;
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-[3px] rounded-full transition-all duration-500"
          style={{
            width: i < step ? 40 : 28,
            backgroundColor: i < step ? 'var(--armada-primary)' : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
      <span
        className="ml-2 text-[10px] font-mono uppercase tracking-widest"
        style={{ color: 'rgba(255,255,255,0.25)' }}
      >
        {step} / {total}
      </span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest transition-opacity hover:opacity-100"
      style={{ color: 'rgba(255,255,255,0.30)' }}
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Retour
    </button>
  );
}

// Subtle grid background texture
function GridBg() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    />
  );
}

// Page slide animation wrapper
const slide = {
  enter:  { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  exit:   { opacity: 0, x: -24, transition: { duration: 0.2 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 0 — Welcome
// ─────────────────────────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      key="welcome"
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <GridBg />

      {/* Glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.07]"
        style={{ background: 'radial-gradient(circle, var(--armada-primary) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 flex max-w-md flex-col items-center">
        {/* Logo mark */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 flex h-16 w-16 items-center justify-center rounded-full border"
          style={{
            borderColor: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--armada-primary) 8%, transparent)',
          }}
        >
          <Shield className="h-7 w-7" style={{ color: 'var(--armada-primary)' }} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <div
            className="mb-2 text-[10px] font-mono uppercase tracking-[0.3em]"
            style={{ color: 'var(--armada-primary)' }}
          >
            Armada HQ
          </div>
          <h1
            className="mb-4 font-serif text-4xl leading-tight"
            style={{ color: 'var(--armada-text)' }}
          >
            Votre quartier général
            <br />
            <span style={{ color: 'rgba(240,239,234,0.5)' }}>est prêt à être assemblé.</span>
          </h1>
          <p
            className="mb-10 text-sm leading-relaxed"
            style={{ color: 'rgba(240,239,234,0.4)' }}
          >
            Le Major va analyser votre activité et recruter l'équipe d'agents
            la plus adaptée à votre business. Moins de 3 minutes.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          <button
            onClick={onNext}
            className="group flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: 'var(--armada-primary)', color: '#fff' }}
          >
            Commencer la mission
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <span
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.18)' }}
          >
            Durée estimée · 3 minutes
          </span>
        </motion.div>
      </div>

      {/* Bottom right watermark */}
      <div
        className="absolute bottom-6 right-6 text-[9px] font-mono uppercase tracking-widest"
        style={{ color: 'rgba(255,255,255,0.10)' }}
      >
        Armada OS · v1.0
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Business Intelligence
// ─────────────────────────────────────────────────────────────────────────────

function StepBusiness({
  form,
  setForm,
  onNext,
  onBack,
}: {
  form: BusinessForm;
  setForm: (f: BusinessForm) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canContinue = form.name.trim().length > 0 && form.type !== '';

  return (
    <motion.div
      key="business"
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      className="relative min-h-screen px-6 py-10"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <GridBg />

      <div className="relative z-10 mx-auto max-w-xl">
        {/* Top bar */}
        <div className="mb-10 flex items-center justify-between">
          <BackButton onClick={onBack} />
          <ProgressBar step={1} />
        </div>

        <div className="mb-8">
          <div
            className="mb-2 text-[10px] font-mono uppercase tracking-[0.25em]"
            style={{ color: 'var(--armada-primary)' }}
          >
            Acte I
          </div>
          <h2 className="font-serif text-3xl" style={{ color: 'var(--armada-text)' }}>
            {form.name ? `Bienvenue, ${form.name}` : 'Parlez-nous de votre activité'}
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'rgba(240,239,234,0.4)' }}>
            Le Major utilisera ces informations pour composer votre équipe.
          </p>
        </div>

        <div className="space-y-6">
          {/* Business name */}
          <div>
            <label
              className="mb-2 block text-[10px] font-mono uppercase tracking-widest"
              style={{ color: 'rgba(240,239,234,0.35)' }}
            >
              Nom de votre activité
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="ex: Maison Léon, Alefia, Studio Atlas..."
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--armada-primary)]/40"
              style={{
                backgroundColor: '#111111',
                borderColor: '#252525',
                color: 'var(--armada-text)',
              }}
            />
          </div>

          {/* Business type */}
          <div>
            <label
              className="mb-3 block text-[10px] font-mono uppercase tracking-widest"
              style={{ color: 'rgba(240,239,234,0.35)' }}
            >
              Type d&apos;activité
            </label>
            <div className="grid grid-cols-3 gap-2">
              {BUSINESS_TYPES.map(({ id, label, icon: Icon }) => {
                const active = form.type === id;
                return (
                  <button
                    key={id}
                    onClick={() => setForm({ ...form, type: id })}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-all"
                    style={{
                      borderColor: active
                        ? 'color-mix(in srgb, var(--armada-primary) 50%, transparent)'
                        : '#252525',
                      backgroundColor: active
                        ? 'color-mix(in srgb, var(--armada-primary) 10%, transparent)'
                        : 'transparent',
                      color: active ? 'var(--armada-primary)' : 'rgba(240,239,234,0.45)',
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              className="mb-2 block text-[10px] font-mono uppercase tracking-widest"
              style={{ color: 'rgba(240,239,234,0.35)' }}
            >
              Description
              <span className="ml-2 normal-case" style={{ color: 'rgba(255,255,255,0.15)' }}>
                (optionnel)
              </span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Décrivez votre activité en quelques phrases. Le Major s'en servira pour personnaliser votre équipe..."
              rows={4}
              className="w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--armada-primary)]/40"
              style={{
                backgroundColor: '#111111',
                borderColor: '#252525',
                color: 'var(--armada-text)',
              }}
            />
          </div>

          <button
            onClick={onNext}
            disabled={!canContinue}
            className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-medium transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30"
            style={{ backgroundColor: 'var(--armada-primary)', color: '#fff' }}
          >
            Analyser mon activité
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Major Analysis
// ─────────────────────────────────────────────────────────────────────────────

function StepAnalysis({
  form,
  onNext,
  onBack,
}: {
  form: BusinessForm;
  onNext: () => void;
  onBack: () => void;
}) {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string | null>(ANALYSIS_STEPS[0]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let idx = 0;
    setCompletedSteps([]);
    setCurrentStep(ANALYSIS_STEPS[0]);
    setDone(false);

    const advance = () => {
      setCompletedSteps(prev => [...prev, ANALYSIS_STEPS[idx]]);
      idx++;
      if (idx < ANALYSIS_STEPS.length) {
        setCurrentStep(ANALYSIS_STEPS[idx]);
        setTimeout(advance, 700);
      } else {
        setCurrentStep(null);
        setTimeout(() => setDone(true), 400);
      }
    };

    const t = setTimeout(advance, 600);
    return () => clearTimeout(t);
  }, []);

  const message =
    MAJOR_MESSAGES[form.type] || MAJOR_MESSAGES.default;

  return (
    <motion.div
      key="analysis"
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <GridBg />

      <div className="absolute left-6 right-6 top-10 flex items-center justify-between">
        <BackButton onClick={onBack} />
        <ProgressBar step={2} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Major avatar */}
        <div className="mb-8 flex justify-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex h-20 w-20 items-center justify-center rounded-full border-2"
            style={{
              borderColor: 'color-mix(in srgb, var(--armada-primary) 40%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--armada-primary) 8%, transparent)',
            }}
          >
            <Shield className="h-9 w-9" style={{ color: 'var(--armada-primary)' }} />
            {!done && (
              <motion.div
                className="absolute inset-0 rounded-full border-2"
                style={{ borderColor: 'var(--armada-primary)' }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.div>
        </div>

        {/* Terminal steps */}
        <div
          className="mb-6 rounded-2xl border p-5"
          style={{ backgroundColor: '#0E0E0E', borderColor: '#1E1E1E' }}
        >
          <div
            className="mb-4 text-[9px] font-mono uppercase tracking-[0.25em]"
            style={{ color: 'rgba(255,255,255,0.20)' }}
          >
            Le Major — Analyse en cours
          </div>

          <div className="space-y-2">
            {completedSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Check className="h-3 w-3 flex-shrink-0 text-green-500" />
                <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {s}
                </span>
              </div>
            ))}
            {currentStep && (
              <div className="flex items-center gap-2">
                <Loader2
                  className="h-3 w-3 flex-shrink-0 animate-spin"
                  style={{ color: 'var(--armada-primary)' }}
                />
                <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.60)' }}>
                  {currentStep}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Major's message — appears when done */}
        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-6 rounded-2xl rounded-tl-sm border p-5"
              style={{ backgroundColor: '#111111', borderColor: '#252525' }}
            >
              <p className="font-serif text-base leading-relaxed" style={{ color: 'rgba(240,239,234,0.80)' }}>
                &ldquo;{message}&rdquo;
              </p>
              <div
                className="mt-3 text-[9px] font-mono uppercase tracking-[0.2em]"
                style={{ color: 'var(--armada-primary)' }}
              >
                Le Major · CMD-00
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {done && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              onClick={onNext}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-medium transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ backgroundColor: 'var(--armada-primary)', color: '#fff' }}
            >
              Voir mon équipe
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Team Assembly
// ─────────────────────────────────────────────────────────────────────────────

function StepTeam({
  agents,
  setAgents,
  onNext,
  onBack,
}: {
  agents: Agent[];
  setAgents: (a: Agent[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const toggle = useCallback(
    (id: string) => {
      setAgents(agents.map(a => (a.id === id ? { ...a, selected: !a.selected } : a)));
    },
    [agents, setAgents],
  );

  const selectedCount = agents.filter(a => a.selected).length;

  return (
    <motion.div
      key="team"
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      className="relative min-h-screen px-6 py-10"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <GridBg />

      <div className="relative z-10 mx-auto max-w-2xl">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          <BackButton onClick={onBack} />
          <ProgressBar step={3} />
        </div>

        <div className="mb-6">
          <div
            className="mb-2 text-[10px] font-mono uppercase tracking-[0.25em]"
            style={{ color: 'var(--armada-primary)' }}
          >
            Acte III
          </div>
          <h2 className="font-serif text-3xl" style={{ color: 'var(--armada-text)' }}>
            Votre équipe recommandée
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: 'rgba(240,239,234,0.40)' }}>
            Sélectionnez les agents que vous souhaitez activer. Vous pourrez modifier l&apos;équipe à tout moment.
          </p>
        </div>

        {/* Le Major — always present */}
        <div
          className="mb-4 flex items-center gap-4 rounded-2xl border-2 px-5 py-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--armada-primary) 35%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--armada-primary) 6%, transparent)',
          }}
        >
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border"
            style={{
              borderColor: 'color-mix(in srgb, var(--armada-primary) 40%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--armada-primary) 12%, transparent)',
            }}
          >
            <Shield className="h-4.5 w-4.5" style={{ color: 'var(--armada-primary)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif text-base" style={{ color: 'var(--armada-text)' }}>
                Le Major
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--armada-primary) 15%, transparent)',
                  color: 'var(--armada-primary)',
                }}
              >
                Commandant
              </span>
            </div>
            <div
              className="mt-0.5 text-[10px] font-mono uppercase tracking-widest"
              style={{ color: 'rgba(240,239,234,0.30)' }}
            >
              CMD-00 · Chef des Opérations · Toujours actif
            </div>
          </div>
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--armada-primary)' }}>
            <Check className="h-3 w-3 text-white" />
          </div>
        </div>

        {/* Separator */}
        <div
          className="mb-4 flex items-center gap-3"
        >
          <span
            className="text-[9px] font-mono uppercase tracking-[0.25em]"
            style={{ color: 'rgba(255,255,255,0.20)' }}
          >
            Spécialistes — {agents.length} agents
          </span>
          <div className="h-px flex-1" style={{ backgroundColor: '#252525' }} />
        </div>

        {/* Agent grid */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.10 } } }}
          className="mb-4 grid grid-cols-2 gap-3"
        >
          {agents.map(agent => (
            <motion.button
              key={agent.id}
              variants={{
                hidden: { opacity: 0, y: 16, scale: 0.96 },
                show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
              }}
              onClick={() => toggle(agent.id)}
              className="relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-200"
              style={{
                borderColor: agent.selected
                  ? 'color-mix(in srgb, var(--armada-primary) 40%, transparent)'
                  : '#252525',
                backgroundColor: agent.selected
                  ? 'color-mix(in srgb, var(--armada-primary) 7%, transparent)'
                  : '#111111',
              }}
            >
              {/* Selection indicator */}
              <div
                className="absolute right-4 top-4 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-all"
                style={{
                  borderColor: agent.selected ? 'var(--armada-primary)' : '#333',
                  backgroundColor: agent.selected ? 'var(--armada-primary)' : 'transparent',
                }}
              >
                {agent.selected && <Check className="h-3 w-3 text-white" />}
              </div>

              {/* Agent header */}
              <div className="mb-3 flex items-center gap-3 pr-6">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: '#252525', backgroundColor: '#0E0E0E' }}
                >
                  <Bot className="h-4 w-4" style={{ color: 'rgba(240,239,234,0.30)' }} />
                </div>
                <div>
                  <div className="font-serif text-base leading-tight" style={{ color: 'var(--armada-text)' }}>
                    {agent.name}
                  </div>
                  <div
                    className="text-[9px] font-mono uppercase tracking-[0.15em]"
                    style={{ color: agent.selected ? 'var(--armada-primary)' : 'rgba(240,239,234,0.30)' }}
                  >
                    {agent.role}
                  </div>
                </div>
              </div>

              <p
                className="mb-3 text-xs leading-relaxed"
                style={{ color: 'rgba(240,239,234,0.50)' }}
              >
                {agent.description}
              </p>

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1">
                {agent.capabilities.map(cap => (
                  <span
                    key={cap}
                    className="rounded-full border px-2 py-0.5 text-[9px] font-mono"
                    style={{
                      borderColor: agent.selected ? 'color-mix(in srgb, var(--armada-primary) 25%, transparent)' : '#1E1E1E',
                      color: agent.selected ? 'color-mix(in srgb, var(--armada-primary) 80%, white)' : 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {cap}
                  </span>
                ))}
              </div>

              {/* Designation */}
              <div
                className="mt-3 text-[9px] font-mono"
                style={{ color: 'rgba(255,255,255,0.15)' }}
              >
                {agent.designation}
              </div>
            </motion.button>
          ))}
        </motion.div>

        {/* Add custom agent (decorative for now) */}
        <button
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-4 text-sm transition-all hover:border-white/20"
          style={{ borderColor: '#1E1E1E', color: 'rgba(255,255,255,0.25)' }}
        >
          <Plus className="h-4 w-4" />
          Ajouter un agent personnalisé
        </button>

        <button
          onClick={onNext}
          disabled={selectedCount === 0}
          className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-medium transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30"
          style={{ backgroundColor: 'var(--armada-primary)', color: '#fff' }}
        >
          Valider l&apos;équipe
          <span
            className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-mono"
            style={{ backgroundColor: 'rgba(255,255,255,0.20)' }}
          >
            {selectedCount + 1} agents
          </span>
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Mission Briefing / Ready
// ─────────────────────────────────────────────────────────────────────────────

function StepReady({
  form,
  agents,
  onBack,
}: {
  form: BusinessForm;
  agents: Agent[];
  onBack: () => void;
}) {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const selected = agents.filter(a => a.selected);
  const mission = FIRST_MISSIONS[form.type] || FIRST_MISSIONS.default;

  async function handleLaunch() {
    setLaunching(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          businessType: form.type,
          selectedAgents: selected.map(a => a.id),
        }),
      });
    } catch (e) {
      console.error('Onboarding save failed:', e);
    }
    router.push('/hq');
  }

  return (
    <motion.div
      key="ready"
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      className="relative min-h-screen px-6 py-10"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <GridBg />

      {/* Glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 opacity-[0.05]"
        style={{ background: 'radial-gradient(ellipse, var(--armada-primary) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 mx-auto max-w-xl">
        {/* Top bar */}
        <div className="mb-10 flex items-center justify-between">
          <BackButton onClick={onBack} />
          <ProgressBar step={4} />
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 text-center"
        >
          <div
            className="mb-3 flex justify-center"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full border-2"
              style={{
                borderColor: 'color-mix(in srgb, var(--armada-primary) 40%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)',
              }}
            >
              <Zap className="h-6 w-6" style={{ color: 'var(--armada-primary)' }} />
            </div>
          </div>
          <h2 className="font-serif text-3xl" style={{ color: 'var(--armada-text)' }}>
            Votre escouade est prête.
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'rgba(240,239,234,0.40)' }}>
            {selected.length + 1} agent{selected.length + 1 > 1 ? 's' : ''} opérationnel{selected.length + 1 > 1 ? 's' : ''} pour {form.name || 'votre activité'}.
          </p>
        </motion.div>

        {/* Roster */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="mb-6 space-y-2"
        >
          {/* Major */}
          <motion.div
            variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
            className="flex items-center gap-4 rounded-2xl border-2 px-5 py-3.5"
            style={{
              borderColor: 'color-mix(in srgb, var(--armada-primary) 30%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--armada-primary) 6%, transparent)',
            }}
          >
            <Shield className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--armada-primary)' }} />
            <div className="flex-1 min-w-0">
              <span className="font-serif text-sm" style={{ color: 'var(--armada-text)' }}>
                Le Major
              </span>
              <span
                className="ml-2 text-[9px] font-mono uppercase tracking-widest"
                style={{ color: 'rgba(240,239,234,0.30)' }}
              >
                CMD-00 · Chef des Opérations
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                En ligne
              </span>
            </div>
          </motion.div>

          {/* Specialists */}
          {selected.map(agent => (
            <motion.div
              key={agent.id}
              variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
              className="flex items-center gap-4 rounded-2xl border px-5 py-3.5"
              style={{ borderColor: '#252525', backgroundColor: '#111111' }}
            >
              <Bot className="h-4 w-4 flex-shrink-0" style={{ color: 'rgba(240,239,234,0.25)' }} />
              <div className="flex-1 min-w-0">
                <span className="font-serif text-sm" style={{ color: 'var(--armada-text)' }}>
                  {agent.name}
                </span>
                <span
                  className="ml-2 text-[9px] font-mono uppercase tracking-widest"
                  style={{ color: 'rgba(240,239,234,0.25)' }}
                >
                  {agent.designation} · {agent.role}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* First mission */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mb-8 rounded-2xl border p-5"
          style={{ backgroundColor: '#111111', borderColor: '#1E1E1E' }}
        >
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" style={{ color: 'var(--armada-primary)' }} />
            <span
              className="text-[9px] font-mono uppercase tracking-[0.2em]"
              style={{ color: 'var(--armada-primary)' }}
            >
              Première mission suggérée
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,239,234,0.65)' }}>
            {mission}
          </p>
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          onClick={handleLaunch}
          disabled={launching}
          className="group flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-medium transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-70"
          style={{ backgroundColor: 'var(--armada-primary)', color: '#fff' }}
        >
          {launching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Entrer dans le QG
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </motion.button>

        <p
          className="mt-4 text-center text-[10px] font-mono uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.15)' }}
        >
          Vous pouvez modifier votre équipe à tout moment dans les paramètres
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — Onboarding orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BusinessForm>({ name: '', type: '', description: '' });
  const [agents, setAgents] = useState<Agent[]>([]);

  const goNext = useCallback(() => {
    if (step === 1) {
      const catalog = AGENT_CATALOG[form.type] || AGENT_CATALOG.other;
      setAgents(catalog.map(a => ({ ...a, selected: true })));
    }
    setStep(s => s + 1);
  }, [step, form.type]);

  const goBack = useCallback(() => setStep(s => s - 1), []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0A0A' }}>
      <AnimatePresence mode="wait">
        {step === 0 && <StepWelcome key="s0" onNext={goNext} />}
        {step === 1 && (
          <StepBusiness key="s1" form={form} setForm={setForm} onNext={goNext} onBack={goBack} />
        )}
        {step === 2 && (
          <StepAnalysis key="s2" form={form} onNext={goNext} onBack={goBack} />
        )}
        {step === 3 && (
          <StepTeam key="s3" agents={agents} setAgents={setAgents} onNext={goNext} onBack={goBack} />
        )}
        {step === 4 && (
          <StepReady key="s4" form={form} agents={agents} onBack={goBack} />
        )}
      </AnimatePresence>
    </div>
  );
}
