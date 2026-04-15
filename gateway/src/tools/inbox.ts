import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { MemoryEngine } from '../lib/memory-engine.js';

/**
 * inbox_complete — Mark a pending inbox task as done.
 * Every agent has their own inbox. When a task from the inbox is executed,
 * the agent calls this tool to remove it from the pending list.
 */
export const inboxCompleteTool: AgentTool = {
  name: 'inbox_complete',
  description:
    'Marque une tâche de ton inbox comme terminée. ' +
    'Appelle cet outil après avoir exécuté une tâche listée dans la section TÂCHES EN ATTENTE (INBOX). ' +
    'Utilise le champ "id" visible dans ton inbox pour identifier la tâche.',
  category: 'memory',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'L\'id de la tâche à marquer comme terminée (ex: "task-1713180000000-ab3f2")',
      },
    },
    required: ['taskId'],
  },

  validate(params: any) {
    if (!params.taskId || typeof params.taskId !== 'string') {
      return { valid: false, errors: ['taskId is required and must be a string'] };
    }
    return { valid: true };
  },

  async execute(params: { taskId: string }, context: ToolContext): Promise<ToolResult> {
    const engine = new MemoryEngine(context.storeId);
    const completed = await engine.completeInboxTask(context.agentId, params.taskId);

    if (!completed) {
      return {
        success: false,
        error: `Tâche "${params.taskId}" non trouvée dans l'inbox.`,
      };
    }

    return {
      success: true,
      data: { completed: true, taskId: params.taskId, message: `Tâche "${params.taskId}" marquée comme terminée.` },
    };
  },
};
