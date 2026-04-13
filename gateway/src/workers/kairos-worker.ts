/**
 * KAIROS Worker
 *
 * A proactive background daemon that runs every 15 minutes per active store.
 * KAIROS observes store metrics, uses Haiku to decide if something needs attention,
 * and fires alerts — WITHOUT ever executing mutations.
 *
 * Rule: KAIROS can WATCH and ALERT. It can NEVER mutate data on its own.
 * Every action suggestion requires explicit human confirmation.
 *
 * Sprint 4 — Armada HQ
 */

import OpenAI from 'openai';
import { prisma, getStoreCredentials } from '../lib/database.js';
import { ShopifyClient, decryptToken } from '../lib/shopify-client.js';

const OPENROUTER_MODEL = 'google/gemma-4-26b-a4b-it';

// ─── Constants ────────────────────────────────────────────────────────────────

// How often KAIROS can fire for the same store (minutes)
const KAIROS_COOLDOWN_MINUTES = 15;

// Default thresholds (overridable per store via AgentMemory)
const DEFAULT_THRESHOLDS: KairosThresholds = {
  lowStockUnits: 5,          // Alert when a variant has ≤ N units
  orderDelayHours: 48,       // Alert on unfulfilled orders older than N hours
  openOrdersAlertCount: 50,  // Alert when unfulfilled orders exceed N
  enabled: true,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface KairosThresholds {
  lowStockUnits: number;
  orderDelayHours: number;
  openOrdersAlertCount: number;
  enabled: boolean;
}

interface StoreSnapshot {
  lowStockVariants: Array<{ productTitle: string; variantTitle: string; stock: number }>;
  delayedOrders: Array<{ id: string; name: string; hoursOld: number; totalPrice: string }>;
  totalUnfulfilledOrders: number;
  fetchedAt: string;
}

/**
 * Rolling baseline built from past KAIROS ticks.
 * Uses exponential moving average (α=0.15) so recent ticks weigh more
 * but the signal is stable. After 20 samples the baseline is reliable.
 */
interface KairosBaseline {
  avgUnfulfilledOrders: number;
  avgDelayedOrders: number;
  avgLowStockCount: number;
  samplesCount: number;
  lastUpdated: string;
}

interface KairosAlert {
  type: 'low_stock' | 'order_delay' | 'high_order_backlog';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  actionSuggestion?: string;
}

interface KairosDecision {
  shouldAlert: boolean;
  alerts: KairosAlert[];
  summary: string;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const KAIROS_SYSTEM_PROMPT = `Tu es KAIROS, un daemon de surveillance proactif pour un business e-commerce.
Tu analyses un snapshot des métriques en temps réel et décides si le propriétaire doit être alerté.

RÈGLES ABSOLUES:
- Tu ne JAMAIS exécutes d'actions. Tu OBSERVES et ALERTES uniquement.
- N'alerte QUE si la situation est genuinement anormale ou urgente — évite le bruit à tout prix.
- Des commandes non expédiées récentes (< 48h) sont NORMALES. Alerte seulement si le seuil est dépassé ET si les retards sont réels (hoursOld élevé).
- Du stock bas sur quelques variants n'est pas toujours urgent : n'alerte que sur les ruptures (0 unité) ou si plusieurs variants sont affectés.
- Sois concis : chaque message doit être compréhensible en 10 secondes.
- Propose une action concrète quand c'est pertinent, toujours sous forme de question oui/non.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`;

const KAIROS_USER_PROMPT = (
  snapshot: StoreSnapshot,
  thresholds: KairosThresholds,
  baseline: KairosBaseline | null,
) => {
  // Build deviation context only once we have enough samples to be meaningful
  const hasBaseline = baseline !== null && baseline.samplesCount >= 5;

  const deviationLine = (label: string, current: number, avg: number): string => {
    if (avg === 0) return `${label}: ${current} (pas encore de baseline)`;
    const pct = Math.round(((current - avg) / avg) * 100);
    const sign = pct >= 0 ? '+' : '';
    return `${label}: ${current} (moyenne: ${avg.toFixed(1)} — ${sign}${pct}%)`;
  };

  const baselineSection = hasBaseline
    ? `\nCONTEXTE HISTORIQUE (${baseline!.samplesCount} ticks passés):
${deviationLine('Commandes non expédiées', snapshot.totalUnfulfilledOrders, baseline!.avgUnfulfilledOrders)}
${deviationLine('Commandes en retard', snapshot.delayedOrders.length, baseline!.avgDelayedOrders)}
${deviationLine('Variants stock bas', snapshot.lowStockVariants.length, baseline!.avgLowStockCount)}

⚠️ N'alerte QUE si un écart dépasse +50% par rapport à la moyenne, ou si la valeur absolue est critique (rupture totale, retard > 72h).`
    : `\nCONTEXTE HISTORIQUE: Baseline en cours de construction (${baseline?.samplesCount ?? 0}/5 ticks). Sois conservateur dans tes alertes.`;

  return `
SNAPSHOT BOUTIQUE — ${snapshot.fetchedAt}
${baselineSection}

STOCK BAS (≤ ${thresholds.lowStockUnits} unités):
${snapshot.lowStockVariants.length === 0
  ? '(aucun variant en rupture ou stock bas)'
  : snapshot.lowStockVariants.map(v => `- "${v.productTitle}" / ${v.variantTitle} : ${v.stock} unités`).join('\n')
}

COMMANDES NON EXPÉDIÉES DEPUIS +${thresholds.orderDelayHours}h:
${snapshot.delayedOrders.length === 0
  ? '(aucune commande en retard)'
  : snapshot.delayedOrders.map(o => `- Commande ${o.name} (${o.totalPrice}) — ${o.hoursOld}h de retard`).join('\n')
}

TOTAL COMMANDES NON EXPÉDIÉES: ${snapshot.totalUnfulfilledOrders}
SEUIL D'ALERTE BACKLOG: ${thresholds.openOrdersAlertCount}

Analyse ce snapshot. Y a-t-il des situations qui méritent une alerte immédiate ?
Réponds en JSON:
{
  "shouldAlert": true/false,
  "alerts": [
    {
      "type": "low_stock" | "order_delay" | "high_order_backlog",
      "severity": "info" | "warning" | "critical",
      "message": "Message court et précis pour le propriétaire",
      "actionSuggestion": "Question optionnelle oui/non si une action est recommandée"
    }
  ],
  "summary": "Résumé en 1 phrase de la situation (même si pas d'alerte)"
}`;
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function buildStoreSnapshot(
  storeId: string,
  thresholds: KairosThresholds
): Promise<StoreSnapshot | null> {
  try {
    // Non-Shopify businesses: getStoreCredentials may throw if no integration.
    // In that case, return an empty snapshot so KAIROS still runs the LLM tick.
    let store: Awaited<ReturnType<typeof getStoreCredentials>> | null = null;
    try {
      store = await getStoreCredentials(storeId);
    } catch {
      // No Shopify integration — return a minimal snapshot (no stock/order data)
      return {
        lowStockVariants: [],
        delayedOrders: [],
        totalUnfulfilledOrders: 0,
        fetchedAt: new Date().toISOString(),
      };
    }

    const accessToken = decryptToken(store.accessToken);
    const client = new ShopifyClient(store.shopifyDomain, accessToken);

    // Fetch products with inventory
    const { products } = await client.getProducts({ limit: 50 });

    const lowStockVariants: StoreSnapshot['lowStockVariants'] = [];
    for (const product of products) {
      for (const variant of product.variants ?? []) {
        if (variant.inventory_quantity <= thresholds.lowStockUnits) {
          lowStockVariants.push({
            productTitle: product.title,
            variantTitle: variant.title === 'Default Title' ? '' : variant.title,
            stock: variant.inventory_quantity,
          });
        }
      }
    }

    // Fetch open orders, then filter client-side to unfulfilled ones only.
    // 'unfulfilled' is NOT a valid Shopify order status — valid values are
    // open / closed / cancelled. Passing it would be ignored by Shopify's
    // GraphQL API and return all orders, causing false positives.
    const { orders: openOrders } = await client.getOrders({ status: 'open', limit: 100 });

    // Keep only orders that are not yet fulfilled (unfulfilled or partially_fulfilled).
    const unfulfilledOrders = openOrders.filter(
      (o) => o.fulfillment_status !== 'fulfilled'
    );

    const now = Date.now();
    const delayMs = thresholds.orderDelayHours * 60 * 60 * 1000;
    const delayedOrders: StoreSnapshot['delayedOrders'] = [];

    for (const order of unfulfilledOrders) {
      const createdMs = new Date(order.created_at).getTime();
      const ageMs = now - createdMs;
      if (ageMs > delayMs) {
        const hoursOld = Math.round(ageMs / (1000 * 60 * 60));
        delayedOrders.push({
          id: order.id,
          name: order.name,
          hoursOld,
          totalPrice: `${order.total_price} ${order.currency ?? ''}`.trim(),
        });
      }
    }

    return {
      lowStockVariants,
      delayedOrders,
      totalUnfulfilledOrders: unfulfilledOrders.length,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`  KAIROS: snapshot fetch failed for store ${storeId}:`, err);
    return null;
  }
}

// ─── Thresholds & settings helpers ───────────────────────────────────────────

// ─── Baseline helpers ─────────────────────────────────────────────────────────

// EMA smoothing factor: 0.15 means ~13 ticks to reach 90% weight on new data.
// Low enough to be stable, high enough to track trends over days.
const EMA_ALPHA = 0.15;

async function loadBaseline(storeId: string): Promise<KairosBaseline | null> {
  const row = await prisma.agentMemory
    .findUnique({
      where: { storeId_type_key: { storeId, type: 'meta', key: 'kairos_baseline' } },
    })
    .catch(() => null);
  if (!row) return null;
  try {
    return JSON.parse(row.content) as KairosBaseline;
  } catch {
    return null;
  }
}

async function updateBaseline(storeId: string, snapshot: StoreSnapshot): Promise<void> {
  const existing = await loadBaseline(storeId);

  let baseline: KairosBaseline;
  if (!existing) {
    // First sample — seed directly from the snapshot
    baseline = {
      avgUnfulfilledOrders: snapshot.totalUnfulfilledOrders,
      avgDelayedOrders: snapshot.delayedOrders.length,
      avgLowStockCount: snapshot.lowStockVariants.length,
      samplesCount: 1,
      lastUpdated: new Date().toISOString(),
    };
  } else {
    // EMA update
    const ema = (prev: number, current: number) =>
      EMA_ALPHA * current + (1 - EMA_ALPHA) * prev;

    baseline = {
      avgUnfulfilledOrders: ema(existing.avgUnfulfilledOrders, snapshot.totalUnfulfilledOrders),
      avgDelayedOrders: ema(existing.avgDelayedOrders, snapshot.delayedOrders.length),
      avgLowStockCount: ema(existing.avgLowStockCount, snapshot.lowStockVariants.length),
      samplesCount: Math.min(existing.samplesCount + 1, 200), // cap to avoid overflow
      lastUpdated: new Date().toISOString(),
    };
  }

  await prisma.agentMemory.upsert({
    where: { storeId_type_key: { storeId, type: 'meta', key: 'kairos_baseline' } },
    create: { storeId, type: 'meta', key: 'kairos_baseline', content: JSON.stringify(baseline) },
    update: { content: JSON.stringify(baseline) },
  });
}

// ─── Thresholds & settings helpers ───────────────────────────────────────────

async function loadKairosThresholds(storeId: string): Promise<KairosThresholds> {
  const record = await prisma.agentMemory
    .findUnique({
      where: { storeId_type_key: { storeId, type: 'meta', key: 'kairos_thresholds' } },
    })
    .catch(() => null);

  if (!record) return { ...DEFAULT_THRESHOLDS };

  try {
    const overrides = JSON.parse(record.content) as Partial<KairosThresholds>;
    return { ...DEFAULT_THRESHOLDS, ...overrides };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

async function isKairosEnabled(storeId: string): Promise<boolean> {
  const record = await prisma.agentMemory
    .findUnique({
      where: { storeId_type_key: { storeId, type: 'meta', key: 'kairos_enabled' } },
    })
    .catch(() => null);

  if (!record) return DEFAULT_THRESHOLDS.enabled;
  return record.content === 'true';
}

async function getOpenRouterKeyForStore(userId: string): Promise<string | null> {
  const keyRecord = await prisma.lLMApiKey
    .findUnique({ where: { userId_provider: { userId, provider: 'openrouter' } } })
    .catch(() => null);

  if (!keyRecord) return null;
  return decryptToken(keyRecord.apiKey);
}

// ─── Telegram notifier (wired at startup by index.ts) ────────────────────────

type TelegramNotifierFn = (storeId: string, text: string, hasActionButtons?: boolean) => Promise<void>;
let _telegramNotifier: TelegramNotifierFn | null = null;

/** Called once at startup to wire up the Telegram bot. */
export function setTelegramNotifier(fn: TelegramNotifierFn): void {
  _telegramNotifier = fn;
}

// ─── Alert output ─────────────────────────────────────────────────────────────

async function fireAlert(storeId: string, decision: KairosDecision): Promise<void> {
  if (!decision.shouldAlert) return;

  console.log(`\n🚨 KAIROS ALERT — Store ${storeId}`);
  console.log(`   Summary: ${decision.summary}`);

  for (const alert of decision.alerts) {
    const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵';
    console.log(`\n   ${icon} [${alert.type.toUpperCase()}] ${alert.message}`);
    if (alert.actionSuggestion) {
      console.log(`      → ${alert.actionSuggestion}`);
    }
  }

  if (_telegramNotifier) {
    const lines: string[] = [`🚨 *KAIROS — Alerte*\n`, `_${decision.summary}_`];
    for (const alert of decision.alerts) {
      const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`\n${icon} *${alert.message}*`);
      if (alert.actionSuggestion) lines.push(`→ ${alert.actionSuggestion}`);
    }
    const hasAction = decision.alerts.some((a) => !!a.actionSuggestion);
    await _telegramNotifier(storeId, lines.join('\n'), hasAction).catch((err) =>
      console.error('KAIROS: Telegram notify failed:', err)
    );
  }
}

// ─── Main tick ────────────────────────────────────────────────────────────────

/** Run one KAIROS cycle for a store. */
export async function runKairosTick(storeId: string, userId: string): Promise<void> {
  console.log(`\n⏱  KAIROS: tick for store ${storeId}...`);
  const start = Date.now();

  // 1. Load thresholds + baseline in parallel
  const [thresholds, baseline] = await Promise.all([
    loadKairosThresholds(storeId),
    loadBaseline(storeId),
  ]);

  // 2. Build Shopify snapshot
  const snapshot = await buildStoreSnapshot(storeId, thresholds);
  if (!snapshot) {
    console.log(`  ⚠️  KAIROS: no snapshot for store ${storeId}, skipping.`);
    return;
  }

  // 3. Update baseline with this tick's data (before the LLM call — always runs)
  await updateBaseline(storeId, snapshot);

  // 4. Get OpenRouter API key
  const apiKey = await getOpenRouterKeyForStore(userId);
  if (!apiKey) {
    console.warn(`  ⚠️  KAIROS: no OpenRouter key for store ${storeId}, skipping.`);
    return;
  }

  // 5. Ask Gemma 4 to analyse the snapshot with baseline context
  let decision: KairosDecision;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://storeteam.ai', 'X-Title': 'StoreTeam' },
    });
    const response = await client.chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: 512,
      messages: [
        { role: 'system', content: KAIROS_SYSTEM_PROMPT },
        { role: 'user', content: KAIROS_USER_PROMPT(snapshot, thresholds, baseline) },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    decision = JSON.parse(text) as KairosDecision;
  } catch (err) {
    console.error(`  ✗ KAIROS: Gemma call failed for store ${storeId}:`, err);
    return;
  }

  // 6. Fire alerts if needed
  await fireAlert(storeId, decision);

  // 7. Update cooldown timestamp
  await prisma.agentMemory.upsert({
    where: { storeId_type_key: { storeId, type: 'meta', key: 'kairos_last_tick' } },
    create: {
      storeId,
      type: 'meta',
      key: 'kairos_last_tick',
      content: new Date().toISOString(),
    },
    update: { content: new Date().toISOString() },
  });

  const elapsed = Date.now() - start;
  console.log(
    `  ✓ KAIROS: tick complete for store ${storeId} (${elapsed}ms)` +
    (decision.shouldAlert ? ` — ${decision.alerts.length} alert(s) fired` : ' — no alerts')
  );

  // Budget guard: warn if over 15s
  if (elapsed > 15_000) {
    console.warn(`  ⚠️  KAIROS: overtime ${elapsed}ms > 15000ms for store ${storeId}`);
  }
}

// ─── Schedule checker (called from setInterval) ───────────────────────────────

/** Called from the main setInterval — fires KAIROS ticks for eligible stores. */
export async function checkKairosSchedule(
  stores: Array<{ id: string; userId: string }>
): Promise<void> {
  const now = new Date();

  for (const store of stores) {
    try {
      // Check enabled flag
      const enabled = await isKairosEnabled(store.id);
      if (!enabled) continue;

      // Check cooldown
      const lastTickRecord = await prisma.agentMemory
        .findUnique({
          where: { storeId_type_key: { storeId: store.id, type: 'meta', key: 'kairos_last_tick' } },
        })
        .catch(() => null);

      if (lastTickRecord) {
        const lastTick = new Date(lastTickRecord.content);
        const minutesSince = (now.getTime() - lastTick.getTime()) / (1000 * 60);
        if (minutesSince < KAIROS_COOLDOWN_MINUTES) continue;
      }

      // Run tick (non-blocking)
      runKairosTick(store.id, store.userId).catch((err) =>
        console.error(`KAIROS error for store ${store.id}:`, err)
      );
    } catch (err) {
      console.error(`KAIROS schedule check failed for store ${store.id}:`, err);
    }
  }
}

// ─── Settings management ──────────────────────────────────────────────────────

/** Enable or disable KAIROS for a store. */
export async function setKairosEnabled(storeId: string, enabled: boolean): Promise<void> {
  await prisma.agentMemory.upsert({
    where: { storeId_type_key: { storeId, type: 'meta', key: 'kairos_enabled' } },
    create: { storeId, type: 'meta', key: 'kairos_enabled', content: String(enabled) },
    update: { content: String(enabled) },
  });
}

/** Update KAIROS thresholds for a store. */
export async function setKairosThresholds(
  storeId: string,
  thresholds: Partial<KairosThresholds>
): Promise<void> {
  const current = await loadKairosThresholds(storeId);
  const merged = { ...current, ...thresholds };

  await prisma.agentMemory.upsert({
    where: { storeId_type_key: { storeId, type: 'meta', key: 'kairos_thresholds' } },
    create: { storeId, type: 'meta', key: 'kairos_thresholds', content: JSON.stringify(merged) },
    update: { content: JSON.stringify(merged) },
  });
}
