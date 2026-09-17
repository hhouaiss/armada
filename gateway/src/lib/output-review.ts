import { prisma } from './database.js';
import { MemoryEngine } from './memory-engine.js';
import { askJev, finishCall, type NoulAnswer, type ScoreAnswer, type ChoiceAnswer } from './typesafe.js';
import { buildReviewQuestions, buildReviewState, WEAKNESSES, type TurnInput, type Weakness } from './output-review-questions.js';
import type { LivrableEvidence } from './notion-livrables.js';

export type { ToolTraceEntry } from './output-review-questions.js';

export type Rating = 'good' | 'weak' | 'poor';

export interface TurnReview {
  rating: Rating;
  quality: number;
  weakness?: Weakness;
  flags: string[];
  /** Merchant/Major-facing warning, only for poor outputs. */
  warning?: string;
  /** Instruction for the agent to fix a correctable problem; absent when nothing actionable or already a correction turn. */
  correction?: string;
  callId?: string;
}

export const CORRECTION_MARKER = '[Contrôle qualité Jev — correction demandée]';

const CORRECTABLE_FLAGS = ['livrable_missing', 'livrable', 'unsupported_claims', 'hidden_tool_error', 'language'] as const;

const CORRECTION_TEXT: Record<(typeof CORRECTABLE_FLAGS)[number], string> = {
  livrable_missing:
    "La demande attend un vrai livrable mais aucun livrable n'a été enregistré. Produis maintenant le livrable COMPLET : " +
    'soit dans un bloc [LIVRABLE_CONTENT:slug:Titre]…[/LIVRABLE_CONTENT], soit dans la page Notion prévue (outils Notion). Un résumé dans le chat ne suffit pas.',
  livrable:
    "Le livrable enregistré n'est pas utilisable en l'état (vide, brouillon ou incomplet). Complète-le entièrement et mets-le à jour au même endroit.",
  unsupported_claims:
    "Ta réponse affirme des chiffres, données ou actions non confirmés par tes outils. Vérifie avec les outils et corrige, ou indique clairement ce qui n'est pas confirmé.",
  hidden_tool_error:
    "Un outil a échoué ou attend une approbation mais ta réponse présente l'action comme faite. Corrige : dis ce qui n'a pas abouti et quelle est la prochaine étape.",
  language: 'Ta réponse n’est pas dans la langue du marchand. Reformule-la dans sa langue.',
};

const RECURRENCE_WINDOW = 20;
const RECURRENCE_THRESHOLD = 2;
const RETIRE_AFTER_CLEAN_REVIEWS = 15;
const MAX_ACTIVE_LESSONS = 5;
const MAX_EVALUATIONS = 15;

const LESSON_RULES: Record<Exclude<Weakness, 'none'>, string> = {
  incomplete:
    "Traite TOUS les éléments de la demande. Avant de répondre, relis la demande point par point ; si tu ne peux pas tout faire, dis clairement ce qui manque.",
  unsupported_claims:
    "N'affirme aucun chiffre, produit, stock, commande ou action réalisée sans l'avoir obtenu d'un outil. Si tu n'as pas la donnée, appelle l'outil ou dis que tu ne l'as pas.",
  too_generic:
    'Évite les conseils génériques : appuie-toi sur les données réelles de la boutique (produits, ventes, fiches) et donne des recommandations concrètes et directement applicables.',
  ignored_tool_error:
    "Quand un outil échoue ou attend une approbation, ne présente jamais l'action comme faite : indique l'échec ou l'attente et la prochaine étape.",
  wrong_language: 'Réponds toujours dans la langue utilisée par le marchand.',
  off_topic: "Réponds précisément à la question posée avant d'ajouter quoi que ce soit d'autre.",
};

const WARNING_TEXT: Record<string, string> = {
  unsupported_claims: 'des chiffres ou actions affirmés ne sont pas confirmés par les outils',
  hidden_tool_error: "un outil a échoué ou attend une approbation mais la réponse présente l'action comme faite",
  language: "la réponse n'est pas dans la langue du marchand",
  incomplete: 'la demande n’est que partiellement traitée',
  too_generic: 'la réponse est trop générique',
  off_topic: 'la réponse ne traite pas la question posée',
  livrable: 'le livrable n’est pas utilisable en l’état',
  livrable_missing: 'aucun livrable n’a été enregistré alors que la demande en attend un',
};

const CHECKS_DESCRIPTION =
  'Ce que Jev vérifie à chaque réponse : demande entièrement traitée (0–3), précision et actionnabilité (0–2), ' +
  'chiffres ou actions affirmés sans preuve dans les résultats d’outils, langue du marchand, échecs d’outils signalés honnêtement, ' +
  'qualité des livrables (pages Notion / Livrables Armada relues, 0–3) et défaut principal.';

interface Lesson {
  weakness: Weakness;
  rule: string;
  addedAt: string;
  lastSeenAt: string;
  occurrences: number;
  example?: string;
  retiredAt?: string;
}

interface Evaluation {
  at: string;
  request: string;
  rating: Rating;
  quality: number;
  scores: Record<string, number>;
  weakness?: Weakness;
  flags: string[];
  livrables: { source: string; title?: string; url?: string; readable: boolean }[];
}

interface Coaching {
  lessons: Lesson[];
  evaluations: Evaluation[];
}

type ReviewInput = TurnInput & {
  storeId: string;
  agentId: string;
  /** Reads back deliverables stored outside the chat (Notion) right before judging. */
  fetchLivrables?: () => Promise<LivrableEvidence[]>;
  /** This turn answers a Jev correction request: reviewed and logged, never corrected again. */
  isCorrection?: boolean;
};

/** Never throws: a review failure must not affect the agent turn. */
export async function reviewAgentTurn(input: ReviewInput): Promise<TurnReview | undefined> {
  try {
    if (process.env.TYPESAFE_REVIEW_DISABLED === 'true') return undefined;
    if (input.response.trim().length < 40 && input.toolTrace.length === 0 && !input.fetchLivrables) return undefined;

    const fetched = input.fetchLivrables ? await input.fetchLivrables().catch(() => []) : [];
    const livrables = [...(input.livrables ?? []), ...fetched];
    const turn: TurnInput = { ...input, livrables };
    const evidence = livrables.map(l => ({
      source: l.source,
      ref: l.ref,
      url: l.url,
      title: l.title,
      chars: l.content?.length ?? 0,
      ...(l.error && { error: l.error }),
    }));

    const result = await askJev(buildReviewState(turn), buildReviewQuestions(turn), {
      storeId: input.storeId,
      feature: 'output_review',
      agentId: input.agentId,
      agentName: input.agentName,
      taskPreview: input.request,
      outputPreview: input.response,
      evidence,
    });
    if (!result.ok || !result.answers) {
      await finishCall(result.callId, { outcomes: ['fallback_error'] });
      return undefined;
    }

    const a = result.answers;
    const completion = a.completion as ScoreAnswer;
    const specificity = a.specificity as ScoreAnswer;
    const unsupported = (a.unsupported_claims as NoulAnswer).noul;
    const mismatch = (a.language_mismatch as NoulAnswer).noul;
    const disclosed = (a.tool_issue_disclosed as NoulAnswer | undefined)?.noul;
    const livrableScore = (a.livrable_quality as ScoreAnswer | undefined)?.score;
    const main = a.main_weakness as ChoiceAnswer;
    const deliverableExpected = (a.deliverable_expected as NoulAnswer).noul;
    const claimsDelivered = (a.claims_delivered as NoulAnswer).noul;
    // A Notion page that was written but could not be read back is not the agent's fault.
    const hasLivrable = livrables.some(l => l.content || l.source === 'notion');

    const quality =
      livrableScore === undefined
        ? 0.45 * (completion.score / 3) + 0.2 * (specificity.score / 2) + 0.25 * (1 - unsupported) + 0.1 * (1 - mismatch)
        : 0.3 * (completion.score / 3) + 0.2 * (livrableScore / 3) + 0.15 * (specificity.score / 2) + 0.25 * (1 - unsupported) + 0.1 * (1 - mismatch);

    // Serious violations are not compensated by a good weighted score.
    const flags: string[] = [];
    if (unsupported >= 0.7) flags.push('unsupported_claims');
    if (disclosed !== undefined && disclosed <= 0.3) flags.push('hidden_tool_error');
    if (mismatch >= 0.7) flags.push('language');
    if (livrableScore !== undefined && livrableScore < 0.75) flags.push('livrable');
    if (!hasLivrable && (deliverableExpected >= 0.7 || claimsDelivered >= 0.7)) flags.push('livrable_missing');

    let rating: Rating = quality >= 0.75 ? 'good' : quality >= 0.5 ? 'weak' : 'poor';
    if (flags.length > 0) rating = 'poor';

    const weakness =
      rating !== 'good' && main.choice !== 'none' && main.confidence >= 0.5 ? (main.choice as Weakness) : undefined;

    const outcomes = [`rating:${rating}`, ...flags.map(f => `flag:${f}`)];
    if (weakness) outcomes.push(`weakness:${weakness}`);
    if (livrables.some(l => l.source === 'notion')) outcomes.push(fetched.some(l => l.content) ? 'notion_read' : 'notion_unreadable');
    const correctable = flags.filter((f): f is (typeof CORRECTABLE_FLAGS)[number] => (CORRECTABLE_FLAGS as readonly string[]).includes(f));
    if (input.isCorrection) outcomes.push(rating === 'poor' ? 'correction_failed' : 'correction_fixed');
    else if (correctable.length) outcomes.push('correction_requested');
    await finishCall(result.callId, { outcomes, resolvedValue: rating, confidence: Number(quality.toFixed(3)) });

    const scores: Record<string, number> = {
      completion: round(completion.score),
      specificity: round(specificity.score),
      unsupported_claims: round(unsupported),
      language_mismatch: round(mismatch),
      ...(disclosed !== undefined && { tool_issue_disclosed: round(disclosed) }),
      ...(livrableScore !== undefined && { livrable_quality: round(livrableScore) }),
      deliverable_expected: round(deliverableExpected),
    };
    const evaluation: Evaluation = {
      at: new Date().toISOString(),
      request: input.request.replace(/\s+/g, ' ').slice(0, 160),
      rating,
      quality: round(quality),
      scores,
      weakness,
      flags,
      livrables: livrables.map(l => ({ source: l.source, title: l.title, url: l.url, readable: !!l.content })),
    };

    const lessonChanges = await updateCoaching(input, weakness, evaluation);
    await finishCall(result.callId, {
      outcomes: [...outcomes, ...lessonChanges, 'memory_saved'],
      resolvedValue: rating,
      confidence: round(quality),
    });

    const reasons = [...flags, ...(weakness && !flags.length ? [weakness] : [])]
      .map(r => WARNING_TEXT[r])
      .filter(Boolean);
    return {
      rating,
      quality,
      weakness,
      flags,
      callId: result.callId,
      warning: rating === 'poor' && reasons.length ? `Contrôle qualité Jev : ${reasons.join(' ; ')}.` : undefined,
      correction:
        !input.isCorrection && correctable.length
          ? `${CORRECTION_MARKER}\nDemande initiale : « ${input.request.slice(0, 500)} »\n\nProblème(s) détecté(s) :\n` +
            correctable.map(f => `- ${CORRECTION_TEXT[f]}`).join('\n') +
            '\n\nCorrige maintenant, puis donne ta réponse finale au marchand (sans mentionner ce contrôle).'
          : undefined,
    };
  } catch (err) {
    console.warn('[output-review] failed:', err);
    return undefined;
  }
}

const round = (v: number) => Number(v.toFixed(2));

/**
 * Coaching loop: every evaluation is journaled in the agent's memory; a weakness
 * that recurs becomes a rule in its system prompt, retired once it stops recurring.
 */
async function updateCoaching(input: ReviewInput, weakness: Weakness | undefined, evaluation: Evaluation): Promise<string[]> {
  const recent = await prisma.typeSafeCall.findMany({
    where: { agentId: input.agentId, feature: 'output_review', status: 'ok' },
    orderBy: { createdAt: 'desc' },
    take: RECURRENCE_WINDOW,
    select: { outcomes: true },
  });
  const countIn = (w: string, n: number) => recent.slice(0, n).filter(r => r.outcomes.includes(`weakness:${w}`)).length;

  const coaching = await loadCoaching(input.storeId, input.agentId);
  const active = coaching.lessons.filter(l => !l.retiredAt);
  const changes: string[] = [];
  const now = evaluation.at;

  if (weakness && weakness !== 'none') {
    const existing = active.find(l => l.weakness === weakness);
    const occurrences = countIn(weakness, RECURRENCE_WINDOW);
    if (existing) {
      existing.lastSeenAt = now;
      existing.occurrences++;
    } else if (occurrences >= RECURRENCE_THRESHOLD && active.length < MAX_ACTIVE_LESSONS) {
      coaching.lessons.push({
        weakness,
        rule: LESSON_RULES[weakness],
        addedAt: now,
        lastSeenAt: now,
        occurrences,
        example: evaluation.request,
      });
      changes.push(`lesson_added:${weakness}`);
      console.log(`  🎓 Jev coaching: new rule for ${input.agentName} (${weakness})`);
    }
  }

  if (recent.length >= RETIRE_AFTER_CLEAN_REVIEWS) {
    for (const lesson of active) {
      if (lesson.weakness !== weakness && countIn(lesson.weakness, RETIRE_AFTER_CLEAN_REVIEWS) === 0) {
        lesson.retiredAt = now;
        changes.push(`lesson_retired:${lesson.weakness}`);
        console.log(`  🎓 Jev coaching: rule retired for ${input.agentName} (${lesson.weakness})`);
      }
    }
  }

  coaching.evaluations = [evaluation, ...coaching.evaluations].slice(0, MAX_EVALUATIONS);
  await saveCoaching(input.storeId, input.agentId, coaching);
  await new MemoryEngine(input.storeId)
    .saveTopicFile(journalKey(input.agentName), renderJournal(input.agentName, coaching), `Retours qualité Jev — ${input.agentName}`)
    .catch(e => console.warn('[output-review] memory journal failed:', e));
  return changes;
}

export function journalKey(agentName: string) {
  const slug = agentName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `qualite/${slug || 'agent'}`;
}

const RATING_LABEL: Record<Rating, string> = { good: 'bonne', weak: 'moyenne', poor: 'faible' };

function advice(e: Evaluation): string {
  if (e.flags.includes('unsupported_claims')) return LESSON_RULES.unsupported_claims;
  if (e.flags.includes('hidden_tool_error')) return LESSON_RULES.ignored_tool_error;
  if (e.flags.includes('language')) return LESSON_RULES.wrong_language;
  if (e.flags.includes('livrable_missing')) return 'Quand la demande attend un livrable, enregistre-le (bloc LIVRABLE_CONTENT ou page Notion) avant d’annoncer que c’est fait.';
  if (e.flags.includes('livrable')) return 'Ne livre pas une page brouillon ou vide : termine le contenu avant de l’annoncer comme prêt.';
  if (e.weakness && e.weakness !== 'none') return LESSON_RULES[e.weakness];
  return 'Rien à corriger : garde cette approche.';
}

function renderJournal(agentName: string, coaching: Coaching): string {
  const active = coaching.lessons.filter(l => !l.retiredAt);
  const lines = [
    `# Retours qualité Jev — ${agentName}`,
    '',
    CHECKS_DESCRIPTION,
    'Échelle de qualité : bonne ≥ 75 %, moyenne ≥ 50 %, faible en dessous ou dès qu’un défaut grave est détecté.',
    '',
    '## Règles actives',
    ...(active.length ? active.map(l => `- ${l.rule} (${l.occurrences} fois)`) : ['- Aucune pour l’instant.']),
    '',
    '## Évaluations récentes (la plus récente d’abord)',
  ];
  for (const e of coaching.evaluations) {
    const scores = Object.entries(e.scores).map(([k, v]) => `${k} ${v}`).join(', ');
    const livrables = e.livrables.length
      ? ` Livrables relus : ${e.livrables.map(l => `${l.title ?? l.source}${l.url ? ` (${l.url})` : ''}${l.readable ? '' : ' [illisible]'}`).join(' ; ')}.`
      : '';
    lines.push(
      `- ${e.at.slice(0, 16).replace('T', ' ')} — « ${e.request} » → qualité ${RATING_LABEL[e.rating]} (${Math.round(e.quality * 100)} %).` +
        ` Scores : ${scores}.${e.weakness ? ` Défaut : ${WEAKNESSES[e.weakness]}` : ''}${livrables} À retenir : ${advice(e)}`,
    );
  }
  return lines.join('\n');
}

async function loadCoaching(storeId: string, agentId: string): Promise<Coaching> {
  const row = await prisma.agentMemory.findUnique({
    where: { storeId_type_key: { storeId, type: 'coaching', key: agentId } },
  });
  if (!row) return { lessons: [], evaluations: [] };
  try {
    const parsed = JSON.parse(row.content);
    if (Array.isArray(parsed)) return { lessons: parsed, evaluations: [] };
    return { lessons: parsed.lessons ?? [], evaluations: parsed.evaluations ?? [] };
  } catch {
    return { lessons: [], evaluations: [] };
  }
}

async function saveCoaching(storeId: string, agentId: string, coaching: Coaching) {
  const lessons = [
    ...coaching.lessons.filter(l => !l.retiredAt),
    ...coaching.lessons.filter(l => l.retiredAt).slice(-20),
  ];
  const content = JSON.stringify({ lessons, evaluations: coaching.evaluations });
  await prisma.agentMemory.upsert({
    where: { storeId_type_key: { storeId, type: 'coaching', key: agentId } },
    create: { storeId, type: 'coaching', key: agentId, content },
    update: { content },
  });
}

export async function buildCoachingSection(storeId: string, agentId: string, agentName: string): Promise<string> {
  const coaching = await loadCoaching(storeId, agentId).catch(() => ({ lessons: [], evaluations: [] }) as Coaching);
  const active = coaching.lessons.filter(l => !l.retiredAt);
  if (active.length === 0 && coaching.evaluations.length === 0) return '';

  const lines = ['', '', '## RETOURS QUALITÉ (contrôle Jev sur ton travail)'];
  if (active.length) {
    lines.push('Défauts relevés plusieurs fois — applique ces règles en priorité :');
    lines.push(...active.map(l => `- ${l.rule} (${WEAKNESSES[l.weakness]} — ${l.occurrences} fois récemment)`));
  }
  const last = coaching.evaluations.slice(0, 3);
  if (last.length) {
    lines.push('Tes dernières évaluations :');
    lines.push(...last.map(e => `- « ${e.request.slice(0, 80)} » → ${RATING_LABEL[e.rating]} (${Math.round(e.quality * 100)} %). ${advice(e)}`));
  }
  lines.push(`Historique complet et détail des scores : memory_read("${journalKey(agentName)}").`);
  return lines.join('\n');
}
