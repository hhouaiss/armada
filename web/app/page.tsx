'use client';

import Script from 'next/script';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Search,
  Zap,
  Headphones,
  CheckCircle2,
  Activity,
  Shield,
  Play,
  LayoutDashboard,
  Cpu,
  FileText,
  BarChart3,
  Network,
  MessageCircle,
  Smartphone,
  Mail,
  Bell,
  Globe,
  Slack,
  ShoppingBag,
  Chrome,
} from 'lucide-react';

// ── Structured data (JSON-LD) pour SEO/GEO ─────────────────────────
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Armada HQ',
  applicationCategory: 'BusinessApplication',
  description:
    'Plateforme agentique qui permet aux entreprises de déployer une équipe d\'agents IA autonomes pour automatiser leurs opérations métier : recherche, finance, support, marketing, opérations.',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  featureList: [
    'Agents IA autonomes',
    'Automatisation des opérations métier',
    'Orchestration multi-agents',
    'Validation humaine des actions critiques',
    'Compatible tous secteurs',
  ],
  inLanguage: 'fr',
};

// ── Animation helpers ───────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp = (delay = 0): any => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeIn = (delay = 0): any => ({
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, delay, ease: 'easeOut' },
});

// ── Navbar ──────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed top-0 left-0 right-0 z-50 bg-[var(--armada-bg)]/80 backdrop-blur-md border-b border-[var(--armada-accent)]/40"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-serif text-2xl font-semibold tracking-tight text-[var(--armada-text)]">
            armada
          </span>
          <span className="hidden sm:block text-xs font-mono text-[var(--armada-text)]/30 border border-[var(--armada-accent)] px-2 py-0.5 rounded-full">
            HQ v1.0
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--armada-text)]/70">
          <a href="#agents" className="hover:text-[var(--armada-primary)] transition-colors">Agents</a>
          <a href="#comment" className="hover:text-[var(--armada-primary)] transition-colors">Comment ça marche</a>
          <a href="#secteurs" className="hover:text-[var(--armada-primary)] transition-colors">Secteurs</a>
          <a href="#pilotage" className="hover:text-[var(--armada-primary)] transition-colors">Intégrations</a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://calendly.com/meet-alefia/armada-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[var(--armada-text)] text-[var(--armada-bg)] px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[var(--armada-primary)] hover:text-white transition-colors"
          >
            Demander une démo
          </a>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative pt-40 pb-28 overflow-hidden bg-[var(--armada-bg)]"
    >
      {/* Grid décoratif */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--armada-text) 1px, transparent 1px), linear-gradient(90deg, var(--armada-text) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.025,
        }}
      />

      <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center text-center">
        {/* Badge */}
        <motion.div
          {...fadeUp(0)}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--armada-accent)]/60 bg-[var(--armada-surface)]/60 backdrop-blur-sm text-xs font-medium text-[var(--armada-text)]/60 mb-8"
        >
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--armada-primary)] animate-pulse" />
          ArmadaOS 1.0 — Système Opérationnel IA
        </motion.div>

        {/* Headline principal — optimisé SEO/GEO */}
        <motion.h1
          id="hero-heading"
          {...fadeUp(0.1)}
          className="font-serif tracking-tight text-6xl md:text-8xl leading-[0.92] mb-8 max-w-4xl text-[var(--armada-text)]"
        >
          Dirigez,{' '}
          <br className="hidden md:block" />
          <em style={{ fontStyle: 'italic', color: 'var(--armada-primary)' }}>
            Armada exécute.
          </em>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          {...fadeUp(0.2)}
          className="text-lg md:text-xl text-[var(--armada-text)]/60 max-w-2xl mb-12 leading-relaxed"
        >
          Armada déploie une équipe d'agents IA autonomes qui exécutent vos
          opérations métier — recherche, finance, support, marketing — pendant
          que vous pilotez votre entreprise.
        </motion.p>

        {/* CTAs */}
        <motion.div {...fadeUp(0.3)} className="flex flex-col sm:flex-row items-center gap-4">
          <a
            href="https://calendly.com/meet-alefia/armada-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[var(--armada-primary)] text-white px-8 py-4 rounded-full text-base font-medium hover:opacity-90 transition-all shadow-[0_0_40px_rgba(26,46,255,0.25)]"
          >
            Demander une démo <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
          <a
            href="https://calendly.com/meet-alefia/armada-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[var(--armada-surface)] border border-[var(--armada-accent)] text-[var(--armada-text)] px-8 py-4 rounded-full text-base font-medium hover:bg-[var(--armada-surface-hover)] transition-all"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            Voir la démo
          </a>
        </motion.div>

        {/* Réassurance */}
        <motion.div
          {...fadeUp(0.4)}
          className="mt-14 flex flex-wrap justify-center items-center gap-x-6 gap-y-3 text-sm text-[var(--armada-text)]/40"
        >
          {[
            'Aucune compétence technique requise',
            'Vos données restent les vôtres',
            'Opérationnel en 5 minutes',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="hidden sm:block w-px h-4 bg-[var(--armada-accent)]" />}
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Agents — archetypal & généralistes ─────────────────────────────
const agents = [
  {
    icon: <Search className="w-6 h-6" aria-hidden="true" />,
    name: 'Analyste',
    role: 'Veille & Intelligence',
    desc: 'Surveille votre marché, analyse la concurrence et synthétise des rapports actionnables. Vos décisions stratégiques, alimentées par des données fraîches.',
    sectors: ['Conseil', 'Finance', 'Retail'],
  },
  {
    icon: <Zap className="w-6 h-6" aria-hidden="true" />,
    name: 'Opérations',
    role: 'Automatisation & Processus',
    desc: 'Prend en charge les tâches récurrentes à faible valeur : saisies, relances, mises à jour, synchronisations. Vos équipes se concentrent sur ce qui compte.',
    sectors: ['Logistique', 'Services B2B', 'RH'],
  },
  {
    icon: <BarChart3 className="w-6 h-6" aria-hidden="true" />,
    name: 'Finance',
    role: 'Reporting & KPIs',
    desc: 'Agrège vos données financières, détecte les anomalies et génère vos reportings. Vos chiffres sont prêts, toujours à jour, sans effort.',
    sectors: ['PME', 'Conseil', 'E-commerce'],
  },
  {
    icon: <Headphones className="w-6 h-6" aria-hidden="true" />,
    name: 'Support',
    role: 'Relation Client & Qualification',
    desc: 'Répond aux demandes fréquentes, qualifie les leads entrants et escalade ce qui requiert votre attention. Chaque client reçoit une réponse immédiate.',
    sectors: ['SaaS', 'Immobilier', 'E-commerce'],
  },
  {
    icon: <FileText className="w-6 h-6" aria-hidden="true" />,
    name: 'Marketing',
    role: 'Contenu & Communication',
    desc: 'Rédige articles, posts, emailings et fiches produit optimisés pour le référencement. Votre présence digitale, maintenue sans effort.',
    sectors: ['Agences', 'Startups', 'Retail'],
  },
  {
    icon: <Cpu className="w-6 h-6" aria-hidden="true" />,
    name: 'Le Major',
    role: 'Orchestrateur en Chef',
    desc: 'Coordonne l\'ensemble de l\'escouade, délègue les missions aux bons agents et synthétise les résultats. Votre chef des opérations IA.',
    sectors: ['Tous secteurs'],
    commander: true,
  },
];

function AgentRoster() {
  return (
    <section
      id="agents"
      aria-labelledby="agents-heading"
      className="py-24 bg-[var(--armada-surface)] border-y border-[var(--armada-accent)]/40"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16 max-w-3xl">
          <p className="text-xs font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-4">
            Votre escouade
          </p>
          <h2
            id="agents-heading"
            className="font-serif tracking-tight text-4xl md:text-5xl text-[var(--armada-text)] mb-6"
          >
            Des agents spécialisés.{' '}
            <br className="hidden md:block" />
            Un seul commandant.
          </h2>
          <p className="text-lg text-[var(--armada-text)]/60 leading-relaxed">
            Chaque agent maîtrise son domaine. Le Major coordonne l'ensemble.
            Vous gardez le dernier mot sur chaque décision critique.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent, idx) => (
            <motion.article
              key={agent.name}
              {...fadeIn(idx * 0.07)}
              whileHover={{ y: -4 }}
              className={`p-7 rounded-2xl border transition-all duration-300 group ${
                agent.commander
                  ? 'border-[var(--armada-primary)]/30 bg-[var(--armada-primary)]/5 md:col-span-2 lg:col-span-1'
                  : 'border-[var(--armada-accent)]/50 bg-[var(--armada-bg)]/40 hover:bg-[var(--armada-surface)] hover:shadow-xl hover:border-[var(--armada-primary)]/20'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-5 transition-colors ${
                  agent.commander
                    ? 'bg-[var(--armada-primary)] text-white'
                    : 'bg-[var(--armada-surface)] border border-[var(--armada-accent)] text-[var(--armada-text)]/60 group-hover:text-[var(--armada-primary)] group-hover:border-[var(--armada-primary)]/30'
                }`}
              >
                {agent.icon}
              </div>

              <h3 className="font-serif text-xl font-medium text-[var(--armada-text)] mb-0.5">
                {agent.name}
              </h3>
              <p className="text-xs font-mono text-[var(--armada-primary)] mb-3">{agent.role}</p>
              <p className="text-sm text-[var(--armada-text)]/60 leading-relaxed mb-4">{agent.desc}</p>

              {/* Secteurs */}
              <div className="flex flex-wrap gap-1.5">
                {agent.sectors.map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2 py-0.5 rounded-full border border-[var(--armada-accent)]/60 text-[var(--armada-text)]/40 font-mono"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </motion.article>
          ))}
        </div>

        {/* Note généraliste */}
        <motion.p
          {...fadeIn(0.3)}
          className="mt-10 text-center text-sm text-[var(--armada-text)]/40"
        >
          Le Major peut recruter de nouveaux agents spécialisés à tout moment — selon vos besoins métier.
        </motion.p>
      </div>
    </section>
  );
}

// ── Secteurs cibles ─────────────────────────────────────────────────
const sectors = [
  {
    name: 'E-commerce',
    desc: 'Automatisez la gestion catalogue, les stocks, la relation client et le marketing produit.',
  },
  {
    name: 'Conseil & Audit',
    desc: 'Industrialisez la veille, la production de livrables et le reporting client.',
  },
  {
    name: 'Immobilier',
    desc: 'Qualifiez les leads entrants, rédigez les annonces et suivez les dossiers en automatique.',
  },
  {
    name: 'Services B2B',
    desc: 'Automatisez les relances, la qualification commerciale et le support avant-vente.',
  },
];

function Sectors() {
  return (
    <section
      id="secteurs"
      aria-labelledby="sectors-heading"
      className="py-24 bg-[var(--armada-bg)] border-b border-[var(--armada-accent)]/40"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-6">
          <div>
            <p className="text-xs font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-3">
              Secteurs
            </p>
            <h2
              id="sectors-heading"
              className="font-serif tracking-tight text-4xl md:text-5xl text-[var(--armada-text)]"
            >
              Conçu pour chaque industrie.
            </h2>
          </div>
          <p className="text-[var(--armada-text)]/50 max-w-xs text-sm leading-relaxed">
            Armada s'adapte à votre métier, vos outils et vos processus existants — sans refonte.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--armada-accent)]/40 border border-[var(--armada-accent)]/40 rounded-2xl overflow-hidden">
          {sectors.map((s, idx) => (
            <motion.div
              key={idx}
              {...fadeIn(idx * 0.08)}
              className="bg-[var(--armada-surface)] p-10 hover:bg-[var(--armada-bg)]/60 transition-colors"
            >
              <h3 className="font-serif text-2xl text-[var(--armada-text)] mb-3">{s.name}</h3>
              <p className="text-[var(--armada-text)]/60 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Comment ça marche ───────────────────────────────────────────────
const steps = [
  {
    num: '01',
    title: 'Définissez votre objectif',
    desc: 'Exprimez votre besoin en langage naturel. Armada le traduit en mission structurée, sans configuration technique.',
  },
  {
    num: '02',
    title: 'Le Major orchestre',
    desc: 'Votre chef des opérations IA sélectionne les agents adaptés, leur assigne les tâches et lance la mission.',
  },
  {
    num: '03',
    title: 'Les agents exécutent',
    desc: 'Chaque agent accède à vos outils et données, prend des décisions et produit des résultats mesurables.',
  },
  {
    num: '04',
    title: 'Vous gardez le contrôle',
    desc: 'Les actions critiques sont soumises à votre validation. Vous approuvez, modifiez ou refusez en un clic.',
  },
];

function HowItWorks() {
  return (
    <section
      id="comment"
      aria-labelledby="how-heading"
      className="py-24 md:py-32 bg-[var(--armada-surface)] border-y border-[var(--armada-accent)]/40"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-4">
              Processus
            </p>
            <h2
              id="how-heading"
              className="font-serif tracking-tight text-4xl md:text-5xl text-[var(--armada-text)] mb-12"
            >
              De l'intention à l'exécution.
            </h2>
            <div className="space-y-8">
              {steps.map((step, idx) => (
                <motion.div key={idx} {...fadeIn(idx * 0.1)} className="flex gap-6">
                  <div className="text-sm font-mono text-[var(--armada-primary)] pt-0.5 shrink-0 w-6">
                    {step.num}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--armada-text)] mb-1.5">{step.title}</h3>
                    <p className="text-[var(--armada-text)]/60 leading-relaxed text-sm">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Orbital diagram */}
          <motion.div {...fadeIn(0.2)} className="relative flex items-center justify-center">
            <div className="w-full max-w-sm aspect-square rounded-full border border-[var(--armada-accent)] relative flex items-center justify-center bg-[var(--armada-bg)]/40">
              <div
                aria-hidden="true"
                className="absolute inset-4 rounded-full border border-[var(--armada-accent)]/50 border-dashed"
                style={{ animation: 'spin 60s linear infinite' }}
              />
              <div aria-hidden="true" className="absolute inset-12 rounded-full border border-[var(--armada-accent)]/30" />

              {/* Centre */}
              <div className="w-28 h-28 rounded-full bg-[var(--armada-text)] text-[var(--armada-bg)] flex flex-col items-center justify-center z-10 shadow-2xl">
                <Cpu className="w-7 h-7 mb-1.5" aria-hidden="true" />
                <span className="font-serif text-sm">Le Major</span>
              </div>

              {/* Nœuds orbitants */}
              {[
                { icon: <Search className="w-4 h-4" />, duration: 18 },
                { icon: <BarChart3 className="w-4 h-4" />, duration: 24 },
                { icon: <Headphones className="w-4 h-4" />, duration: 21 },
                { icon: <Zap className="w-4 h-4" />, duration: 27 },
              ].map((node, i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ duration: node.duration, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 z-20"
                  style={{ transform: `rotate(${i * 90}deg)` }}
                  aria-hidden="true"
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[var(--armada-surface)] border border-[var(--armada-accent)] flex items-center justify-center shadow-sm text-[var(--armada-primary)]">
                    {node.icon}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── Dashboard mockup ────────────────────────────────────────────────
const missions = [
  { name: 'Analyse concurrentielle — Secteur SaaS', agent: 'Analyste — Veille', status: 'En cours', progress: 75 },
  { name: 'Rapport financier hebdomadaire', agent: 'Finance — Reporting', status: 'En attente de validation', highlight: true, progress: 90 },
  { name: 'Qualification des leads entrants', agent: 'Support — Relation Client', status: 'En cours', progress: 45 },
];

function CommandCenterPreview() {
  return (
    <section
      aria-labelledby="dashboard-heading"
      className="py-24 bg-[var(--armada-bg)] border-b border-[var(--armada-accent)]/40"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-xs font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-4">
            Tableau de bord
          </p>
          <h2
            id="dashboard-heading"
            className="font-serif tracking-tight text-4xl md:text-5xl text-[var(--armada-text)] mb-6"
          >
            Supervisez. Validez. Décidez.
          </h2>
          <p className="text-lg text-[var(--armada-text)]/60 max-w-2xl mx-auto">
            Un dashboard unifié pour piloter vos agents, consulter leurs raisonnements
            et approuver les actions importantes.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-5xl mx-auto bg-[var(--armada-bg)] rounded-2xl border border-[var(--armada-accent)] shadow-2xl overflow-hidden"
          role="img"
          aria-label="Aperçu du tableau de bord Armada HQ"
        >
          {/* Chrome */}
          <div className="h-12 border-b border-[var(--armada-accent)] flex items-center px-5 gap-3 bg-[var(--armada-surface-hover)]">
            <div className="flex gap-1.5" aria-hidden="true">
              <div className="w-3 h-3 rounded-full bg-red-400/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-400/70" />
              <div className="w-3 h-3 rounded-full bg-green-400/70" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-[var(--armada-surface)] border border-[var(--armada-accent)]/50 px-4 py-1 rounded-md text-xs font-mono text-[var(--armada-text)]/40 flex items-center gap-2">
                <Shield className="w-3 h-3" aria-hidden="true" /> armada-hq.internal
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex h-[460px]">
            {/* Sidebar */}
            <nav aria-label="Navigation du tableau de bord" className="w-56 border-r border-[var(--armada-accent)] p-3 hidden md:block bg-[var(--armada-surface)]">
              <div className="space-y-0.5">
                {[
                  { label: "Vue d'ensemble", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
                  { label: 'Missions actives', icon: <Activity className="w-3.5 h-3.5" />, active: true },
                  { label: 'Escouade', icon: <Network className="w-3.5 h-3.5" /> },
                  { label: 'Validations', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                  { label: 'Paramètres', icon: <Shield className="w-3.5 h-3.5" /> },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2.5 cursor-default ${
                      item.active
                        ? 'bg-[var(--armada-text)] text-[var(--armada-bg)]'
                        : 'text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
                    }`}
                    aria-current={item.active ? 'page' : undefined}
                  >
                    {item.icon}
                    {item.label}
                  </div>
                ))}
              </div>
            </nav>

            {/* Main */}
            <div className="flex-1 p-7 bg-[var(--armada-bg)] overflow-hidden">
              <div className="flex items-center justify-between mb-7">
                <div>
                  <h3 className="font-serif text-lg text-[var(--armada-text)] mb-0.5">Missions actives</h3>
                  <p className="text-xs text-[var(--armada-text)]/40 font-mono">3 agents déployés</p>
                </div>
                <button className="bg-[var(--armada-primary)] text-white px-4 py-1.5 rounded-lg text-xs font-medium">
                  + Nouvelle mission
                </button>
              </div>

              <ul className="space-y-3">
                {missions.map((m, i) => (
                  <li
                    key={i}
                    className={`p-4 rounded-xl border flex items-center justify-between ${
                      m.highlight
                        ? 'border-[var(--armada-primary)]/40 bg-[var(--armada-primary)]/5'
                        : 'border-[var(--armada-accent)] bg-[var(--armada-surface)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${m.highlight ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--armada-text)] truncate">{m.name}</div>
                        <div className="text-xs text-[var(--armada-text)]/40 font-mono mt-0.5">{m.agent}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 shrink-0 ml-4">
                      <div className="text-xs font-mono text-[var(--armada-text)]/40 hidden sm:block">{m.status}</div>
                      {m.highlight ? (
                        <button className="bg-[var(--armada-text)] text-[var(--armada-bg)] px-3 py-1 rounded text-xs font-medium">
                          Valider
                        </button>
                      ) : (
                        <div className="w-16 h-1 bg-[var(--armada-accent)] rounded-full overflow-hidden" aria-hidden="true">
                          <div className="h-full bg-[var(--armada-primary)] rounded-full" style={{ width: `${m.progress}%` }} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Pilotage & Intégrations ─────────────────────────────────────────

// Canaux de pilotage — comment le dirigeant interagit avec ses agents
const channels = [
  {
    icon: <MessageCircle className="w-5 h-5" aria-hidden="true" />,
    name: 'Telegram',
    desc: 'Recevez des alertes, validez des actions et interrogez vos agents directement dans Telegram.',
    status: 'Disponible',
    color: '#229ED9',
  },
  {
    icon: <MessageCircle className="w-5 h-5" aria-hidden="true" />,
    name: 'WhatsApp',
    desc: 'Pilotez vos opérations depuis WhatsApp. Répondez "oui" pour approuver une action critique.',
    status: 'Bientôt',
    color: '#25D366',
  },
  {
    icon: <Smartphone className="w-5 h-5" aria-hidden="true" />,
    name: 'Application mobile',
    desc: "Dashboard natif iOS & Android. Notifications push pour chaque validation requise.",
    status: 'Bientôt',
    color: 'var(--armada-primary)',
  },
  {
    icon: <Globe className="w-5 h-5" aria-hidden="true" />,
    name: 'Interface web',
    desc: "Le Quartier Général complet, accessible depuis n'importe quel navigateur.",
    status: 'Disponible',
    color: 'var(--armada-primary)',
  },
];

// Intégrations — outils auxquels les agents peuvent accéder
const integrations = [
  { icon: <Mail className="w-5 h-5" aria-hidden="true" />, name: 'Gmail / Outlook', desc: 'Lecture, rédaction et envoi d\'emails en votre nom.', color: '#EA4335' },
  { icon: <Slack className="w-5 h-5" aria-hidden="true" />, name: 'Slack', desc: 'Notifications d\'équipe, rapports automatiques dans vos canaux.', color: '#4A154B' },
  { icon: <ShoppingBag className="w-5 h-5" aria-hidden="true" />, name: 'Shopify', desc: 'Catalogue, commandes, clients — accès natif à votre boutique.', color: '#96BF48' },
  { icon: <Chrome className="w-5 h-5" aria-hidden="true" />, name: 'Google Workspace', desc: 'Sheets, Docs, Drive — vos agents lisent et écrivent vos fichiers.', color: '#4285F4' },
  { icon: <BarChart3 className="w-5 h-5" aria-hidden="true" />, name: 'Google Analytics', desc: 'Analyse du trafic et des conversions à la demande.', color: '#F9AB00' },
  { icon: <Bell className="w-5 h-5" aria-hidden="true" />, name: 'Webhooks & API', desc: 'Connectez n\'importe quel outil via webhook ou API REST.', color: 'var(--armada-text)' },
];

function Pilotage() {
  return (
    <section
      id="pilotage"
      aria-labelledby="pilotage-heading"
      className="py-24 md:py-32 bg-[var(--armada-surface)] border-y border-[var(--armada-accent)]/40"
    >
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="mb-16 max-w-3xl">
          <p className="text-xs font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-4">
            Pilotage multi-canal
          </p>
          <h2
            id="pilotage-heading"
            className="font-serif tracking-tight text-4xl md:text-5xl text-[var(--armada-text)] mb-6"
          >
            Pilotez depuis partout.{' '}
            <br className="hidden md:block" />
            <em style={{ fontStyle: 'italic', color: 'var(--armada-primary)' }}>
              Vos outils, déjà connectés.
            </em>
          </h2>
          <p className="text-lg text-[var(--armada-text)]/60 leading-relaxed">
            Vos agents vous envoient des alertes, attendent votre validation et agissent —
            sur Telegram, WhatsApp ou votre app mobile. Sans changer vos habitudes.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Canaux de pilotage */}
          <div>
            <h3 className="font-serif text-xl text-[var(--armada-text)] mb-6">
              Commandez depuis vos apps préférées
            </h3>
            <div className="space-y-3">
              {channels.map((ch, idx) => (
                <motion.div
                  key={ch.name}
                  {...fadeIn(idx * 0.07)}
                  className="flex items-start gap-4 p-5 rounded-2xl border border-[var(--armada-accent)]/50 bg-[var(--armada-bg)]/60 hover:border-[var(--armada-accent)] hover:shadow-md transition-all duration-300"
                >
                  {/* Icône colorée */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                    style={{ backgroundColor: ch.color }}
                  >
                    {ch.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[var(--armada-text)]">{ch.name}</span>
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                          ch.status === 'Disponible'
                            ? 'border-green-500/20 bg-green-500/10 text-green-600'
                            : 'border-[var(--armada-accent)] text-[var(--armada-text)]/40'
                        }`}
                      >
                        {ch.status}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--armada-text)]/60 leading-relaxed">{ch.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Message de validation en contexte */}
            <motion.div
              {...fadeIn(0.4)}
              className="mt-6 p-5 rounded-2xl border border-[var(--armada-primary)]/20 bg-[var(--armada-primary)]/5"
            >
              <p className="text-xs font-mono text-[var(--armada-primary)] mb-3 uppercase tracking-wider">
                Exemple — Validation Telegram
              </p>
              <div className="space-y-2">
                {[
                  { from: 'Le Major', msg: '⚠️ Marcus veut ajuster les prix de 47 produits (+8%). Budget estimé : impact +12k€/mois. Valider ?', align: 'left' },
                  { from: 'Vous', msg: 'Oui, valide.', align: 'right' },
                  { from: 'Le Major', msg: '✅ Marcus a mis à jour les 47 produits. Rapport disponible dans le QG.', align: 'left' },
                ].map((bubble, i) => (
                  <div key={i} className={`flex ${bubble.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                        bubble.align === 'right'
                          ? 'bg-[var(--armada-primary)] text-white rounded-br-sm'
                          : 'bg-[var(--armada-surface)] border border-[var(--armada-accent)]/60 text-[var(--armada-text)]/80 rounded-bl-sm'
                      }`}
                    >
                      {bubble.align === 'left' && (
                        <span className="block text-[var(--armada-primary)] font-mono mb-0.5" style={{ fontSize: '10px' }}>
                          {bubble.from}
                        </span>
                      )}
                      {bubble.msg}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Intégrations outils */}
          <div>
            <h3 className="font-serif text-xl text-[var(--armada-text)] mb-6">
              Vos agents accèdent à vos outils
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {integrations.map((integ, idx) => (
                <motion.div
                  key={integ.name}
                  {...fadeIn(idx * 0.07)}
                  whileHover={{ y: -3 }}
                  className="p-5 rounded-2xl border border-[var(--armada-accent)]/50 bg-[var(--armada-bg)]/60 hover:bg-[var(--armada-surface)] hover:shadow-md transition-all duration-300 group"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 text-white shrink-0"
                    style={{ backgroundColor: integ.color === 'var(--armada-text)' ? 'var(--armada-text)' : integ.color }}
                  >
                    {integ.icon}
                  </div>
                  <div className="text-sm font-semibold text-[var(--armada-text)] mb-1">{integ.name}</div>
                  <div className="text-xs text-[var(--armada-text)]/50 leading-relaxed">{integ.desc}</div>
                </motion.div>
              ))}
            </div>

            {/* Note d'extensibilité */}
            <motion.p {...fadeIn(0.5)} className="mt-6 text-sm text-[var(--armada-text)]/40 text-center">
              + Des dizaines d'intégrations supplémentaires via notre marketplace.
            </motion.p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA final ───────────────────────────────────────────────────────
function CTA() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="py-32 relative overflow-hidden bg-[var(--armada-surface)]"
    >
      <div aria-hidden="true" className="absolute inset-0 z-0 bg-gradient-to-b from-transparent to-[var(--armada-primary)]/5 pointer-events-none" />
      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <motion.p {...fadeIn()} className="text-xs font-mono text-[var(--armada-primary)] uppercase tracking-widest mb-6">
          Prêt à automatiser ?
        </motion.p>
        <motion.h2
          id="cta-heading"
          {...fadeIn(0.1)}
          className="font-serif tracking-tight text-5xl md:text-7xl text-[var(--armada-text)] mb-6"
        >
          Pendant que vous lisez,<br />
          <em style={{ fontStyle: 'italic', color: 'var(--armada-primary)' }}>
            vos concurrents automatisent.
          </em>
        </motion.h2>
        <motion.p {...fadeIn(0.2)} className="text-xl text-[var(--armada-text)]/60 mb-10">
          Déployez vos premiers agents IA en moins de 5 minutes.
        </motion.p>
        <motion.div {...fadeIn(0.3)}>
          <a
            href="https://calendly.com/meet-alefia/armada-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[var(--armada-text)] text-[var(--armada-bg)] px-10 py-5 rounded-full text-lg font-medium hover:bg-[var(--armada-primary)] hover:text-white transition-all shadow-xl hover:shadow-[0_0_40px_rgba(26,46,255,0.3)]"
          >
            Demander une démo <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────
function Footer() {
  const nav = {
    Produit: ['Centre de Commandement', 'Escouade', 'Intégrations', 'Sécurité'],
    Entreprise: ['À propos', 'Blog', 'Carrières', 'Clients'],
    Contact: ['Commercial', 'Support', 'Twitter', 'LinkedIn'],
  };

  return (
    <footer className="bg-[var(--armada-bg)] border-t border-[var(--armada-accent)]/50 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="font-serif text-xl font-semibold tracking-tight text-[var(--armada-text)] mb-2">
              armada
            </div>
            <p className="text-sm text-[var(--armada-text)]/40 leading-relaxed">
              Votre équipe IA.<br />Déployée en minutes.
            </p>
          </div>
          {Object.entries(nav).map(([group, links]) => (
            <div key={group}>
              <h4 className="font-medium text-sm text-[var(--armada-text)] mb-4">{group}</h4>
              <ul className="space-y-2.5 text-sm text-[var(--armada-text)]/50">
                {links.map((item) => (
                  <li key={item}>
                    <a href="#" className="hover:text-[var(--armada-text)] transition-colors">{item}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--armada-accent)]/30 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-[var(--armada-text)]/30">
          <div>&copy; {new Date().getFullYear()} Armada Inc. Tous droits réservés.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-[var(--armada-text)] transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-[var(--armada-text)] transition-colors">Conditions d'utilisation</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Page principale ─────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
      {/* JSON-LD structuré pour SEO/GEO */}
      <Script
        id="armada-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div
        style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
        className="min-h-screen font-sans"
      >
        <Navbar />
        <main>
          <Hero />
          <AgentRoster />
          <Sectors />
          <HowItWorks />
          <CommandCenterPreview />
          <Pilotage />
          <CTA />
        </main>
        <Footer />
      </div>
    </>
  );
}
