import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig } from '../types/agents.js';
import { Operation, ToolContext, AgentTool } from '../types/operations.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { SessionManager } from '../core/session-manager.js';
import {
  getIntegrationCredentials,
  saveOperation,
  updateOperation,
  saveConversationSession,
  loadConversationSession,
  prisma
} from '../lib/database.js';
import { decryptToken } from '../lib/shopify-client.js';
import { createLLMProvider } from '../lib/llm/provider-factory.js';
import { LLMProvider } from '../lib/llm/types.js';

export abstract class BaseAgent {
  // Removed in-memory Map - now using database persistence (OpenClaw pattern)

  constructor(
    public config: AgentConfig,
    protected toolRegistry: ToolRegistry,
    protected sessionManager: SessionManager
  ) {}

  private async getLLMProvider(): Promise<{ provider: LLMProvider; modelProvider: string; modelName: string }> {
    // Get agent config from database to get model settings
    const agent = await prisma.agent.findUnique({
      where: { id: this.config.id },
      include: { store: { include: { user: true } } },
    });

    if (!agent) {
      throw new Error(`Agent ${this.config.id} not found in database`);
    }

    const modelProvider = agent.modelProvider || 'anthropic';
    const modelName = agent.modelName || 'claude-sonnet-4-5-20250929';
    const userId = agent.store.userId;

    const provider = await createLLMProvider(userId, modelProvider, modelName);

    return { provider, modelProvider, modelName };
  }

  async executeOperation(operation: Operation, context: ToolContext): Promise<any> {
    console.log(`\n🤖 Agent ${this.config.name} executing: ${operation.action}`);
    const session = this.sessionManager.create(this.config.id, 'interactive');
    try {
      const result = await this.toolRegistry.execute(operation.action, operation.params, context);
      if (!result.success) {
        this.sessionManager.complete(session.id, 'failed');
        throw new Error(result.error || 'Operation failed');
      }
      this.sessionManager.complete(session.id, 'completed');
      console.log(`✓ Agent ${this.config.name} completed operation\n`);
      return result.data;
    } catch (error) {
      this.sessionManager.complete(session.id, 'failed');
      console.error(`✗ Agent ${this.config.name} failed:`, error);
      throw error;
    }
  }

  // Max messages to send to the LLM per call (sliding context window)
  private static readonly LLM_CONTEXT_WINDOW = 80;

  async chat(
    message: string,
    context: ToolContext,
    conversationId: string = 'default'
  ): Promise<string> {
    console.log(`\n💬 Agent ${this.config.name} received: "${message}"`);

    // Load FULL history from DB — never trim the stored record
    const fullHistory: Anthropic.MessageParam[] = await loadConversationSession(conversationId, this.config.id) || [];

    // Track only newly added messages so we can append them to fullHistory on save
    const newMessages: Anthropic.MessageParam[] = [];

    const addToHistory = (msg: Anthropic.MessageParam) => {
      newMessages.push(msg);
    };

    // First user message
    addToHistory({ role: 'user', content: message });

    // Sliding context window for LLM: last N messages from full history + all new messages
    const buildContextWindow = (): Anthropic.MessageParam[] => {
      const base = fullHistory.slice(-BaseAgent.LLM_CONTEXT_WINDOW);
      return [...base, ...newMessages];
    };

    const session = this.sessionManager.create(this.config.id, 'chat');

    try {
      const { provider, modelProvider, modelName } = await this.getLLMProvider();
      const tools = this.getTools();
      const systemPrompt = await this.getSystemPrompt(conversationId);

      let response = await provider.chat({
        messages: buildContextWindow(),
        systemPrompt,
        tools,
        maxTokens: 4096,
      });

      // Agentic tool-use loop (OpenClaw pattern)
      while (response.toolCalls && response.toolCalls.length > 0) {
        // Add assistant message with tool calls to new messages
        const assistantContent: any[] = [];
        if (response.content) {
          assistantContent.push({ type: 'text', text: response.content });
        }
        response.toolCalls.forEach(tc => {
          assistantContent.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        });

        addToHistory({ role: 'assistant', content: assistantContent });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolCall of response.toolCalls) {
          console.log(`  → Tool call: ${toolCall.name}`, toolCall.input);

          // Check if this tool requires approval
          const toolDef = this.toolRegistry.get(toolCall.name);
          if (toolDef?.requiresApproval) {
            // Return approval request to user instead of executing
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: `APPROVAL REQUIRED: This action needs user confirmation before proceeding.\n\nAction: ${toolCall.name}\nDetails: ${JSON.stringify(toolCall.input, null, 2)}\n\nPlease inform the user that this action requires their approval. Describe what will happen and ask them to confirm.`,
              is_error: false,
            });
            continue;
          }

          const toolStartTime = Date.now();
          try {
            await saveOperation({
              operationId: toolCall.id,
              storeId: context.storeId,
              agentId: this.config.id,
              action: toolCall.name,
              params: toolCall.input as Record<string, any>,
              status: 'in_progress',
            });
          } catch (dbErr) {
            console.warn('  ⚠️  Could not save operation to DB:', dbErr);
          }

          const result = await this.toolRegistry.execute(
            toolCall.name,
            toolCall.input as Record<string, any>,
            context
          );

          const toolDuration = Date.now() - toolStartTime;
          try {
            await updateOperation(toolCall.id, {
              status: result.success ? 'completed' : 'failed',
              result: result.success ? result.data : undefined,
              error: result.success ? undefined : result.error,
              duration: toolDuration,
            });
          } catch (dbErr) {
            console.warn('  ⚠️  Could not update operation in DB:', dbErr);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result.success
              ? JSON.stringify(result.data)
              : `Error: ${result.error}`,
            is_error: !result.success,
          });
        }

        addToHistory({ role: 'user', content: toolResults });

        response = await provider.chat({
          messages: buildContextWindow(),
          systemPrompt,
          tools,
          maxTokens: 4096,
        });
      }

      // Extract final text
      const finalResponse = response.content;

      // Guard: if the LLM returned empty content (can happen when a model
      // returns null content after tool use), throw so the caller gets a
      // proper error instead of silently saving an empty string that would
      // corrupt the conversation history and cause every future call to also
      // return empty.
      if (!finalResponse || finalResponse.trim() === '') {
        console.error(`  ✗ LLM returned empty response for agent "${this.config.name}" (${this.config.type})`);
        throw new Error(`Le modèle n'a pas retourné de réponse. Veuillez réessayer.`);
      }

      addToHistory({ role: 'assistant', content: finalResponse });

      // Save FULL history (existing + new messages) — no trimming
      // The LLM context window (80 msgs) keeps API calls fast; DB keeps everything
      const updatedFullHistory = [...fullHistory, ...newMessages];

      // Save FULL conversation history — no trim on DB record
      await saveConversationSession({
        conversationId,
        agentId: this.config.id,
        storeId: context.storeId,
        history: updatedFullHistory,
      });

      this.sessionManager.complete(session.id, 'completed');
      console.log(`  ✓ Agent responded (session saved to DB)\n`);
      return finalResponse;
    } catch (error) {
      this.sessionManager.complete(session.id, 'failed');
      console.error(`  ✗ Chat failed:`, error);
      throw error;
    }
  }

  /**
   * Default tool categories per agent type (OpenClaw tool profile pattern).
   * Agents only see tools relevant to their specialty.
   */
  private static readonly DEFAULT_CATEGORY_SCOPE: Record<string, string[]> = {
    product:   ['products', 'collections', 'inventory', 'orders', 'store'],
    inventory: ['inventory', 'products', 'store'],
    support:   ['customers', 'orders', 'products', 'store'],
    content:   ['content', 'products', 'collections', 'store'],
    seo:       ['seo', 'store'],
  };

  /**
   * Returns tools filtered to this agent's scope.
   * Respects DB-stored capabilities.allowed / capabilities.denied overrides.
   */
  private getFilteredTools() {
    const allTools = this.toolRegistry.listAll();
    const caps = this.config.capabilities;

    // If explicit allow-list set in DB, use it (matches tool name or category)
    if (caps?.allowed && caps.allowed.length > 0) {
      const allowed = caps.allowed;
      return allTools.filter(tool => {
        const nameMatch = allowed.some(p =>
          p.endsWith('*')
            ? tool.name.startsWith(p.slice(0, -1))
            : tool.name === p
        );
        const catMatch = tool.category && allowed.includes(tool.category);
        return nameMatch || catMatch;
      }).filter(tool => !caps.denied?.includes(tool.name) && !caps.denied?.includes(tool.category || ''));
    }

    // Default: scope by agent type
    const scopeCategories = BaseAgent.DEFAULT_CATEGORY_SCOPE[this.config.type] ?? null;

    return allTools.filter(tool => {
      // No category on tool = legacy tool, always include
      if (!tool.category) return true;

      // No scope defined for this agent type = allow all (fallback)
      if (!scopeCategories) return true;

      // Must be in this agent's category scope
      if (!scopeCategories.includes(tool.category)) return false;

      // Apply explicit deny-list if set
      if (caps?.denied?.includes(tool.name) || caps?.denied?.includes(tool.category)) return false;

      return true;
    });
  }

  private getTools() {
    return this.getFilteredTools().map((tool) => ({
      name: tool.name,
      description: tool.requiresApproval
        ? `${tool.description} (Requires user approval before execution)`
        : tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    }));
  }

  private formatApprovalRequest(toolName: string, params: Record<string, any>): string {
    const descriptions: Record<string, string> = {
      product_create: `Create a new product: "${params.title || 'Untitled'}"`,
      product_update: `Update product ${params.productId}`,
      inventory_update: `Change inventory for item ${params.inventory_item_id} to ${params.available} units`,
      customer_update_tags: `Update tags for customer ${params.customerId} to "${params.tags}"`,
    };
    return descriptions[toolName] || `Execute ${toolName} with params: ${JSON.stringify(params)}`;
  }

  /** Override in subclasses to inject additional context into the system prompt. */
  protected async getAdditionalSystemContext(_conversationId: string): Promise<string> {
    return '';
  }

  private async getSystemPrompt(conversationId: string): Promise<string> {
    const toolNames = this.getCapabilities().join(', ');

    // OpenClaw-style: Use database-backed system prompt if available
    let systemPrompt = this.config.systemPrompt;

    if (!systemPrompt) {
      // Fallback to legacy personality field for backward compatibility
      systemPrompt = `You are ${this.config.name}.

${this.config.personality}

You are an AI agent for a Shopify store, powered by the StoreTeam platform.`;
    }

    // Add custom rules if defined
    const customRules = this.config.customRules || '';

    // Load skills assigned to this agent (Claude Skills pattern)
    let agentSkills: any[] = [];
    try {
      // Debug: Check if prisma is defined
      if (!prisma) {
        console.error('❌ CRITICAL: prisma is undefined in getSystemPrompt!');
        throw new Error('Prisma client is undefined');
      }

      agentSkills = await prisma.agentSkill.findMany({
        where: {
          agentId: this.config.id,
          isActive: true,
        },
        include: {
          skill: true,
        },
        orderBy: { priority: 'desc' }, // Higher priority skills loaded first
      });

      if (agentSkills.length > 0) {
        console.log(`✓ Loaded ${agentSkills.length} skill(s) for agent ${this.config.name}:`,
          agentSkills.map(s => s.skill.name).join(', '));
      } else {
        console.log(`ℹ️  No skills assigned to agent ${this.config.name}`);
      }
    } catch (error) {
      // Skills feature might not be available yet or database not migrated
      console.warn('⚠️  Could not load skills for agent:', error);
    }

    // Build skills section (progressive disclosure pattern)
    let skillsSection = '';
    if (agentSkills.length > 0) {
      skillsSection = '\n\n## YOUR SKILLS\n\nYou have been trained with the following specialized knowledge and capabilities:\n\n';

      for (const agentSkill of agentSkills) {
        const skill = agentSkill.skill;
        skillsSection += `### ${skill.name}\n`;
        skillsSection += `${skill.description}\n\n`;
        skillsSection += `${skill.content}\n\n`;
        skillsSection += '---\n\n';
      }

      console.log(`📚 Skills section built (${skillsSection.length} characters)`);
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const last30Start = new Date(now); last30Start.setDate(now.getDate() - 30);
    const last30StartStr = last30Start.toISOString().split('T')[0];

    const additionalContext = await this.getAdditionalSystemContext(conversationId);

    return `${systemPrompt}${skillsSection}${additionalContext}

CURRENT DATE & TIME: ${now.toUTCString()} (today is ${todayStr})
When working with date ranges, always use dates relative to today (${todayStr}). For "last 30 days" use ${last30StartStr} to ${todayStr}.

Available tools: ${toolNames}

CRITICAL RULES:
1. Use tools to get REAL data from the store. Never make up data.
2. Tools marked as requiring approval (product_create, product_update, inventory_update, customer_update_tags) will NOT execute immediately. Instead, you must CLEARLY describe what you want to do and ask the user for confirmation before using those tools.
3. For read-only operations (product_list, product_get, customer_list, etc.), you can execute them directly.
4. When listing items, use reasonable limits (10-20) unless the user asks for more.
5. Format responses clearly. Use bullet points for lists.
6. If something fails, explain what went wrong and suggest alternatives.
7. Always be helpful, professional, and accurate.
8. NEVER use dates from your training data. Always use today's date (${todayStr}) as the reference point for any date ranges.
9. LANGUAGE: Tu réponds TOUJOURS en français par défaut, quelle que soit la langue du message système. Le français est ta langue principale. Si l'utilisateur écrit dans une autre langue, réponds dans cette langue — mais si la langue est ambiguë, utilise le français.

${customRules ? `\nADDITIONAL INSTRUCTIONS:\n${customRules}` : ''}`;
  }

  getCapabilities(): string[] {
    return this.getFilteredTools().map(t => t.name);
  }

  async clearConversation(conversationId: string = 'default'): Promise<void> {
    // Delete from database (OpenClaw pattern)
    await prisma.conversationSession.deleteMany({
      where: {
        conversationId,
        agentId: this.config.id,
      },
    });
    console.log(`  🧹 Cleared conversation: ${conversationId}`);
  }
}
