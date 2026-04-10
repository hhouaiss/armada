/**
 * AutoDream Worker
 *
 * Runs nightly (03:00-04:00 UTC) for each active store.
 * Loads the last 7 days of conversations, calls Haiku to extract decisions/facts,
 * and merges the results into the store's MemoryIndex.
 *
 * Inspired by Claude Code's AutoDream memory consolidation pattern.
 * Zero new dependencies — uses the existing Anthropic SDK.
 */

import OpenAI from 'openai';
import { prisma, loadAllStoreSessionsForDream } from '../lib/database.js';
import { MemoryEngine, MemoryIndex } from '../lib/memory-engine.js';
import { decryptToken } from '../lib/shopify-client.js';

const OPENROUTER_MODEL = 'google/gemma-4-27b-it';

// Dream runs between 03:00 and 04:00 UTC
const DREAM_HOUR_UTC = 3;
// Minimum hours between two dreams for the same store
const DREAM_COOLDOWN_HOURS = 20;
// Max chars of conversation to send to Haiku (keeps cost low)
const MAX_DREAM_INPUT_CHARS = 24_000;

const DREAM_SYSTEM_PROMPT = `Tu es un archiviste IA spécialisé dans la consolidation de mémoire pour une équipe d'agents business.
Analyse les conversations fournies et extrais UNIQUEMENT des informations stratégiques durables.

RÈGLES:
- Ignore les données opérationnelles éphémères (liste de produits du jour, commandes récentes)
- Retiens uniquement les décisions, préférences, objectifs et contraintes durables
- Détecte les contradictions avec ce qui est déjà mémorisé
- Sois concis: chaque fait doit tenir en une ligne

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`;

const DREAM_USER_PROMPT = (conversations: string, existingMemory: string) => `
MÉMOIRE EXISTANTE:
${existingMemory || '(aucune mémoire existante)'}

CONVERSATIONS RÉCENTES (7 derniers jours):
${conversations}

Extrais les informations importantes. Réponds en JSON:
{
  "decisions": [
    {"decision": "description courte", "reason": "contexte ou raison (optionnel)"}
  ],
  "facts": [
    "fait clé court (< 100 chars)"
  ],
  "contradictions": [
    "description de la contradiction détectée (si applicable)"
  ],
  "summary": "Résumé en 1-2 phrases de l'activité de la semaine"
}`;

interface DreamResult {
  decisions: Array<{ decision: string; reason?: string }>;
  facts: string[];
  contradictions: string[];
  summary: string;
}

/** Extract text-only messages from a session history for AutoDream analysis. */
function extractTextMessages(
  history: any[],
  agentName: string
): string[] {
  const lines: string[] = [];

  for (const msg of history) {
    if (typeof msg.content === 'string' && msg.content.trim()) {
      const role = msg.role === 'user' ? 'User' : agentName;
      const truncated = msg.content.slice(0, 500);
      lines.push(`${role}: ${truncated}`);
    } else if (Array.isArray(msg.content)) {
      // Extract only text blocks (skip tool_use / tool_result)
      for (const block of msg.content) {
        if (block.type === 'text' && block.text?.trim()) {
          const role = msg.role === 'user' ? 'User' : agentName;
          lines.push(`${role}: ${block.text.slice(0, 500)}`);
        }
      }
    }
  }

  return lines;
}

/** Build the conversation excerpt for the dream prompt. */
async function buildConversationExcerpt(storeId: string): Promise<string> {
  const sessions = await loadAllStoreSessionsForDream(storeId, 7);
  if (sessions.length === 0) return '';

  const lines: string[] = [];

  for (const session of sessions) {
    // Get agent name from DB (best effort)
    const agent = await prisma.agent.findUnique({
      where: { id: session.agentId },
      select: { name: true },
    }).catch(() => null);
    const agentName = agent?.name ?? 'Agent';

    const sessionLines = extractTextMessages(session.history, agentName);
    if (sessionLines.length > 0) {
      lines.push(`--- Session (${session.conversationId.slice(0, 20)}) ---`);
      lines.push(...sessionLines.slice(-30)); // last 30 lines per session
    }
  }

  // Trim to budget
  let combined = lines.join('\n');
  if (combined.length > MAX_DREAM_INPUT_CHARS) {
    combined = combined.slice(-MAX_DREAM_INPUT_CHARS);
  }

  return combined;
}

/** Fetch the OpenRouter API key for a store's owner. */
async function getOpenRouterKeyForStore(userId: string): Promise<string | null> {
  const keyRecord = await prisma.lLMApiKey
    .findUnique({ where: { userId_provider: { userId, provider: 'openrouter' } } })
    .catch(() => null);

  if (!keyRecord) return null;
  return decryptToken(keyRecord.apiKey);
}

/** Run one AutoDream cycle for a store. */
export async function runAutoDream(storeId: string, userId: string): Promise<void> {
  console.log(`\n💤 AutoDream: starting for store ${storeId}...`);

  // 1. Build conversation excerpt
  const conversations = await buildConversationExcerpt(storeId);
  if (!conversations) {
    console.log(`  ℹ️  AutoDream: no conversations found for store ${storeId}, skipping.`);
    return;
  }

  // 2. Load existing memory for context
  const engine = new MemoryEngine(storeId);
  const existingIndex = await engine.loadIndex();
  const existingMemory = existingIndex
    ? JSON.stringify({ decisions: existingIndex.decisions, keyFacts: existingIndex.keyFacts }, null, 2)
    : '';

  // 3. Get OpenRouter key
  const apiKey = await getOpenRouterKeyForStore(userId);
  if (!apiKey) {
    console.warn(`  ⚠️  AutoDream: no OpenRouter key for store ${storeId}, skipping.`);
    return;
  }

  // 4. Call Gemma 4 via OpenRouter
  let dreamResult: DreamResult;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://storeteam.ai', 'X-Title': 'StoreTeam' },
    });
    const response = await client.chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: DREAM_SYSTEM_PROMPT },
        { role: 'user', content: DREAM_USER_PROMPT(conversations, existingMemory) },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    dreamResult = JSON.parse(text) as DreamResult;
  } catch (err) {
    console.error(`  ✗ AutoDream: Gemma call failed for store ${storeId}:`, err);
    return;
  }

  // 5. Merge into MemoryIndex
  const index: MemoryIndex = existingIndex ?? {
    lastUpdated: '',
    decisions: [],
    keyFacts: [],
    topics: {},
  };

  for (const d of dreamResult.decisions ?? []) {
    if (d.decision) {
      index.decisions.push({
        date: new Date().toISOString().split('T')[0],
        decision: d.decision,
        reason: d.reason,
      });
    }
  }

  for (const fact of dreamResult.facts ?? []) {
    if (fact && !index.keyFacts.includes(fact)) {
      index.keyFacts.push(fact);
    }
  }

  await engine.saveIndex(index);

  // 6. Save dream log
  if (dreamResult.summary) {
    const logKey = `dream_log/${new Date().toISOString().split('T')[0]}`;
    const logContent = [
      `# AutoDream — ${new Date().toISOString()}`,
      '',
      `## Résumé`,
      dreamResult.summary,
      '',
      `## Décisions ajoutées (${dreamResult.decisions?.length ?? 0})`,
      ...(dreamResult.decisions ?? []).map((d) => `- ${d.decision}${d.reason ? ` (${d.reason})` : ''}`),
      '',
      `## Faits ajoutés (${dreamResult.facts?.length ?? 0})`,
      ...(dreamResult.facts ?? []).map((f) => `- ${f}`),
      ...(dreamResult.contradictions?.length
        ? ['', '## Contradictions détectées', ...(dreamResult.contradictions ?? []).map((c) => `- ⚠️ ${c}`)]
        : []),
    ].join('\n');

    await engine.saveTopicFile(logKey, logContent);
  }

  // 7. Update cooldown timestamp
  await prisma.agentMemory.upsert({
    where: { storeId_type_key: { storeId, type: 'meta', key: 'dream_last_run' } },
    create: { storeId, type: 'meta', key: 'dream_last_run', content: new Date().toISOString() },
    update: { content: new Date().toISOString() },
  });

  console.log(`  ✓ AutoDream: complete for store ${storeId}`);
  if (dreamResult.contradictions?.length) {
    console.log(`  ⚠️  AutoDream: ${dreamResult.contradictions.length} contradiction(s) detected — check dream log.`);
  }
}

/** Called from the main setInterval — checks if any store needs a dream run. */
export async function checkDreamSchedule(
  stores: Array<{ id: string; userId: string }>
): Promise<void> {
  const now = new Date();
  const hourUTC = now.getUTCHours();

  // Only run during the dream window
  if (hourUTC !== DREAM_HOUR_UTC) return;

  for (const store of stores) {
    try {
      // Check cooldown
      const lastRunRecord = await prisma.agentMemory.findUnique({
        where: { storeId_type_key: { storeId: store.id, type: 'meta', key: 'dream_last_run' } },
      }).catch(() => null);

      if (lastRunRecord) {
        const lastRun = new Date(lastRunRecord.content);
        const hoursSince = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
        if (hoursSince < DREAM_COOLDOWN_HOURS) continue;
      }

      // Run dream (non-blocking — don't await to avoid blocking the interval)
      runAutoDream(store.id, store.userId).catch((err) =>
        console.error(`AutoDream error for store ${store.id}:`, err)
      );
    } catch (err) {
      console.error(`AutoDream schedule check failed for store ${store.id}:`, err);
    }
  }
}
