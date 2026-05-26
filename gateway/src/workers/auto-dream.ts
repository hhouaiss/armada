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
import { decryptToken, ShopifyClient } from '../lib/shopify-client.js';

const OPENROUTER_MODEL = 'google/gemma-4-26b-a4b-it';

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

  // 7. Strategic planning phase (runs after memory consolidation)
  await runStrategicPlanning(storeId, userId, apiKey, dreamResult.summary ?? '');

  // 8. Update cooldown timestamp
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

// ─── Strategic Planning Phase ────────────────────────────────────────────────

const PLANNING_SYSTEM_PROMPT = `Tu es le cerveau stratégique d'une équipe d'agents IA qui gère un business autonomement.
Chaque nuit, tu analyses la situation du business et tu planifies les actions du lendemain.
Tu dois être concret, actionnable, et aligner chaque tâche sur les objectifs actifs.
Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`;

interface PlanResult {
  daily_plan: string; // Résumé du plan du jour (2-3 phrases)
  agent_tasks: Array<{
    agent_type: string;      // 'growth' | 'finance' | 'cx' | 'ads' | 'product' | 'seo' | 'content'
    task: string;            // Description courte de la tâche
    objective_link: string;  // Quel objectif cette tâche sert
    priority: 'high' | 'medium' | 'low';
  }>;
  projects_to_create: Array<{
    objective_title: string; // Titre exact de l'objectif parent
    project_title: string;   // Titre du projet à créer
    owner_type: string;      // Type d'agent owner
  }>;
}

async function runStrategicPlanning(
  storeId: string,
  userId: string,
  apiKey: string,
  dreamSummary: string
): Promise<void> {
  console.log(`  🧠 AutoDream: running strategic planning for store ${storeId}...`);

  try {
    // 1. Load active objectives
    const objectives = await prisma.objective.findMany({
      where: { storeId, status: 'active' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      include: { projects: { where: { status: 'active' } } },
    }).catch(() => [] as any[]);

    if (objectives.length === 0) {
      console.log(`  ℹ️  AutoDream: no active objectives — skipping strategic planning.`);
      return;
    }

    // 2. Load quick business metrics (last 7 days)
    let metricsText = '';
    try {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { shopifyDomain: true, accessToken: true },
      });
      if (store) {
        const accessToken = decryptToken(store.accessToken);
        const shopify = new ShopifyClient(store.shopifyDomain, accessToken);
        const orders = await shopify.getOrders({ limit: 20 }).catch(() => ({ orders: [] }));
        const recentRevenue = orders.orders
          .reduce((sum: number, o: any) => sum + parseFloat(o.total_price || '0'), 0)
          .toFixed(2);
        metricsText = `Dernières 20 commandes: ${orders.orders.length} | CA récent estimé: ${recentRevenue}€`;
      }
    } catch {
      metricsText = '(métriques indisponibles)';
    }

    // 3. Load active agents for this store
    const agents = await prisma.agent.findMany({
      where: { storeId, isActive: true },
      select: { type: true, name: true },
    });
    const agentTypes = agents.map((a: any) => `${a.type} (${a.name})`).join(', ');

    // 4. Build planning prompt
    const objectivesText = objectives.map((obj: any) => {
      const projects = obj.projects.map((p: any) => `  → Projet actif: ${p.title}`).join('\n');
      return [
        `OBJECTIF [${obj.priority === 3 ? 'HAUTE' : obj.priority === 2 ? 'MOYENNE' : 'BASSE'} PRIORITÉ]: ${obj.title}`,
        obj.description ? `  Description: ${obj.description}` : '',
        obj.notes ? `  Instructions: ${obj.notes}` : '',
        projects || '  → Aucun projet actif — à créer',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const planningPrompt = `
CONTEXTE BUSINESS:
${metricsText}

RÉSUMÉ DE LA NUIT (AutoDream):
${dreamSummary}

AGENTS DISPONIBLES: ${agentTypes}

OBJECTIFS ACTIFS:
${objectivesText}

---
Génère le plan stratégique du jour. Pour chaque objectif, identifie les tâches prioritaires à exécuter aujourd'hui.
Crée des projets pour les objectifs qui n'en ont pas encore.
Sois très concret: les tâches doivent être exécutables immédiatement par les agents.

Réponds en JSON:
{
  "daily_plan": "Résumé du plan du jour en 2-3 phrases",
  "agent_tasks": [
    {
      "agent_type": "growth|finance|cx|ads|product|seo|content|major",
      "task": "Description précise et exécutable de la tâche",
      "objective_link": "Titre de l'objectif que cette tâche sert",
      "priority": "high|medium|low"
    }
  ],
  "projects_to_create": [
    {
      "objective_title": "Titre exact de l'objectif parent",
      "project_title": "Titre court du projet",
      "owner_type": "growth|finance|cx|ads|product|seo|content"
    }
  ]
}`;

    // 5. Call Gemma for planning
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://storeteam.ai', 'X-Title': 'Armada-Planning' },
    });

    const response = await client.chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: PLANNING_SYSTEM_PROMPT },
        { role: 'user', content: planningPrompt },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    let plan: PlanResult;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      plan = JSON.parse(jsonMatch?.[0] ?? text) as PlanResult;
    } catch {
      console.warn('  ⚠️  AutoDream: could not parse planning response');
      return;
    }

    // 6. Create projects for objectives without them
    for (const proj of plan.projects_to_create ?? []) {
      const parentObjective = objectives.find(
        (o: any) => o.title.toLowerCase().includes(proj.objective_title.toLowerCase().slice(0, 20))
      );
      if (!parentObjective) continue;

      // Find owner agent
      const ownerAgent = agents.find((a: any) => a.type === proj.owner_type);

      await prisma.project.create({
        data: {
          storeId,
          objectiveId: parentObjective.id,
          title: proj.project_title,
          ownerAgentId: ownerAgent?.type ?? proj.owner_type,
          status: 'active',
        },
      }).catch(() => null); // Ignore duplicates
    }

    if ((plan.projects_to_create ?? []).length > 0) {
      console.log(`  ✓ AutoDream: created ${plan.projects_to_create.length} project(s) from planning`);
    }

    // 7. Write tasks to agent inboxes
    const engine = new MemoryEngine(storeId);
    const today = new Date().toISOString().split('T')[0];

    for (const task of plan.agent_tasks ?? []) {
      await engine.addToInbox(task.agent_type, {
        task: `[PLAN DU ${today}] ${task.task} | Objectif: ${task.objective_link} | Priorité: ${task.priority}`,
        from: 'AutoDream-Strategic',
        scheduledDate: today,
      }).catch(() => null);
    }

    console.log(`  ✓ AutoDream: dispatched ${(plan.agent_tasks ?? []).length} task(s) to agent inboxes`);

    // 8. Save daily plan to memory for morning briefing
    const planKey = `plan_du_jour/${today}`;
    const planContent = [
      `# Plan du jour — ${today}`,
      '',
      `## Vue d'ensemble`,
      plan.daily_plan,
      '',
      `## Tâches par agent (${(plan.agent_tasks ?? []).length})`,
      ...(plan.agent_tasks ?? []).map((t) =>
        `- [${t.priority.toUpperCase()}] **${t.agent_type}**: ${t.task} → *${t.objective_link}*`
      ),
      '',
      `## Projets créés (${(plan.projects_to_create ?? []).length})`,
      ...(plan.projects_to_create ?? []).map((p) =>
        `- "${p.project_title}" pour l'objectif "${p.objective_title}" (owner: ${p.owner_type})`
      ),
    ].join('\n');

    await engine.saveTopicFile(planKey, planContent);
    console.log(`  ✓ AutoDream: strategic plan saved → ${planKey}`);

  } catch (err) {
    console.error(`  ✗ AutoDream: strategic planning failed for store ${storeId}:`, err);
  }
}

// ─── Enable / disable helpers ─────────────────────────────────────────────────

export async function isDreamEnabled(storeId: string): Promise<boolean> {
  const record = await prisma.agentMemory
    .findUnique({
      where: { storeId_type_key: { storeId, type: 'meta', key: 'dream_enabled' } },
    })
    .catch(() => null);
  // Default: enabled (undefined = not set = true)
  return record ? record.content === 'true' : true;
}

export async function setDreamEnabled(storeId: string, enabled: boolean): Promise<void> {
  await prisma.agentMemory.upsert({
    where: { storeId_type_key: { storeId, type: 'meta', key: 'dream_enabled' } },
    create: { storeId, type: 'meta', key: 'dream_enabled', content: String(enabled) },
    update: { content: String(enabled) },
  });
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
      // Check enabled flag
      const enabled = await isDreamEnabled(store.id);
      if (!enabled) continue;

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
