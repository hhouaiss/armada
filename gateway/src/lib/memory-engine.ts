import { prisma } from './database.js';

export interface MemoryDecision {
  date: string;   // ISO date YYYY-MM-DD
  decision: string;
  reason?: string;
}

// ── Agent Inbox ───────────────────────────────────────────────────────────────

export interface InboxTask {
  id: string;
  task: string;
  from: string;          // e.g. "Major"
  scheduledDate?: string; // YYYY-MM-DD if agent was told to do it on a specific date
  assignedAt: string;    // ISO timestamp
  // 'in_progress' = an async dispatch is running the task right now. It is not
  // shown as pending in the prompt so the agent doesn't restart its own work.
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  completedAt?: string;  // ISO timestamp, set when the task leaves in_progress
  result?: string;       // deliverable (or error message) from an async dispatch
}

export interface MemoryIndex {
  lastUpdated: string;
  decisions: MemoryDecision[];   // Max 10 most recent kept
  keyFacts: string[];            // Max 20 bullet points
  topics: Record<string, string>; // readable label → DB key (e.g. 'Stratégie ventes' → 'ventes/strategy')
}

const EMPTY_INDEX: MemoryIndex = {
  lastUpdated: '',
  decisions: [],
  keyFacts: [],
  topics: {},
};

/**
 * Async dispatches currently executing in this process, keyed by the
 * conversation running them. The agent doing the work must not be told it
 * "already has this running in the background" — that reads as an instruction
 * to stop. Every other conversation still sees the task as in progress.
 */
const runningByConversation = new Map<string, string>(); // conversationId → taskId

export function markTaskRunning(conversationId: string, taskId: string): void {
  runningByConversation.set(conversationId, taskId);
}

export function clearTaskRunning(conversationId: string): void {
  runningByConversation.delete(conversationId);
}

export class MemoryEngine {
  constructor(private storeId: string) {}

  // ── Index (Couche 1) ──────────────────────────────────────────────────────

  async loadIndex(): Promise<MemoryIndex | null> {
    try {
      const row = await prisma.agentMemory.findUnique({
        where: { storeId_type_key: { storeId: this.storeId, type: 'index', key: 'index' } },
      });
      if (!row) return null;
      return JSON.parse(row.content) as MemoryIndex;
    } catch {
      return null;
    }
  }

  async saveIndex(index: MemoryIndex): Promise<void> {
    const now = new Date().toISOString().split('T')[0];
    index.lastUpdated = now;

    // Keep only the 10 most recent decisions and 20 key facts
    index.decisions = index.decisions.slice(-10);
    index.keyFacts = index.keyFacts.slice(-20);

    await prisma.agentMemory.upsert({
      where: { storeId_type_key: { storeId: this.storeId, type: 'index', key: 'index' } },
      create: {
        storeId: this.storeId,
        type: 'index',
        key: 'index',
        content: JSON.stringify(index, null, 2),
      },
      update: {
        content: JSON.stringify(index, null, 2),
      },
    });
  }

  // ── Topic files (Couche 2) ────────────────────────────────────────────────

  async loadTopicFile(key: string): Promise<string | null> {
    try {
      const row = await prisma.agentMemory.findUnique({
        where: { storeId_type_key: { storeId: this.storeId, type: 'topic', key } },
      });
      return row?.content ?? null;
    } catch {
      return null;
    }
  }

  async saveTopicFile(key: string, content: string, label?: string): Promise<void> {
    await prisma.agentMemory.upsert({
      where: { storeId_type_key: { storeId: this.storeId, type: 'topic', key } },
      create: { storeId: this.storeId, type: 'topic', key, content },
      update: { content },
    });

    // Register this topic key in the index if not already there
    if (label) {
      const index = (await this.loadIndex()) ?? { ...EMPTY_INDEX };
      if (!index.topics[label]) {
        index.topics[label] = key;
        await this.saveIndex(index);
      }
    }
  }

  // ── System prompt injection (< 600 tokens) ───────────────────────────────

  /**
   * Returns a compact markdown section for injection into the system prompt.
   * Returns empty string if no memory exists yet (no bloat for new stores).
   */
  async buildIndexSummary(): Promise<string> {
    const index = await this.loadIndex();
    if (!index) return '';

    const hasContent =
      index.decisions.length > 0 ||
      index.keyFacts.length > 0 ||
      Object.keys(index.topics).length > 0;

    if (!hasContent) return '';

    const lines: string[] = ['## MÉMOIRE DE L\'ÉQUIPE'];
    if (index.lastUpdated) {
      lines.push(`Dernière mise à jour: ${index.lastUpdated}`);
    }

    if (index.decisions.length > 0) {
      lines.push('', 'Décisions récentes:');
      for (const d of index.decisions.slice(-5)) {
        const reason = d.reason ? ` (${d.reason})` : '';
        lines.push(`- [${d.date}] ${d.decision}${reason}`);
      }
    }

    if (index.keyFacts.length > 0) {
      lines.push('', 'Faits clés:');
      for (const fact of index.keyFacts) {
        lines.push(`- ${fact}`);
      }
    }

    if (Object.keys(index.topics).length > 0) {
      lines.push('', 'Topics disponibles (utilise memory_read pour charger le détail):');
      for (const [label, key] of Object.entries(index.topics)) {
        lines.push(`- ${key} — ${label}`);
      }
    }

    return lines.join('\n');
  }

  // ── Convenience helpers for memory_write tool ────────────────────────────

  async addDecision(decision: string, reason?: string): Promise<void> {
    const index = (await this.loadIndex()) ?? { ...EMPTY_INDEX };
    index.decisions.push({
      date: new Date().toISOString().split('T')[0],
      decision,
      reason,
    });
    await this.saveIndex(index);
  }

  async addKeyFact(fact: string): Promise<void> {
    const index = (await this.loadIndex()) ?? { ...EMPTY_INDEX };
    // Avoid exact duplicates
    if (!index.keyFacts.includes(fact)) {
      index.keyFacts.push(fact);
      await this.saveIndex(index);
    }
  }

  async removeKeyFact(fact: string): Promise<void> {
    const index = await this.loadIndex();
    if (!index) return;
    index.keyFacts = index.keyFacts.filter((f) => f !== fact);
    await this.saveIndex(index);
  }

  // ── Agent Inbox (per-agent pending tasks) ────────────────────────────────────

  async loadInbox(agentId: string): Promise<InboxTask[]> {
    try {
      const row = await prisma.agentMemory.findUnique({
        where: { storeId_type_key: { storeId: this.storeId, type: 'inbox', key: agentId } },
      });
      if (!row) return [];
      return JSON.parse(row.content) as InboxTask[];
    } catch {
      return [];
    }
  }

  async saveInbox(agentId: string, tasks: InboxTask[]): Promise<void> {
    await prisma.agentMemory.upsert({
      where: { storeId_type_key: { storeId: this.storeId, type: 'inbox', key: agentId } },
      create: { storeId: this.storeId, type: 'inbox', key: agentId, content: JSON.stringify(tasks) },
      update: { content: JSON.stringify(tasks) },
    });
  }

  async addToInbox(
    agentId: string,
    task: Omit<InboxTask, 'id' | 'assignedAt' | 'status'> & { status?: InboxTask['status'] }
  ): Promise<string> {
    const tasks = await this.loadInbox(agentId);
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    tasks.push({
      ...task,
      id,
      assignedAt: new Date().toISOString(),
      status: task.status ?? 'pending',
    });
    await this.saveInbox(agentId, tasks);
    return id;
  }

  /**
   * Marks a task finished. `result` carries the deliverable of an async
   * dispatch (or the error message when status is 'failed') so it survives
   * past the conversation that produced it.
   */
  async completeInboxTask(
    agentId: string,
    taskId: string,
    opts: { result?: string; status?: 'done' | 'failed' } = {}
  ): Promise<boolean> {
    const tasks = await this.loadInbox(agentId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return false;
    task.status = opts.status ?? 'done';
    task.completedAt = new Date().toISOString();
    if (opts.result !== undefined) task.result = opts.result;
    // Keep every unfinished task + the 20 most recent finished ones
    const open = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
    const recent = tasks.filter((t) => t.status === 'done' || t.status === 'failed').slice(-20);
    await this.saveInbox(agentId, [...open, ...recent]);
    return true;
  }

  /** The task a running async dispatch is working on, if any. */
  async findInboxTask(agentId: string, taskId: string): Promise<InboxTask | null> {
    const tasks = await this.loadInbox(agentId);
    return tasks.find((t) => t.id === taskId) ?? null;
  }

  /**
   * Returns a compact inbox section for the system prompt.
   *
   * Shows three blocks so the agent knows where they stand, not just what is
   * queued: what is running right now (async dispatch), what is still to do,
   * and what was just delivered. Without the last two the agent re-announces
   * or redoes work it has already finished.
   */
  async buildInboxSection(agentId: string, conversationId?: string): Promise<string> {
    const tasks = await this.loadInbox(agentId);
    if (tasks.length === 0) return '';

    // The task this very conversation was spawned to execute is not "context" —
    // it's the current job, already in the agent's instructions.
    const selfTaskId = conversationId ? runningByConversation.get(conversationId) : undefined;
    const inProgress = tasks.filter((t) => t.status === 'in_progress' && t.id !== selfTaskId);
    const pending = tasks.filter((t) => t.status === 'pending');
    const finished = tasks
      .filter((t) => t.status === 'done' || t.status === 'failed')
      .slice(-5)
      .reverse();

    if (inProgress.length === 0 && pending.length === 0 && finished.length === 0) return '';

    const today = new Date().toISOString().split('T')[0];
    const lines: string[] = ['\n\n## TON INBOX'];

    if (inProgress.length > 0) {
      lines.push('\n### 🔄 EN COURS');
      lines.push(
        "Tu travailles déjà sur ces tâches en arrière-plan. Ne les recommence pas et ne les réannonce pas — " +
          "si on t'en parle, dis simplement où tu en es.\n"
      );
      for (const t of inProgress) {
        lines.push(`- [id: ${t.id}] ${t.task} _(démarré le ${formatStamp(t.assignedAt)}, assigné par ${t.from})_`);
      }
    }

    if (pending.length > 0) {
      lines.push('\n### 📋 À FAIRE');
      lines.push(
        "Ces tâches t'ont été assignées par le Major ou un autre agent. Exécute-les au bon moment et appelle " +
          '`inbox_complete` quand c\'est fait.\n'
      );
      for (const t of pending) {
        const dateLabel = t.scheduledDate
          ? t.scheduledDate === today
            ? " ⚡ AUJOURD'HUI"
            : ` 📅 ${t.scheduledDate}`
          : '';
        lines.push(`- [id: ${t.id}]${dateLabel} ${t.task} _(assigné par ${t.from} le ${t.assignedAt.split('T')[0]})_`);
      }
    }

    if (finished.length > 0) {
      lines.push('\n### ✅ TERMINÉ RÉCEMMENT');
      lines.push(
        "Déjà livré. Sers-t'en comme contexte (le marchand a reçu ces résultats) plutôt que de refaire le travail.\n"
      );
      for (const t of finished) {
        const icon = t.status === 'failed' ? '⚠️ échec' : 'livré';
        const stamp = t.completedAt ? formatStamp(t.completedAt) : t.assignedAt.split('T')[0];
        const excerpt = t.result ? ` → ${summarise(t.result)}` : '';
        lines.push(`- ${t.task} _(${icon} le ${stamp})_${excerpt}`);
      }
    }

    return lines.join('\n');
  }
}

// ─── Inbox formatting helpers ─────────────────────────────────────────────────

/** "2026-08-28 14:32" — date alone is too coarse for same-day async tasks. */
function formatStamp(iso: string): string {
  const [date, time] = iso.split('T');
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

/** One-line gist of a deliverable — the full text would flood the prompt. */
function summarise(result: string): string {
  const flat = result.replace(/\s+/g, ' ').trim();
  return flat.length <= 160 ? flat : `${flat.slice(0, 160)}…`;
}
