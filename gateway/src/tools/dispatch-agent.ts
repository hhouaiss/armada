import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';

const SPECIALIST_TYPE_MAP: Record<string, string> = {
  Sarah: 'product',
  Marcus: 'inventory',
  Emma: 'support',
  Alex: 'content',
  Olivia: 'seo',
};

export const dispatchToSpecialistTool: AgentTool = {
  name: 'dispatch_to_specialist',
  description:
    'Delegate a task to one of the specialist agents in the squad. ' +
    'Use this to leverage each specialist\'s unique skills and tools. ' +
    'Specialists: Sarah (products & catalog), Marcus (inventory & stock), ' +
    'Emma (customer support & CRM), Alex (content & blog writing), Olivia (SEO & Google Search Console).',
  category: 'orchestration',
  inputSchema: {
    type: 'object',
    properties: {
      specialist: {
        type: 'string',
        description: 'Which specialist to delegate to: Sarah, Marcus, Emma, Alex, or Olivia',
        enum: ['Sarah', 'Marcus', 'Emma', 'Alex', 'Olivia'],
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

    const agentType = SPECIALIST_TYPE_MAP[specialist];
    if (!agentType) {
      return { success: false, error: `Unknown specialist "${specialist}". Valid options: Sarah, Marcus, Emma, Alex, Olivia.` };
    }

    const agent = context.router
      .getAgentsByStore(context.storeId)
      .find(a => a.config.type === agentType);

    if (!agent) {
      return {
        success: false,
        error: `Specialist "${specialist}" is not configured for this store. Ask the user to set them up in My Team.`,
      };
    }

    console.log(`\n📡 Major dispatching to ${specialist} (${agentType}): "${task.substring(0, 60)}..."`);

    const subConversationId = `major-dispatch-${context.operationId}-${specialist.toLowerCase()}`;
    const subContext = { ...context, agentId: agent.config.id };

    const response = await agent.chat(task, subContext, subConversationId);

    return {
      success: true,
      data: { specialist, response },
    };
  },
};
