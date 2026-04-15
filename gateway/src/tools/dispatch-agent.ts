import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { MemoryEngine } from '../lib/memory-engine.js';

export const dispatchToSpecialistTool: AgentTool = {
  name: 'dispatch_to_specialist',
  description:
    'Delegate a task to any specialist agent in the squad by name. ' +
    'The squad is dynamic — use manage_agents with action "list" to see who is available. ' +
    'Provide the exact agent name (e.g. "Zoe", "Marcus", "Olivia") and a clear, self-contained task description.',
  category: 'orchestration',
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
    },
    required: ['specialist', 'task'],
  },

  async execute(params: { specialist: string; task: string }, context: ToolContext): Promise<ToolResult> {
    const { specialist, task } = params;

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

    console.log(`\n📡 Major dispatching to ${specialist} (${agent.config.type}): "${task.substring(0, 60)}..."`);

    // ── Detect future scheduling intent ─────────────────────────────────────
    // If the task mentions a date or "tomorrow/demain", extract it and write
    // to the agent's inbox so they remember even in fresh conversations.
    const scheduledDate = extractScheduledDate(task);
    const isFutureTask = scheduledDate !== null;

    const engine = new MemoryEngine(context.storeId);

    if (isFutureTask) {
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
