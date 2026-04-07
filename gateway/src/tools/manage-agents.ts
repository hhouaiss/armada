import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { BaseAgent } from '../agents/base-agent.js';
import { prisma } from '../lib/database.js';
import { nanoid } from 'nanoid';

/**
 * manage_agents — lets The Major create, list, and deactivate agents at runtime.
 *
 * Actions:
 *   create    — creates a new specialist in the DB and registers it live
 *   list      — returns all active agents for this store
 *   deactivate — soft-deletes an agent by id
 */
export const manageAgentsTool: AgentTool = {
  name: 'manage_agents',
  description:
    'Create, list, update, or deactivate agents in your squad. Use "create" to add a new specialist, "list" to see the current team, "update" to change an existing agent\'s capabilities or specialty, or "deactivate" to remove a member.',
  category: 'orchestration',

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'One of: create, list, update, deactivate',
        enum: ['create', 'list', 'update', 'deactivate'],
      },
      name: {
        type: 'string',
        description: '(create) First name of the new agent — e.g. "Zoe"',
      },
      role: {
        type: 'string',
        description:
          '(create) Short role description — e.g. "Email Marketing Specialist". Used to auto-generate the system prompt.',
      },
      specialty: {
        type: 'string',
        description:
          '(create / update) Description of what this agent specialises in. Becomes the core of their system prompt.',
      },
      capabilities: {
        type: 'string',
        description:
          '(create / update) Comma-separated list of tool category names to grant this agent. These match the "category" field on registered tools — e.g. "marketing", "seo", "products", "customers". You can use ANY category name; new integrations (Klaviyo → "marketing", Stripe → "payments", etc.) are valid. Defaults to categories inferred from the specialty.',
      },
      model: {
        type: 'string',
        description:
          '(create) Model to use. Defaults to claude-sonnet-4-6.',
      },
      agentId: {
        type: 'string',
        description: '(update / deactivate) The DB id of the agent to modify. Use "list" first to get the id.',
      },
    },
    required: ['action'],
  },

  async execute(params: any, context: ToolContext): Promise<ToolResult> {
    const { action } = params;

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const agents = await prisma.agent.findMany({
        where: { storeId: context.storeId, isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          personality: true,
          modelProvider: true,
          modelName: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        success: true,
        data: { agents, count: agents.length },
      };
    }

    // ── DEACTIVATE ────────────────────────────────────────────────────────────
    if (action === 'deactivate') {
      if (!params.agentId) {
        return { success: false, error: 'agentId is required for deactivate' };
      }

      const agent = await prisma.agent.findFirst({
        where: { id: params.agentId, storeId: context.storeId },
      });

      if (!agent) {
        return { success: false, error: `Agent ${params.agentId} not found in this store` };
      }

      if (agent.type === 'major') {
        return { success: false, error: 'The Major cannot be deactivated' };
      }

      await prisma.agent.update({
        where: { id: params.agentId },
        data: { isActive: false },
      });

      return {
        success: true,
        data: { message: `Agent "${agent.name}" has been deactivated.` },
      };
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (action === 'update') {
      if (!params.agentId) {
        return { success: false, error: 'agentId is required for update. Use "list" first to find the agent id.' };
      }

      const agent = await prisma.agent.findFirst({
        where: { id: params.agentId, storeId: context.storeId },
      });

      if (!agent) {
        return { success: false, error: `Agent ${params.agentId} not found in this store` };
      }

      if (agent.type === 'major') {
        return { success: false, error: 'The Major\'s capabilities cannot be changed via manage_agents' };
      }

      const updates: Record<string, any> = {};

      if (params.capabilities) {
        const newCaps = params.capabilities.split(',').map((s: string) => s.trim()).filter(Boolean);
        updates.capabilities = { allowed: newCaps };
      }

      if (params.specialty) {
        updates.systemPrompt = buildSystemPrompt(agent.name, agent.personality, params.specialty);
      }

      if (Object.keys(updates).length === 0) {
        return { success: false, error: 'Provide at least "capabilities" or "specialty" to update.' };
      }

      const updated = await prisma.agent.update({
        where: { id: params.agentId },
        data: updates,
      });

      // Patch the live agent in the router if available
      if (context.router && updates.capabilities) {
        const liveAgent = context.router.getAgent(params.agentId);
        if (liveAgent) {
          liveAgent.config.capabilities = updated.capabilities as any;
        }
      }

      const caps = (updated.capabilities as any)?.allowed || [];
      return {
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          capabilities: caps,
          message: `Agent "${updated.name}" updated. Capabilities: ${caps.join(', ')}`,
        },
      };
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (action === 'create') {
      const { name, role, specialty } = params;

      if (!name || !role || !specialty) {
        return {
          success: false,
          error: 'name, role, and specialty are required to create an agent',
        };
      }

      // Build system prompt from the specialty description
      const systemPrompt = buildSystemPrompt(name, role, specialty);

      // Parse capabilities
      const rawCaps = params.capabilities
        ? params.capabilities.split(',').map((s: string) => s.trim()).filter(Boolean)
        : inferCapabilities(specialty);

      // Slug-ify the type from the role
      const type = role.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      // Unique agentId
      const agentId = `${type}-${nanoid(8)}`;

      const created = await prisma.agent.create({
        data: {
          agentId,
          name,
          type,
          personality: role,
          systemPrompt,
          capabilities: { allowed: rawCaps },
          modelProvider: 'anthropic',
          modelName: params.model || 'claude-sonnet-4-6',
          isActive: true,
          storeId: context.storeId,
        },
      });

      // Register immediately in the live router if we have the required refs
      if (context.router && context.toolRegistry && context.sessionManager) {
        const agentConfig = {
          id: created.id,
          name: created.name,
          type: created.type as any,
          storeId: context.storeId,
          personality: created.personality,
          systemPrompt: created.systemPrompt || undefined,
          capabilities: created.capabilities as any,
        };
        const liveAgent = new BaseAgent(agentConfig, context.toolRegistry, context.sessionManager);
        context.router.registerAgent(liveAgent);
      }

      return {
        success: true,
        data: {
          id: created.id,
          name: created.name,
          type: created.type,
          role,
          specialty,
          capabilities: rawCaps,
          model: created.modelName,
          message: `Agent "${name}" (${role}) has been created and added to the squad.`,
        },
      };
    }

    return { success: false, error: `Unknown action: ${action}` };
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(name: string, role: string, specialty: string): string {
  return `You are ${name} — ${role}.

## YOUR SPECIALTY
${specialty}

## HOW YOU OPERATE
- Focus exclusively on your area of expertise.
- Be concise, precise, and action-oriented.
- When you need data from the store, use the tools available to you.
- Always attribute your findings clearly.

## LANGUAGE
Tu réponds TOUJOURS en français par défaut. Si l'utilisateur écrit dans une autre langue, réponds dans cette langue.`;
}

function inferCapabilities(specialty: string): string[] {
  const s = specialty.toLowerCase();
  const caps: string[] = ['store'];

  if (s.includes('product') || s.includes('catalog') || s.includes('catalogue')) caps.push('products', 'collections');
  if (s.includes('inventor') || s.includes('stock')) caps.push('inventory');
  if (s.includes('customer') || s.includes('support')) caps.push('customers', 'orders');
  if (s.includes('content') || s.includes('blog') || s.includes('article')) caps.push('content');
  if (s.includes('seo') || s.includes('search') || s.includes('keyword') || s.includes('ranking')) caps.push('seo');
  if (s.includes('order') || s.includes('fulfil')) caps.push('orders');
  if (
    s.includes('email') || s.includes('sms') || s.includes('klaviyo') ||
    s.includes('campaign') || s.includes('newsletter') || s.includes('marketing') ||
    s.includes('subscriber') || s.includes('flow') || s.includes('automation')
  ) caps.push('marketing');

  // Always include products as a baseline if nothing specific matched
  if (caps.length === 1) caps.push('products', 'customers', 'orders');

  return [...new Set(caps)];
}
