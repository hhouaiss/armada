import { ToolContext } from '../types/operations.js';
import { MemoryEngine, markTaskRunning, clearTaskRunning } from './memory-engine.js';
import { saveChatMessage, prisma } from './database.js';

/**
 * Async dispatch — running a specialist outside the request/response cycle.
 *
 * A specialist producing a real deliverable (full HTML email, audit, report)
 * takes minutes. Holding the Major's tool call open for that long breaks on
 * every timeout in the chain (tool registry, Railway proxy, Telegram). So the
 * dispatch tool returns an acknowledgement immediately and the work continues
 * here, delivering the result through the push channels when it lands.
 */

type AlertFn = (storeId: string, text: string, hasButtons?: boolean) => Promise<void>;
type BroadcastFn = (storeId: string, message: { type: 'agent_message'; agentId: string; message: string }) => void;

let telegramNotifier: AlertFn | null = null;
let broadcaster: BroadcastFn | null = null;

/** Wired at startup by index.ts once the Telegram bot is up. */
export function setAsyncDispatchTelegramNotifier(fn: AlertFn): void {
  telegramNotifier = fn;
}

/** Wired at startup by index.ts so results reach subscribed web clients. */
export function setAsyncDispatchBroadcaster(fn: BroadcastFn): void {
  broadcaster = fn;
}

interface BackgroundDispatch {
  /** The specialist agent instance resolved from the router. */
  agent: { config: { id: string; name: string }; chat: Function };
  task: string;
  context: ToolContext;
  conversationId: string;
  /** Inbox task id, created as 'in_progress' before this runs. */
  taskId: string;
}

/**
 * Runs the specialist in the background. Never rejects — a failure is recorded
 * on the inbox task and reported through the same channels as a success, so a
 * dispatch is never silently lost.
 */
export function runInBackground(dispatch: BackgroundDispatch): void {
  void execute(dispatch).catch((err) =>
    console.error('✗ Async dispatch crashed outside its own handler:', err)
  );
}

async function execute({ agent, task, context, conversationId, taskId }: BackgroundDispatch): Promise<void> {
  const { storeId } = context;
  const engine = new MemoryEngine(storeId);
  const name = agent.config.name;
  const started = Date.now();

  markTaskRunning(conversationId, taskId);
  try {
    const response: string = await agent.chat(task, { ...context, agentId: agent.config.id }, conversationId);
    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`✓ Async dispatch done: ${name} in ${elapsed}s`);

    await engine.completeInboxTask(agent.config.id, taskId, { result: response });
    await deliver(storeId, agent.config.id, name, response, task);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Async dispatch failed: ${name} — ${message}`);

    await engine
      .completeInboxTask(agent.config.id, taskId, { status: 'failed', result: message })
      .catch(() => {});
    await deliver(
      storeId,
      agent.config.id,
      name,
      `⚠️ La tâche a échoué : ${message}`,
      task
    );
  } finally {
    clearTaskRunning(conversationId);
  }
}

/**
 * Persists the result in the agent's chat history (so the web UI shows it on
 * reload) and pushes it live to Telegram + subscribed WebSocket clients.
 */
async function deliver(
  storeId: string,
  agentId: string,
  agentName: string,
  response: string,
  task: string
): Promise<void> {
  await saveChatMessage({
    storeId,
    agentId,
    sender: 'agent',
    content: response,
    metadata: { asyncDispatch: true, task },
  }).catch((err) => console.error('Async dispatch: failed to save chat message:', err));

  broadcaster?.(storeId, { type: 'agent_message', agentId, message: response });

  if (telegramNotifier) {
    const header = `✅ *${agentName}* a terminé sa tâche\n_${truncate(task, 120)}_\n\n`;
    await telegramNotifier(storeId, header + truncate(response, 3500), false).catch((err) =>
      console.error('Async dispatch: Telegram notify failed:', err)
    );
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}


// ─── Startup recovery ─────────────────────────────────────────────────────────

/**
 * A background dispatch lives only in the process that started it. If the
 * gateway restarts mid-flight, its inbox task stays 'in_progress' forever and
 * shows up in the agent's prompt as work it believes is still running.
 *
 * Swept at startup only, with a grace period: during a rolling deploy a sibling
 * instance may legitimately still be running a recent dispatch, and the
 * dispatch tool's own ceiling is 10 minutes.
 */
const STALE_AFTER_MS = 15 * 60_000;

export async function reclaimStaleDispatches(): Promise<number> {
  let reclaimed = 0;

  const rows = await prisma.agentMemory.findMany({ where: { type: 'inbox' } }).catch((err) => {
    console.error('Async dispatch: stale sweep could not read inboxes:', err);
    return [];
  });

  const cutoff = Date.now() - STALE_AFTER_MS;

  for (const row of rows) {
    let tasks: any[];
    try {
      tasks = JSON.parse(row.content);
      if (!Array.isArray(tasks)) continue;
    } catch {
      continue; // corrupt inbox — leave it alone rather than overwrite it
    }

    const stale = tasks.filter(
      (t) => t?.status === 'in_progress' && Date.parse(t.assignedAt) < cutoff
    );
    if (stale.length === 0) continue;

    for (const t of stale) {
      t.status = 'failed';
      t.completedAt = new Date().toISOString();
      t.result =
        'Interrompue par un redémarrage du gateway — le travail n\'a pas été livré. À relancer si besoin.';
      console.log(`  ↺ Reclaimed stale dispatch for agent ${row.key}: "${String(t.task).slice(0, 60)}..."`);
    }
    reclaimed += stale.length;

    await prisma.agentMemory
      .update({ where: { id: row.id }, data: { content: JSON.stringify(tasks) } })
      .catch((err) => console.error(`Async dispatch: could not save inbox ${row.key}:`, err));
  }

  return reclaimed;
}
