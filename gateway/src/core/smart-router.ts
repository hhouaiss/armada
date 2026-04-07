import { prisma } from '../lib/database.js';
import { BaseAgent } from '../agents/base-agent.js';

export interface RoutingContext {
  storeId: string;
  channel?: string; // 'websocket' | 'telegram' | 'whatsapp'
  userId?: string;
  peerId?: string;
  message?: string; // For context-aware routing
  action?: string; // For action-based routing
}

interface RoutingRule {
  id: string;
  storeId: string;
  agentId: string | null;
  priority: number;
  channel: string | null;
  userId: string | null;
  peerId: string | null;
  keywords: any;
  intentPattern: string | null;
  actionType: string | null;
  description: string | null;
  isActive: boolean;
}

export class SmartRouter {
  private agentMap: Map<string, BaseAgent> = new Map();
  private rulesCache: Map<string, RoutingRule[]> = new Map();
  private cacheExpiry: number = 60000; // 1 minute
  private lastCacheUpdate: Map<string, number> = new Map();

  registerAgent(agent: BaseAgent): void {
    this.agentMap.set(agent.config.id, agent);
  }

  getAgent(agentId: string): BaseAgent | undefined {
    return this.agentMap.get(agentId);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agentMap.values());
  }

  /**
   * Smart route - OpenClaw binding pattern with context awareness
   */
  async route(context: RoutingContext): Promise<BaseAgent | null> {
    console.log(`🧭 Smart routing:`, {
      store: context.storeId,
      channel: context.channel,
      hasMessage: !!context.message,
    });

    // Load routing rules for this store
    const rules = await this.getRoutingRules(context.storeId);

    if (rules.length === 0) {
      console.log(`  → No routing rules found, using fallback`);
      return this.getFallbackAgent(context.storeId);
    }

    // Evaluate rules by priority (highest first)
    const sortedRules = rules.sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (!rule.isActive) continue;

      const score = this.evaluateRule(rule, context);

      if (score > 0) {
        if (rule.agentId) {
          const agent = this.agentMap.get(rule.agentId);
          if (agent) {
            console.log(`  ✓ Matched rule (priority ${rule.priority}, score ${score}): ${rule.description}`);
            console.log(`  → Routing to: ${agent.config.name}`);
            return agent;
          }
        }
      }
    }

    // No match found, use fallback
    console.log(`  → No matching rule, using fallback`);
    return this.getFallbackAgent(context.storeId);
  }

  /**
   * Evaluate how well a rule matches the context
   */
  private evaluateRule(rule: RoutingRule, context: RoutingContext): number {
    let score = 0;

    // Exact channel match (high weight)
    if (rule.channel) {
      if (rule.channel === context.channel) {
        score += 50;
      } else {
        return 0; // Channel specified but doesn't match - skip rule
      }
    }

    // Exact user ID match (very high weight)
    if (rule.userId) {
      if (rule.userId === context.userId) {
        score += 100;
      } else {
        return 0; // User specified but doesn't match - skip rule
      }
    }

    // Exact peer ID match (very high weight)
    if (rule.peerId) {
      if (rule.peerId === context.peerId) {
        score += 100;
      } else {
        return 0; // Peer specified but doesn't match - skip rule
      }
    }

    // Keyword matching (context-aware)
    if (rule.keywords && context.message) {
      const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
      const messageLower = context.message.toLowerCase();

      const matchedKeywords = keywords.filter((keyword: string) =>
        messageLower.includes(keyword.toLowerCase())
      );

      if (matchedKeywords.length > 0) {
        score += matchedKeywords.length * 20; // 20 points per keyword match
      }
    }

    // Intent pattern matching (regex)
    if (rule.intentPattern && context.message) {
      try {
        const regex = new RegExp(rule.intentPattern, 'i');
        if (regex.test(context.message)) {
          score += 30;
        }
      } catch (error) {
        console.warn(`  ⚠️  Invalid regex pattern: ${rule.intentPattern}`);
      }
    }

    // Action type matching
    if (rule.actionType && context.action) {
      const actionPattern = rule.actionType.replace('*', '.*');
      const regex = new RegExp(`^${actionPattern}$`, 'i');
      if (regex.test(context.action)) {
        score += 40;
      }
    }

    return score;
  }

  /**
   * Load routing rules from database with caching
   */
  private async getRoutingRules(storeId: string): Promise<RoutingRule[]> {
    const now = Date.now();
    const lastUpdate = this.lastCacheUpdate.get(storeId) || 0;

    // Use cache if fresh
    if (now - lastUpdate < this.cacheExpiry && this.rulesCache.has(storeId)) {
      return this.rulesCache.get(storeId)!;
    }

    // Fetch from database
    const rules = await prisma.routingRule.findMany({
      where: {
        storeId,
        isActive: true,
      },
      orderBy: {
        priority: 'desc',
      },
    });

    // Update cache
    this.rulesCache.set(storeId, rules as any);
    this.lastCacheUpdate.set(storeId, now);

    return rules as any;
  }

  /**
   * Get fallback agent (lowest priority or first available)
   */
  private getFallbackAgent(storeId: string): BaseAgent | null {
    // Find any agent for this store
    for (const agent of this.agentMap.values()) {
      if (agent.config.storeId === storeId) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Clear routing rules cache (call when rules are updated)
   */
  clearCache(storeId?: string): void {
    if (storeId) {
      this.rulesCache.delete(storeId);
      this.lastCacheUpdate.delete(storeId);
    } else {
      this.rulesCache.clear();
      this.lastCacheUpdate.clear();
    }
  }
}
