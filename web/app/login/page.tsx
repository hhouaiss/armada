'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Mail, Chrome } from 'lucide-react';

// ── Login form — logic untouched, classes updated ────────────────
function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/hq';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    // i18n: Authentication failed / Invalid login link
    errorParam === 'auth_failed' ? "Échec de l'authentification. Veuillez réessayer." :
    errorParam === 'missing_code' ? 'Lien de connexion invalide. Veuillez réessayer.' : null
  );

  const supabase = createClient();

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setGoogleLoading(false);
      setError(error.message);
    }
  }

  if (sent) {
    return (
      <div className="text-center space-y-5 animate-fadeIn">
        <div className="w-14 h-14 rounded-full bg-[var(--armada-primary-soft)] border border-[var(--armada-primary)]/20 flex items-center justify-center mx-auto">
          <Mail className="w-6 h-6 text-[var(--armada-primary)]" />
        </div>
        <div className="space-y-2">
          {/* i18n: Check your inbox */}
          <h2 className="font-serif text-xl text-[var(--armada-text)] tracking-tight">
            Vérifiez votre boîte mail
          </h2>
          {/* i18n: Magic link sent to {email}. Click the link to access your HQ. */}
          <p className="text-sm text-[var(--armada-text)]/50 max-w-xs mx-auto leading-relaxed">
            Lien magique envoyé à{' '}
            <span className="text-[var(--armada-text)] font-medium">{email}</span>.
            Cliquez sur le lien pour accéder à votre QG.
          </p>
        </div>
        {/* i18n: Use a different email */}
        <button
          onClick={() => { setSent(false); setEmail(''); }}
          className="text-xs text-[var(--armada-primary)] hover:underline underline-offset-2 font-sans"
        >
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-500 font-mono">
          {error}
        </div>
      )}

      {/* i18n: Continue with Google */}
      <button
        onClick={handleGoogleLogin}
        disabled={googleLoading || loading}
        className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-full border border-[var(--armada-accent)] bg-[var(--armada-surface)] hover:bg-[var(--armada-surface-hover)] hover:border-[var(--armada-border-strong)] transition-all text-sm font-sans text-[var(--armada-text)] disabled:opacity-40"
      >
        {googleLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-[var(--armada-text)]/50" />
        ) : (
          <Chrome className="w-4 h-4 text-[var(--armada-text)]/60" />
        )}
        Continuer avec Google
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[var(--armada-accent)]/50" />
        {/* i18n: OR */}
        <span className="text-xs text-[var(--armada-text)]/30 font-mono tracking-widest">OU</span>
        <div className="flex-1 h-px bg-[var(--armada-accent)]/50" />
      </div>

      {/* Email magic link */}
      <form onSubmit={handleEmailLogin} className="space-y-3">
        {/* i18n: you@example.com */}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          required
          className="w-full px-5 py-3 rounded-full bg-[var(--armada-surface)] border border-[var(--armada-accent)] text-[var(--armada-text)] text-sm font-sans placeholder-[var(--armada-text)]/30 focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-1 focus:ring-[var(--armada-primary)]/20 transition-all"
        />
        {/* i18n: Send Magic Link */}
        <button
          type="submit"
          disabled={loading || googleLoading || !email}
          className="armada-btn-primary w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[var(--armada-primary)] hover:opacity-90 text-white text-sm font-medium font-sans transition-all disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          Envoyer le lien magique
        </button>
      </form>
    </div>
  );
}

// Feature list for the editorial panel
const features = [
  { label: 'Agents autonomes', sub: 'Missions actives en continu' },
  // i18n: Command Center / Real-time visibility
  { label: 'Centre de commandement', sub: 'Visibilité en temps réel' },
  // i18n: Native integrations / Shopify, GSC, and more
  { label: 'Intégrations natives', sub: 'Shopify, GSC, et plus' },
];

// ── Page layout — editorial split design ─────────────────────────
export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-[var(--armada-bg)]">

      {/* Left — brand editorial panel (always dark, mode-independent) */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between p-16 bg-[#111111] relative overflow-hidden">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#F5F4EF 1px, transparent 1px), linear-gradient(90deg, #F5F4EF 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Top — logo */}
        <div className="relative z-10">
          <span className="font-serif text-2xl italic text-[#F0EFEA] tracking-tight">
            armada
          </span>
          <span className="ml-2 font-mono text-[10px] text-[#F0EFEA]/30 tracking-widest uppercase align-middle">
            HQ
          </span>
        </div>

        {/* Middle — editorial heading */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <p className="font-mono text-xs text-[#F0EFEA]/40 tracking-widest uppercase">
              ArmadaOS 1.0
            </p>
            {/* i18n: Deploy your AI workforce. */}
            <h1 className="font-serif text-5xl xl:text-6xl text-[#F0EFEA] leading-[1.1] tracking-tight">
              Déployez votre{' '}
              <span className="italic">équipe IA.</span>
            </h1>
            {/* i18n: Orchestrate intelligent agents that run your business operations — automatically, around the clock. */}
            <p className="text-[#F0EFEA]/50 text-base leading-relaxed max-w-sm font-sans font-light">
              Orchestrez des agents intelligents qui gèrent vos opérations — automatiquement, 24h/24.
            </p>
          </div>

          <div className="space-y-3">
            {features.map(({ label, sub }) => (
              <div key={label} className="flex items-center gap-4 group">
                <div className="w-1 h-1 rounded-full bg-[#F0EFEA]/30 group-hover:bg-[#F0EFEA]/60 transition-colors" />
                <div>
                  <span className="text-sm font-medium text-[#F0EFEA]/80 font-sans">{label}</span>
                  <span className="text-xs text-[#F0EFEA]/40 font-sans ml-2">{sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — version badge */}
        <div className="relative z-10">
          <span className="font-mono text-[10px] text-[#F0EFEA]/25 tracking-widest">
            v1.0.0 — ALPHA
          </span>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-sm space-y-8 animate-fadeIn">

          {/* Mobile-only logo */}
          <div className="lg:hidden text-center">
            <span className="font-serif text-2xl italic text-[var(--armada-text)] tracking-tight">
              armada
            </span>
            <span className="ml-2 font-mono text-[10px] text-[var(--armada-text)]/30 tracking-widest uppercase align-middle">
              HQ
            </span>
          </div>

          {/* Form card */}
          <div className="armada-card rounded-2xl border border-[var(--armada-accent)]/60 bg-[var(--armada-surface)] p-8 space-y-6">
            <div className="space-y-1">
              {/* i18n: Access your HQ */}
              <h2 className="font-serif text-2xl text-[var(--armada-text)] tracking-tight">
                Accédez à votre QG
              </h2>
              {/* i18n: Sign in to deploy and manage your AI agents. */}
              <p className="text-sm text-[var(--armada-text)]/45 font-sans leading-relaxed">
                Connectez-vous pour déployer et gérer vos agents IA.
              </p>
            </div>

            <Suspense
              fallback={
                <div className="space-y-3">
                  <div className="animate-pulse h-11 bg-[var(--armada-surface-hover)] rounded-full" />
                  <div className="animate-pulse h-11 bg-[var(--armada-surface-hover)] rounded-full" />
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </div>

          {/* Footer hints */}
          <div className="flex items-center justify-center gap-4 text-xs text-[var(--armada-text)]/25 font-mono">
            {/* i18n: No password / Secure login / Google OAuth */}
            <span>Sans mot de passe</span>
            <span className="w-px h-3 bg-[var(--armada-accent)]" />
            <span>Connexion sécurisée</span>
            <span className="w-px h-3 bg-[var(--armada-accent)]" />
            <span>Google OAuth</span>
          </div>
        </div>
      </div>
    </div>
  );
}
