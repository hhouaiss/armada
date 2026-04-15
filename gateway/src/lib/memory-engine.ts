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
  status: 'pending' | 'done';
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

  async addToInbox(agentId: string, task: Omit<InboxTask, 'id' | 'assignedAt' | 'status'>): Promise<string> {
    const tasks = await this.loadInbox(agentId);
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    tasks.push({ ...task, id, assignedAt: new Date().toISOString(), status: 'pending' });
    await this.saveInbox(agentId, tasks);
    return id;
  }

  async completeInboxTask(agentId: string, taskId: string): Promise<boolean> {
    const tasks = await this.loadInbox(agentId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return false;
    task.status = 'done';
    // Keep only recent done tasks (last 20) + all pending ones
    const pending = tasks.filter((t) => t.status === 'pending');
    const recent = tasks.filter((t) => t.status === 'done').slice(-20);
    await this.saveInbox(agentId, [...pending, ...recent]);
    return true;
  }

  /**
   * Returns a compact inbox section for the system prompt.
   * Only shows pending tasks. Returns '' if inbox is empty.
   */
  async buildInboxSection(agentId: string): Promise<string> {
    const tasks = await this.loadInbox(agentId);
    const pending = tasks.filter((t) => t.status === 'pending');
    if (pending.length === 0) return '';

    const today = new Date().toISOString().split('T')[0];
    const lines: string[] = ['\n\n## TÂCHES EN ATTENTE (INBOX)'];
    lines.push('Ces tâches t\'ont été assignées par le Major ou un autre agent. Exécute-les au bon moment et appelle `inbox_complete` quand c\'est fait.\n');

    for (const t of pending) {
      const dateLabel = t.scheduledDate
        ? (t.scheduledDate === today ? ' ⚡ AUJOURD\'HUI' : ` 📅 ${t.scheduledDate}`)
        : '';
      lines.push(`- [id: ${t.id}]${dateLabel} ${t.task} _(assigné par ${t.from} le ${t.assignedAt.split('T')[0]})_`);
    }

    return lines.join('\n');
  }
}
