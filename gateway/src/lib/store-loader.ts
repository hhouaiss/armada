import { ProductAgent } from '../agents/product-agent.js';
import { InventoryAgent } from '../agents/inventory-agent.js';
import { SupportAgent } from '../agents/support-agent.js';
import { MajorAgent, MAJOR_SYSTEM_PROMPT } from '../agents/major-agent.js';
import { BaseAgent } from '../agents/base-agent.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { SessionManager } from '../core/session-manager.js';
import { Router } from '../core/router.js';
import { AgentConfig } from '../types/agents.js';
import { prisma } from './database.js';

type AgentConstructor = new (
  config: AgentConfig,
  toolRegistry: ToolRegistry,
  sessionManager: SessionManager
) => BaseAgent;

const agentClassMap: Record<string, AgentConstructor> = {
  product: ProductAgent,
  inventory: InventoryAgent,
  support: SupportAgent,
  content: BaseAgent,
  seo: BaseAgent,
  major: MajorAgent,
};

interface StoreWithAgents {
  id: string;
  shopifyDomain: string;
  storeName: string;
  agents: {
    id: string;
    agentId: string;
    name: string;
    type: string;
    personality: string;
    systemPrompt?: string | null;
    capabilities?: any;
    customRules?: string | null;
    templateId?: string | null;
    isActive: boolean;
    config?: any;
  }[];
}

/**
 * Ensures every store has a Major (Chief of Staff) agent.
 * Creates one in the DB if it doesn't exist yet.
 */
const MAJOR_CAPABILITIES = {
  allowed: ['products', 'inventory', 'customers', 'orders', 'collections', 'content', 'store', 'seo', 'marketing', 'orchestration'],
};

async function ensureMajorAgent(store: StoreWithAgents): Promise<StoreWithAgents['agents'][number]> {
  const existing = store.agents.find(a => a.type === 'major');

  if (existing) {
    // Patch capabilities if 'marketing' is not yet in the allowed list
    const caps = (existing.capabilities as any) || {};
    const allowed: string[] = caps.allowed || [];
    if (!allowed.includes('marketing')) {
      await prisma.agent.update({
        where: { id: existing.id },
        data: { capabilities: MAJOR_CAPABILITIES },
      });
      existing.capabilities = MAJOR_CAPABILITIES;
      console.log(`  ✓ Patched Major agent capabilities to include 'marketing' (${store.storeName})`);
    }
    return existing;
  }

  console.log(`  → No Major agent found for ${store.storeName} — creating one...`);

  const created = await prisma.agent.create({
    data: {
      agentId: `major-${store.id}`,
      name: 'The Major',
      type: 'major',
      personality: 'Chief of Staff — Global Orchestrator',
      systemPrompt: MAJOR_SYSTEM_PROMPT,
      capabilities: MAJOR_CAPABILITIES,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      isActive: true,
      storeId: store.id,
    },
  });

  console.log(`  ✓ Major agent created (id: ${created.id})`);

  return {
    id: created.id,
    agentId: created.agentId,
    name: created.name,
    type: created.type,
    personality: created.personality,
    systemPrompt: created.systemPrompt,
    capabilities: created.capabilities,
    customRules: created.customRules,
    templateId: created.templateId,
    isActive: created.isActive,
    config: created.config,
  };
}

export async function registerStoreAgents(
  store: StoreWithAgents,
  toolRegistry: ToolRegistry,
  sessionManager: SessionManager,
  router: Router
): Promise<void> {
  console.log(`→ Loading agents for store: ${store.storeName} (${store.id})`);

  // Ensure the Major (Chief of Staff) exists for this store
  const majorRecord = await ensureMajorAgent(store);
  const allAgents = store.agents.some(a => a.type === 'major')
    ? store.agents
    : [...store.agents, majorRecord];

  for (const agentRecord of allAgents) {
    // Fall back to BaseAgent for custom types created by The Major
    const AgentClass = agentClassMap[agentRecord.type] ?? BaseAgent;

    const agentConfig: AgentConfig = {
      id: agentRecord.id,
      name: agentRecord.name,
      type: agentRecord.type as any,
      storeId: store.id,
      personality: agentRecord.personality,
      systemPrompt: agentRecord.systemPrompt || undefined,
      capabilities: agentRecord.capabilities || undefined,
      customRules: agentRecord.customRules || undefined,
      templateId: agentRecord.templateId || undefined,
      config: agentRecord.config,
    };

    const agent = new AgentClass(agentConfig, toolRegistry, sessionManager);
    router.registerAgent(agent);
  }

  console.log(`✓ Loaded ${allAgents.length} agents for ${store.storeName}`);
}
