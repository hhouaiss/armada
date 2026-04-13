import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';

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

    const subConversationId = `major-dispatch-${context.operationId}-${specialist.toLowerCase()}`;
    const subContext = { ...context, agentId: agent.config.id };

    const response = await agent.chat(task, subContext, subConversationId);

    return {
      success: true,
      data: { specialist, response },
    };
  },
};
