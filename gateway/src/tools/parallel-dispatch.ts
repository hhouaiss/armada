import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';

const SPECIALIST_TYPE_MAP: Record<string, string> = {
  Sarah: 'product',
  Marcus: 'inventory',
  Emma: 'support',
  Alex: 'content',
  Olivia: 'seo',
};

/**
 * Parallel Dispatch Tool
 *
 * Runs multiple specialist agents simultaneously via Promise.all().
 * Use when a user question spans multiple domains (e.g. "sales + inventory?")
 * where sequential dispatch would waste time.
 *
 * Sprint 3 — Coordinator multi-agents
 */
export const parallelDispatchTool: AgentTool = {
  name: 'parallel_dispatch',
  description:
    'Dispatch tasks to multiple specialists SIMULTANEOUSLY and get all results at once. ' +
    'Use this when the user asks a question that spans multiple domains (e.g. "How are sales AND inventory doing?"). ' +
    'All specialists work in parallel — much faster than dispatching one by one. ' +
    'Requires at least 2 dispatches. For a single specialist, use dispatch_to_specialist instead.',
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
              description: 'Specialist name: Sarah, Marcus, Emma, Alex, or Olivia',
              enum: ['Sarah', 'Marcus', 'Emma', 'Alex', 'Olivia'],
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

    console.log(`\n⚡ Parallel dispatch: ${dispatches.length} specialists running simultaneously...`);
    const startTime = Date.now();

    const results = await Promise.allSettled(
      dispatches.map(async ({ specialist, task }, i) => {
        const agentType = SPECIALIST_TYPE_MAP[specialist];
        if (!agentType) throw new Error(`Unknown specialist "${specialist}"`);

        const agent = context.router!
          .getAgentsByStore(context.storeId)
          .find((a) => a.config.type === agentType);

        if (!agent) {
          throw new Error(
            `Specialist "${specialist}" is not configured for this store. Ask the user to set them up in My Team.`
          );
        }

        // Isolated sub-conversation per dispatch so sessions don't collide
        const subConversationId = `parallel-${context.operationId}-${specialist.toLowerCase()}-${i}`;
        const subContext = { ...context, agentId: agent.config.id };

        console.log(`  → [${specialist}] "${task.substring(0, 55)}..."`);
        const response = await agent.chat(task, subContext, subConversationId);
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
