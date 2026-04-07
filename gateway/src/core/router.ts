import { Operation } from '../types/operations.js';
import { BaseAgent } from '../agents/base-agent.js';
import { SmartRouter, RoutingContext } from './smart-router.js';

// Adapter for backward compatibility - delegates to SmartRouter
export class Router {
  private smartRouter: SmartRouter = new SmartRouter();

  registerAgent(agent: BaseAgent): void {
    this.smartRouter.registerAgent(agent);
    console.log(`✓ Registered agent: ${agent.config.name} (${agent.config.type})`);
  }

  async route(operation: Operation): Promise<BaseAgent | null> {
    // 1. If explicit agentId provided, use it directly
    if (operation.agentId) {
      const agent = this.smartRouter.getAgent(operation.agentId);
      if (agent) {
        console.log(`→ Routing to explicit agent: ${agent.config.name}`);
        return agent;
      }
    }

    // 2. Use smart routing (OpenClaw binding pattern + context-aware)
    const context: RoutingContext = {
      storeId: operation.storeId,
      action: operation.action,
    };

    return await this.smartRouter.route(context);
  }

  getAgent(agentId: string): BaseAgent | undefined {
    return this.smartRouter.getAgent(agentId);
  }

  getAgentsByStore(storeId: string): BaseAgent[] {
    return this.smartRouter.getAllAgents().filter(
      (agent) => agent.config.storeId === storeId
    );
  }

  getAllAgents(): { id: string; name: string; type: string; storeId: string }[] {
    return this.smartRouter.getAllAgents().map((agent) => ({
      id: agent.config.id,
      name: agent.config.name,
      type: agent.config.type,
      storeId: agent.config.storeId,
    }));
  }

  // Expose smart router for advanced use cases
  getSmartRouter(): SmartRouter {
    return this.smartRouter;
  }
}
