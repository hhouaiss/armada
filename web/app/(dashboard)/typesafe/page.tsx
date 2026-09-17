'use client';

import { Fragment, useState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
  return body;
};

const WINDOWS = [
  { days: 1, label: '24 h' },
  { days: 7, label: '7 j' },
  { days: 30, label: '30 j' },
] as const;

const FEATURES: Record<string, { label: string; description: string; outcomes: string[] }> = {
  dispatch: {
    label: 'Délégation',
    description: 'Chaque délégation du Major : nom du spécialiste, bon spécialiste, sync ou async.',
    outcomes: ['name_resolved', 'name_low_confidence', 'name_no_match', 'mode_upgraded', 'misroute_flagged', 'fit_ok', 'fallback_error'],
  },
  output_review: {
    label: 'Contrôle qualité',
    description: 'Chaque réponse d’agent est relue par Jev. Un problème corrigeable (livrable manquant, affirmations non étayées…) déclenche une correction automatique par l’agent ; les défauts récurrents deviennent des règles de coaching.',
    outcomes: ['rating:good', 'rating:weak', 'rating:poor', 'flag:unsupported_claims', 'flag:hidden_tool_error', 'flag:language', 'flag:livrable', 'flag:livrable_missing', 'correction_requested', 'correction_fixed', 'correction_failed', 'notion_read', 'notion_unreadable', 'lesson_added', 'lesson_retired', 'memory_saved', 'fallback_error'],
  },
  approval_risk: {
    label: 'Risque des approbations',
    description: 'Évaluation indépendante du risque déclaré par l’agent. Jev peut relever le niveau, jamais le baisser.',
    outcomes: ['risk_raised', 'risk_agreed', 'risk_higher_uncertain', 'risk_lower_than_claimed', 'fallback_error'],
  },
};

const OUTCOMES: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  name_resolved: { label: 'Nom corrigé', tone: 'good' },
  name_low_confidence: { label: 'Nom : confiance faible', tone: 'warn' },
  name_no_match: { label: 'Nom : aucun match', tone: 'neutral' },
  mode_upgraded: { label: 'Passé en async', tone: 'good' },
  mode_kept: { label: 'Mode conservé', tone: 'neutral' },
  misroute_flagged: { label: 'Mauvais spécialiste signalé', tone: 'warn' },
  fit_ok: { label: 'Bon spécialiste', tone: 'neutral' },
  risk_raised: { label: 'Risque relevé', tone: 'warn' },
  risk_agreed: { label: 'Risque confirmé', tone: 'good' },
  risk_higher_uncertain: { label: 'Plus risqué (incertain)', tone: 'neutral' },
  risk_lower_than_claimed: { label: 'Moins risqué que déclaré', tone: 'neutral' },
  fallback_error: { label: 'Erreur, repli', tone: 'bad' },
  'rating:good': { label: 'Bonne réponse', tone: 'good' },
  'rating:weak': { label: 'Réponse moyenne', tone: 'warn' },
  'rating:poor': { label: 'Réponse faible', tone: 'bad' },
  'flag:unsupported_claims': { label: 'Affirmations non étayées', tone: 'bad' },
  'flag:hidden_tool_error': { label: 'Échec d’outil masqué', tone: 'bad' },
  'flag:language': { label: 'Mauvaise langue', tone: 'bad' },
  'flag:livrable': { label: 'Livrable inutilisable', tone: 'bad' },
  'flag:livrable_missing': { label: 'Livrable manquant', tone: 'bad' },
  correction_requested: { label: 'Correction demandée', tone: 'warn' },
  correction_fixed: { label: 'Corrigé par l’agent', tone: 'good' },
  correction_failed: { label: 'Correction insuffisante', tone: 'bad' },
  notion_read: { label: 'Pages Notion relues', tone: 'good' },
  notion_unreadable: { label: 'Notion illisible', tone: 'warn' },
  memory_saved: { label: 'Mémorisé chez l’agent', tone: 'neutral' },
  weakness: { label: 'Défaut', tone: 'neutral' },
  lesson_added: { label: 'Règle ajoutée', tone: 'warn' },
  lesson_retired: { label: 'Règle retirée', tone: 'good' },
};

const WEAKNESS_LABELS: Record<string, string> = {
  none: 'Aucun',
  incomplete: 'Incomplet',
  unsupported_claims: 'Non étayé',
  too_generic: 'Trop générique',
  ignored_tool_error: 'Erreur d’outil ignorée',
  wrong_language: 'Mauvaise langue',
  off_topic: 'Hors sujet',
};

const SCORE_LABELS: Record<string, string> = {
  completion: 'Demande traitée /3',
  specificity: 'Précision /2',
  unsupported_claims: 'Non étayé',
  language_mismatch: 'Langue',
  tool_issue_disclosed: 'Échec signalé',
  livrable_quality: 'Livrable /3',
  deliverable_expected: 'Livrable attendu',
};

function journalKey(name: string) {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `qualite/${slug || 'agent'}`;
}

function EvidenceList({ evidence }: { evidence: any[] }) {
  return (
    <ul className="space-y-1">
      {evidence.map((e, i) => (
        <li key={i} className="font-mono text-[10px] flex flex-wrap gap-x-2">
          <span className="uppercase text-[var(--armada-text)]/40">{e.source}</span>
          {safeUrl(e.url) ? (
            <a href={safeUrl(e.url)} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} className="text-[var(--armada-primary)] underline truncate max-w-xs">
              {e.title ?? e.url}
            </a>
          ) : (
            <span>{e.title ?? e.ref ?? 'livrable'}</span>
          )}
          {e.error ? <span className="text-red-500">non lu : {e.error}</span> : e.chars != null && <span className="text-[var(--armada-text)]/40">{e.chars} car. relus</span>}
        </li>
      ))}
    </ul>
  );
}

const safeUrl = (u?: string) => (typeof u === 'string' && u.startsWith('https://') ? u : undefined);

const countOutcome = (byOutcome: Record<string, number>, key: string) =>
  Object.entries(byOutcome).reduce((n, [k, v]) => (k === key || k.startsWith(`${key}:`) ? n + v : n), 0);

const TONES = {
  good: 'bg-green-500/10 text-green-600 border-green-500/20',
  warn: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  bad: 'bg-red-500/10 text-red-500 border-red-500/20',
  neutral: 'bg-[var(--armada-text)]/5 text-[var(--armada-text)]/50 border-[var(--armada-accent)]',
};

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
const usd = (v: number) => (v < 0.01 && v > 0 ? `$${v.toFixed(5)}` : `$${v.toFixed(2)}`);
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v} ms`);
const surface = { backgroundColor: 'var(--armada-surface)' };

function Chip({ outcome }: { outcome: string }) {
  const [base, detail] = outcome.startsWith('flag:') || outcome.startsWith('rating:') ? [outcome, ''] : outcome.split(':');
  const o = OUTCOMES[base] ?? { label: base, tone: 'neutral' as const };
  const label = detail ? `${o.label} : ${WEAKNESS_LABELS[detail] ?? detail}` : o.label;
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-mono whitespace-nowrap ${TONES[o.tone]}`}>{label}</span>;
}

function Sparkline({ points }: { points: { quality: number }[] }) {
  if (points.length < 2) return null;
  const w = 160, h = 36;
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * w).toFixed(1)},${(h - p.quality * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-label="Évolution de la qualité">
      <line x1={0} x2={w} y1={h - 0.75 * h} y2={h - 0.75 * h} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="var(--armada-primary)" strokeWidth={1.5} />
    </svg>
  );
}

function AgentQuality({ agent }: { agent: any }) {
  const active = agent.lessons.filter((l: any) => !l.retiredAt);
  const retired = agent.lessons.filter((l: any) => l.retiredAt);
  const total = agent.ratings.good + agent.ratings.weak + agent.ratings.poor;
  const trend = agent.earlierQuality != null && agent.recentQuality != null ? agent.recentQuality - agent.earlierQuality : null;
  const topWeak = Object.entries(agent.weaknesses as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className="rounded-2xl border border-[var(--armada-accent)]/50 p-4 armada-card space-y-3" style={surface}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{agent.name}</p>
          <p className="text-[10px] font-mono text-[var(--armada-text)]/40">{agent.type ?? 'agent'} · {agent.reviews} réponses relues</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-medium tabular-nums">{agent.avgQuality != null ? pct(agent.avgQuality) : '—'}</p>
          {trend != null && (
            <p className={`text-[10px] font-mono ${trend >= 0.02 ? 'text-green-600' : trend <= -0.02 ? 'text-red-500' : 'text-[var(--armada-text)]/40'}`}>
              {trend >= 0 ? '+' : ''}{(trend * 100).toFixed(1)} pts ({pct(agent.earlierQuality)} → {pct(agent.recentQuality)})
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Sparkline points={agent.qualitySeries} />
        {total > 0 && (
          <div className="flex-1 min-w-[140px]">
            <div className="flex h-2 rounded overflow-hidden">
              <div className="bg-green-500" style={{ width: `${(agent.ratings.good / total) * 100}%` }} />
              <div className="bg-yellow-500" style={{ width: `${(agent.ratings.weak / total) * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(agent.ratings.poor / total) * 100}%` }} />
            </div>
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40 mt-1">
              {agent.ratings.good} bonnes · {agent.ratings.weak} moyennes · {agent.ratings.poor} faibles
            </p>
          </div>
        )}
      </div>
      {topWeak.length > 0 && (
        <p className="text-[10px] font-mono text-[var(--armada-text)]/50">
          Défauts fréquents : {topWeak.map(([k, v]) => `${WEAKNESS_LABELS[k] ?? k} (${v})`).join(' · ')}
        </p>
      )}
      {agent.evaluations?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/40">Dernières évaluations mémorisées</p>
          {agent.evaluations.map((e: any) => (
            <div key={e.at} className="rounded-xl border border-[var(--armada-accent)]/40 px-3 py-2 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-[var(--armada-text)]/70 line-clamp-2">« {e.request} »</p>
                <Chip outcome={`rating:${e.rating}`} />
              </div>
              <p className="font-mono text-[10px] text-[var(--armada-text)]/40">
                {new Date(e.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {Math.round(e.quality * 100)} % ·{' '}
                {Object.entries(e.scores as Record<string, number>).map(([k, v]) => `${SCORE_LABELS[k] ?? k} ${v}`).join(' · ')}
              </p>
              {e.livrables?.length > 0 && (
                <p className="font-mono text-[10px] text-[var(--armada-text)]/50">
                  Livrables :{' '}
                  {e.livrables.map((l: any, i: number) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      {safeUrl(l.url) ? <a href={safeUrl(l.url)} target="_blank" rel="noreferrer" className="text-[var(--armada-primary)] underline">{l.title ?? l.source}</a> : (l.title ?? l.source)}
                      {!l.readable && ' (illisible)'}
                    </span>
                  ))}
                </p>
              )}
            </div>
          ))}
          <p className="font-mono text-[10px] text-[var(--armada-text)]/30">
            Mémoire de l’agent : {journalKey(agent.name)} · {agent.livrablesReviewed} réponse(s) avec livrables relus
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/40">Règles de coaching actives ({active.length})</p>
        {active.length === 0 && <p className="text-[11px] text-[var(--armada-text)]/40">Aucune : pas de défaut récurrent.</p>}
        {active.map((l: any) => (
          <div key={l.weakness + l.addedAt} className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <p className="text-[11px]">{l.rule}</p>
            <p className="text-[10px] font-mono text-[var(--armada-text)]/40 mt-0.5">
              {WEAKNESS_LABELS[l.weakness] ?? l.weakness} · {l.occurrences} occurrences · depuis le {new Date(l.addedAt).toLocaleDateString('fr-FR')}
            </p>
          </div>
        ))}
        {retired.length > 0 && (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-[10px] font-mono text-green-600">{retired.length} règle(s) retirée(s) : défaut corrigé</summary>
            <ul className="mt-1 space-y-1">
              {retired.map((l: any) => (
                <li key={l.weakness + l.addedAt} className="text-[var(--armada-text)]/60">
                  {WEAKNESS_LABELS[l.weakness] ?? l.weakness} · ajoutée le {new Date(l.addedAt).toLocaleDateString('fr-FR')}, retirée le {new Date(l.retiredAt).toLocaleDateString('fr-FR')}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--armada-accent)]/50 px-4 py-3 armada-card" style={surface}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/40">{label}</p>
      <p className="text-xl font-medium mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] font-mono text-[var(--armada-text)]/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function Bars({ entries, highlight }: { entries: [string, number][]; highlight?: string }) {
  return (
    <div className="space-y-1 max-w-lg">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 font-mono text-[10px]">
          <span className={`w-40 truncate ${k === highlight ? 'text-[var(--armada-primary)]' : 'text-[var(--armada-text)]/50'}`} title={k}>{k}</span>
          <div className="flex-1 h-1.5 rounded bg-[var(--armada-accent)]/40">
            <div className="h-full rounded" style={{ width: `${v * 100}%`, backgroundColor: 'var(--armada-primary)' }} />
          </div>
          <span className="w-12 text-right tabular-nums">{pct(v)}</span>
        </div>
      ))}
    </div>
  );
}

function AnswerDetail({ id, answer }: { id: string; answer: any }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--armada-text)]/40">
        {id} · {answer.type}
        {answer.confidence != null && ` · confiance ${pct(answer.confidence)}`}
        {answer.type === 'score' && ` · score ${answer.score.toFixed(2)}`}
      </p>
      {answer.type === 'choice' && (
        <Bars entries={Object.entries(answer.probabilities as Record<string, number>).sort((a, b) => b[1] - a[1])} highlight={answer.choice} />
      )}
      {answer.type === 'score' && (
        <Bars entries={Object.entries(answer.probabilities as Record<string, number>).map(([k, v]) => [String(answer.legend?.[k] ?? k).split(':')[0], v])} />
      )}
      {answer.type === 'noul' && <Bars entries={[['oui', answer.noul]]} />}
    </div>
  );
}

export default function TypeSafePage() {
  const { activeStoreId } = useActiveStore();
  const [days, setDays] = useState<number>(7);
  const [feature, setFeature] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR(
    activeStoreId ? `/api/typesafe?storeId=${activeStoreId}&days=${days}${feature ? `&feature=${feature}` : ''}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );

  const s = data?.summary;
  const daily: any[] = data?.daily ?? [];
  const maxDaily = Math.max(1, ...daily.map(d => d.calls));
  const recent: any[] = data?.recent ?? [];
  const pill = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
      active
        ? 'text-white armada-btn-primary'
        : 'border border-[var(--armada-accent)] text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)]'
    }`;
  const pillStyle = (active: boolean) => (active ? { backgroundColor: 'var(--armada-primary)' } : undefined);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}>
      <div className="border-b border-[var(--armada-accent)]/50 px-6 py-5 flex flex-wrap items-end justify-between gap-4" style={surface}>
        <div>
          <h1 className="font-serif tracking-tight text-2xl">TypeSafe</h1>
          <p className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest mt-0.5">
            Jugements Jev au service des agents
          </p>
        </div>
        <div className="flex gap-1.5">
          {WINDOWS.map(w => (
            <button key={w.days} onClick={() => setDays(w.days)} className={pill(days === w.days)} style={pillStyle(days === w.days)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-[var(--armada-accent)]/50 px-6 py-3 flex flex-wrap gap-1.5" style={surface}>
        {[['', 'Tout'], ...Object.entries(FEATURES).map(([k, f]) => [k, f.label])].map(([k, label]) => (
          <button key={k} onClick={() => setFeature(k)} className={pill(feature === k)} style={pillStyle(feature === k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {!activeStoreId ? (
          <p className="text-center py-16 text-sm font-mono text-[var(--armada-text)]/40">Sélectionnez une boutique pour voir l’activité TypeSafe.</p>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-500">
            Impossible de charger les données TypeSafe : {error.message}
          </div>
        ) : isLoading || !s ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--armada-text)]/30" />
          </div>
        ) : (
          <>
            {s.byStatus?.skipped > 0 && (
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-600">
                {s.byStatus.skipped} appel(s) ignoré(s) : TYPESAFE_API_KEY n'est pas défini sur le gateway.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Appels" value={String(s.calls)} sub={`${s.answered} répondus`} />
              <Tile label="Taux d'erreur" value={pct(s.errorRate)} sub="HTTP, timeout, clé absente" />
              <Tile label="Latence moyenne" value={ms(s.latencyAvg)} sub={`p50 ${ms(s.latencyP50)} · p95 ${ms(s.latencyP95)}`} />
              <Tile label="Confiance moyenne" value={s.avgConfidence != null ? pct(s.avgConfidence) : '—'} />
              <Tile label="Tokens" value={(s.inputTokens + s.outputTokens).toLocaleString('fr-FR')} sub={`${s.inputTokens.toLocaleString('fr-FR')} in · ${s.outputTokens.toLocaleString('fr-FR')} out`} />
              <Tile label="Coût estimé" value={data.pricingConfigured ? usd(s.cost) : '—'} sub={data.pricingConfigured ? `${s.calls ? usd(s.cost / s.calls) : '$0'} / appel` : 'Tarifs non configurés'} />
              <Tile label="Tokens / appel" value={s.calls ? String(Math.round((s.inputTokens + s.outputTokens) / s.calls)) : '—'} />
              <Tile label="Période" value={`${data.days} j`} sub={data.truncated ? '5 000 derniers appels' : undefined} />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {Object.entries(FEATURES)
                .filter(([k]) => !feature || feature === k)
                .map(([k, f]) => {
                  const fs = data.byFeature?.[k];
                  return (
                    <div key={k} className="rounded-2xl border border-[var(--armada-accent)]/50 p-4 armada-card space-y-3" style={surface}>
                      <div>
                        <p className="text-sm font-medium">{f.label}</p>
                        <p className="text-[11px] text-[var(--armada-text)]/50">{f.description}</p>
                      </div>
                      {!fs ? (
                        <p className="text-[11px] font-mono text-[var(--armada-text)]/30">Aucun appel sur la période.</p>
                      ) : (
                        <>
                          <p className="text-[10px] font-mono text-[var(--armada-text)]/40">
                            {fs.calls} appels · {ms(fs.latencyAvg)} moy. · p95 {ms(fs.latencyP95)} · erreurs {pct(fs.errorRate)}
                            {data.pricingConfigured && ` · ${usd(fs.cost)}`}
                          </p>
                          <div className="space-y-1.5">
                            {f.outcomes.map(o => (
                              <div key={o} className="flex items-center justify-between gap-3">
                                <Chip outcome={o} />
                                <span className="font-mono text-xs tabular-nums">
                                  {countOutcome(fs.byOutcome, o)}
                                  <span className="text-[var(--armada-text)]/40"> · {pct(countOutcome(fs.byOutcome, o) / fs.calls)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
            </div>

            {(!feature || feature === 'output_review') && (
              <div className="space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/40">Qualité des agents et coaching</p>
                {(data.agents ?? []).length === 0 ? (
                  <p className="text-[11px] font-mono text-[var(--armada-text)]/30">Aucune réponse relue sur la période.</p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {data.agents.map((a: any) => <AgentQuality key={a.agentId} agent={a} />)}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-[var(--armada-accent)]/50 p-4 armada-card" style={surface}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/40 mb-3">Appels par jour</p>
              <div className="flex items-end gap-1 h-32">
                {daily.map(d => (
                  <div
                    key={d.date}
                    className="flex-1 min-w-[6px] h-full flex flex-col justify-end"
                    title={`${d.date} · ${d.calls} appels · ${d.actions} interventions · ${d.errors} erreurs · ${ms(d.latencyAvg)}`}
                  >
                    <div className="w-full rounded-t overflow-hidden flex flex-col justify-end" style={{ height: `${(d.calls / maxDaily) * 100}%`, backgroundColor: 'color-mix(in srgb, var(--armada-primary) 35%, transparent)' }}>
                      {d.actions > 0 && <div className="w-full" style={{ height: `${(d.actions / d.calls) * 100}%`, backgroundColor: 'var(--armada-primary)' }} />}
                      {d.errors > 0 && <div className="w-full bg-red-500" style={{ height: `${(d.errors / d.calls) * 100}%` }} />}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-[10px] font-mono text-[var(--armada-text)]/30 mt-2">
                <span>{daily[0]?.date}</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 35%, transparent)' }} /> appels</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--armada-primary)' }} /> interventions</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500" /> erreurs</span>
                </span>
                <span>{daily[daily.length - 1]?.date}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--armada-accent)]/50 armada-card overflow-hidden" style={surface}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/40 px-4 pt-4 pb-2">Derniers appels</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-[var(--armada-text)]/40 border-b border-[var(--armada-accent)]/50">
                      <th className="px-4 py-2 font-normal">Date</th>
                      <th className="px-4 py-2 font-normal">Usage</th>
                      <th className="px-4 py-2 font-normal">Sujet</th>
                      <th className="px-4 py-2 font-normal">Décisions</th>
                      <th className="px-4 py-2 font-normal text-right">Latence</th>
                      <th className="px-4 py-2 font-normal text-right">Tokens</th>
                      <th className="px-4 py-2 font-normal text-right">Coût</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(c => (
                      <Fragment key={c.id}>
                        <tr onClick={() => setOpenId(openId === c.id ? null : c.id)} className="border-b border-[var(--armada-accent)]/30 cursor-pointer hover:bg-[var(--armada-surface-hover)] align-top">
                          <td className="px-4 py-2 font-mono text-[var(--armada-text)]/50 whitespace-nowrap">
                            {new Date(c.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">{FEATURES[c.feature]?.label ?? c.feature}</td>
                          <td className="px-4 py-2 font-mono whitespace-nowrap">
                            {c.feature === 'output_review' && `${c.agentName ?? 'Agent'} · ${c.confidence != null ? pct(c.confidence) : '—'}`}
                            {c.feature !== 'output_review' && (c.requestedValue ?? '—')}
                            {c.feature !== 'output_review' && c.resolvedValue && c.resolvedValue !== c.requestedValue && <span className="text-[var(--armada-primary)]"> → {c.resolvedValue}</span>}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {c.status !== 'ok' && <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-mono ${TONES.bad}`}>{c.status}</span>}
                              {c.outcomes.map((o: string) => <Chip key={o} outcome={o} />)}
                            </div>
                          </td>
                          <td className="px-4 py-2 font-mono text-right tabular-nums">{ms(c.latencyMs)}</td>
                          <td className="px-4 py-2 font-mono text-right tabular-nums">{c.inputTokens + c.outputTokens}</td>
                          <td className="px-4 py-2 font-mono text-right tabular-nums">{data.pricingConfigured ? usd(c.cost) : '—'}</td>
                        </tr>
                        {openId === c.id && (
                          <tr className="border-b border-[var(--armada-accent)]/30" style={{ backgroundColor: 'var(--armada-bg)' }}>
                            <td colSpan={7} className="px-4 py-3 space-y-3">
                              {c.agentName && <p className="font-mono text-[10px] text-[var(--armada-text)]/40">Agent : {c.agentName}</p>}
                              {c.taskPreview && <p className="text-[var(--armada-text)]/70 whitespace-pre-wrap">{c.feature === 'output_review' && <span className="font-mono text-[10px] text-[var(--armada-text)]/40">Demande : </span>}{c.taskPreview}</p>}
                              {c.outputPreview && (
                                <p className="text-[var(--armada-text)]/60 whitespace-pre-wrap border-l-2 border-[var(--armada-accent)] pl-3 max-h-48 overflow-y-auto">
                                  <span className="font-mono text-[10px] text-[var(--armada-text)]/40">Réponse : </span>{c.outputPreview}
                                </p>
                              )}
                              {c.error && <p className="font-mono text-red-500 break-all">{c.error}</p>}
                              {Array.isArray(c.evidence) && c.evidence.length > 0 && (
                                <div>
                                  <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--armada-text)]/40 mb-1">Livrables relus par Jev</p>
                                  <EvidenceList evidence={c.evidence} />
                                </div>
                              )}
                              {c.answers && (
                                <div className="grid md:grid-cols-2 gap-4">
                                  {Object.entries(c.answers).map(([id, a]) => <AnswerDetail key={id} id={id} answer={a} />)}
                                </div>
                              )}
                              <p className="font-mono text-[10px] text-[var(--armada-text)]/30">
                                {c.model} · HTTP {c.httpStatus ?? '—'} · {c.inputTokens} in / {c.outputTokens} out
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {recent.length === 0 && (
                <p className="text-center py-12 text-sm text-[var(--armada-text)]/30 font-mono">Aucun appel TypeSafe sur la période.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
