import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { MemoryEngine } from '../lib/memory-engine.js';
import { runInBackground } from '../lib/async-dispatch.js';

export const dispatchToSpecialistTool: AgentTool = {
  name: 'dispatch_to_specialist',
  description:
    'Delegate a task to any specialist agent in the squad by name. ' +
    'The squad is dynamic — use manage_agents with action "list" to see who is available. ' +
    'Provide the exact agent name (e.g. "Zoe", "Marcus", "Olivia") and a clear, self-contained task description. ' +
    'Choose the mode carefully: "sync" for a quick answer you need in this turn, "async" for any real deliverable ' +
    '(full email, report, audit) — async returns immediately and the result is pushed to the merchant when ready.',
  category: 'orchestration',
  // Runs a full nested agentic loop: a specialist producing a long deliverable
  // (full HTML email, report) takes minutes, well past the default 60s.
  timeoutMs: 10 * 60_000,
  inputSchema: {
    type: 'object',
    properties: {
      specialist: {
        type: 'string',
        description: 'The exact name of the specialist to delegate to (e.g. "Zoe", "Marcus", "Sarah"). Case-insensitive. Use manage_agents list to see the current squad.',
      },
      task: {
        type: 'string',
        description: 'Clear, self-contained task description for the specialist. Include all relevant context they need.',
      },
      mode: {
        type: 'string',
        enum: ['sync', 'async'],
        description:
          'sync (default): wait for the specialist and return their answer in this turn. Only for short tasks (< 1 min) — a question, a few subject lines, a quick check. ' +
          'async: acknowledge immediately and let the specialist work in the background; the result is saved and pushed to the merchant when done. ' +
          'Use async for anything that produces a real deliverable (full HTML email, report, audit, long copy) — sync would time out.',
      },
    },
    required: ['specialist', 'task'],
  },

  async execute(
    params: { specialist: string; task: string; mode?: 'sync' | 'async' },
    context: ToolContext
  ): Promise<ToolResult> {
    const { specialist, task, mode = 'sync' } = params;

    if (!context.router) {
      return { success: false, error: 'Router not available — cannot dispatch to specialist.' };
    }

    // Dynamic lookup by name (case-insensitive) from the live router
    const storeAgents = context.router.getAgentsByStore(context.storeId);
    const agent = storeAgents.find(
      a => a.config.name.toLowerCase() === specialist.toLowerCase() && a.config.type !== 'major'
    );

    if (!agent) {
      const available = storeAgents
        .filter(a => a.config.type !== 'major')
        .map(a => a.config.name)
        .join(', ');
      return {
        success: false,
        error: `Specialist "${specialist}" not found in this store's squad. Available: ${available || 'none'}. Use manage_agents with action "list" to see the full team.`,
      };
    }

    console.log(`\n📡 Major dispatching to ${specialist} (${agent.config.type}, ${mode}): "${task.substring(0, 60)}..."`);

    // ── Detect future scheduling intent ─────────────────────────────────────
    // If the task mentions a date or "tomorrow/demain", extract it and write
    // to the agent's inbox so they remember even in fresh conversations.
    const scheduledDate = extractScheduledDate(task);
    const isFutureTask = scheduledDate !== null;

    const engine = new MemoryEngine(context.storeId);

    if (isFutureTask && mode === 'sync') {
      // Write to inbox BEFORE dispatch — agent will see it the next time they chat
      await engine.addToInbox(agent.config.id, {
        task,
        from: 'Major',
        scheduledDate: scheduledDate ?? undefined,
      });
      console.log(`  📥 Task written to ${specialist}'s inbox (scheduled: ${scheduledDate})`);

      // Still run the agent right now so they can acknowledge / plan
    }

    const subConversationId = `major-dispatch-${context.operationId}-${specialist.toLowerCase()}`;
    const subContext = { ...context, agentId: agent.config.id };

    // ── Async: hand off and return straight away ────────────────────────────
    // The tool call must not stay open for a multi-minute deliverable — the
    // result is persisted to the inbox and pushed when it lands.
    if (mode === 'async') {
      const taskId = await engine.addToInbox(agent.config.id, {
        task,
        from: 'Major',
        scheduledDate: scheduledDate ?? undefined,
        status: 'in_progress',
      });

      runInBackground({ agent, task, context: subContext, conversationId: subConversationId, taskId });

      return {
        success: true,
        data: {
          specialist,
          mode: 'async',
          taskId,
          status: 'in_progress',
          note:
            `${specialist} a démarré la tâche en arrière-plan. Le résultat sera livré au marchand dès qu'il est prêt. ` +
            `N'attends pas le résultat et ne relance pas le dispatch — annonce simplement que ${specialist} s'en occupe.`,
        },
      };
    }

    // ── Sync: wait for the specialist ───────────────────────────────────────
    const response = await agent.chat(task, subContext, subConversationId);

    // If not a future task, write to inbox AFTER successful execution
    // (so the agent remembers what they committed to in this dispatch)
    if (!isFutureTask) {
      await engine.addToInbox(agent.config.id, {
        task,
        from: 'Major',
      });
    }

    return {
      success: true,
      data: { specialist, response },
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tries to detect a scheduled date from the task description.
 * Returns a YYYY-MM-DD string or null if no date intent is found.
 */
function extractScheduledDate(task: string): string | null {
  const lower = task.toLowerCase();
  const today = new Date();

  // "tomorrow" / "demain"
  if (/\bdemain\b|\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  // "in X days" / "dans X jours"
  const daysMatch = lower.match(/\bdans\s+(\d+)\s+jours?\b|\bin\s+(\d+)\s+days?\b/);
  if (daysMatch) {
    const n = parseInt(daysMatch[1] ?? daysMatch[2], 10);
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // Explicit date patterns: "le 20 avril", "on April 20", "2026-04-20"
  const isoMatch = task.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  return null;
}
