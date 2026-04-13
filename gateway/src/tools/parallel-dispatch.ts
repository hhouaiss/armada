import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';

/**
 * Parallel Dispatch Tool
 *
 * Runs multiple specialist agents simultaneously via Promise.all().
 * Use when a user question spans multiple domains (e.g. "sales + inventory?")
 * where sequential dispatch would waste time.
 * The squad is dynamic — any active agent can be dispatched to by name.
 */
export const parallelDispatchTool: AgentTool = {
  name: 'parallel_dispatch',
  description:
    'Dispatch tasks to multiple specialists SIMULTANEOUSLY and get all results at once. ' +
    'Use this when the user asks a question that spans multiple domains (e.g. "How are sales AND inventory doing?"). ' +
    'All specialists work in parallel — much faster than dispatching one by one. ' +
    'Requires at least 2 dispatches. For a single specialist, use dispatch_to_specialist instead. ' +
    'Use any active agent name (e.g. "Zoe", "Marcus", "Olivia") — the squad is dynamic.',
  category: 'orchestration',
  inputSchema: {
    type: 'object',
    properties: {
      dispatches: {
        type: 'array',
        description: 'Array of specialist + task pairs to run in parallel. Minimum 2.',
        items: {
          type: 'object',
          properties: {
            specialist: {
              type: 'string',
              description: 'The exact name of the specialist (case-insensitive). Use manage_agents list to see available agents.',
            },
            task: {
              type: 'string',
              description:
                'Self-contained task description for this specialist. Include all context needed — they do not share context with each other.',
            },
          },
          required: ['specialist', 'task'],
        },
      } as any,
    },
    required: ['dispatches'],
  },

  async execute(
    params: { dispatches: Array<{ specialist: string; task: string }> },
    context: ToolContext
  ): Promise<ToolResult> {
    const { dispatches } = params;

    if (!context.router) {
      return { success: false, error: 'Router not available — cannot dispatch to specialists.' };
    }

    if (!dispatches || dispatches.length < 2) {
      return {
        success: false,
        error: 'parallel_dispatch requires at least 2 dispatches. Use dispatch_to_specialist for a single agent.',
      };
    }

    // Pre-resolve all agents before launching parallel tasks
    const storeAgents = context.router.getAgentsByStore(context.storeId);
    const resolved = dispatches.map(({ specialist, task }) => {
      const agent = storeAgents.find(
        a => a.config.name.toLowerCase() === specialist.toLowerCase() && a.config.type !== 'major'
      );
      return { specialist, task, agent };
    });

    const missing = resolved.filter(r => !r.agent).map(r => r.specialist);
    if (missing.length > 0) {
      const available = storeAgents.filter(a => a.config.type !== 'major').map(a => a.config.name).join(', ');
      return {
        success: false,
        error: `Unknown specialist(s): ${missing.join(', ')}. Available: ${available || 'none'}. Use manage_agents list to see the full squad.`,
      };
    }

    console.log(`\n⚡ Parallel dispatch: ${dispatches.length} specialists running simultaneously...`);
    const startTime = Date.now();

    const results = await Promise.allSettled(
      resolved.map(async ({ specialist, task, agent }, i) => {
        const subConversationId = `parallel-${context.operationId}-${specialist.toLowerCase()}-${i}`;
        const subContext = { ...context, agentId: agent!.config.id };

        console.log(`  → [${specialist}] "${task.substring(0, 55)}..."`);
        const response = await agent!.chat(task, subContext, subConversationId);
        console.log(`  ✓ [${specialist}] done`);

        return { specialist, response };
      })
    );

    const elapsed = Date.now() - startTime;
    const combined = results.map((result, i) => {
      const { specialist } = dispatches[i];
      if (result.status === 'fulfilled') {
        return { specialist, success: true, response: result.value.response };
      } else {
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`  ✗ [${specialist}] failed: ${errMsg}`);
        return { specialist, success: false, error: errMsg };
      }
    });

    const successCount = combined.filter((r) => r.success).length;
    console.log(
      `\n✓ Parallel dispatch complete: ${successCount}/${dispatches.length} succeeded in ${elapsed}ms\n`
    );

    return {
      success: true,
      data: { results: combined, elapsedMs: elapsed },
    };
  },
};
