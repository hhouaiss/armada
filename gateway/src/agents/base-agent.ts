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
  saveLivrable,
  prisma
} from '../lib/database.js';
import { decryptToken } from '../lib/shopify-client.js';
import { createLLMProvider } from '../lib/llm/provider-factory.js';
import { LLMProvider } from '../lib/llm/types.js';
import { classifyComplexity } from '../core/complexity-router.js';
import { MemoryEngine } from '../lib/memory-engine.js';

// ── Context window compaction (4 levels) ─────────────────────────────────────
//
// All levels operate only on the LLM-bound slice — the full history is always
// saved intact in the database.
//
// Level 2 (all msgs)  — trim tool_result content > 3000 chars
// Level 3 (mid msgs)  — strip tool_use INPUT blocks from assistant messages
//                       (the result is what matters, not the params)
// Level 4 (old msgs)  — drop user messages that consist solely of tool_results
//                       (pure operational round-trips with no conversational value)

const TOOL_RESULT_MAX_CHARS = 3000;

/** Level 2 — trim oversized tool_result content. */
function applyLevel2(msg: Anthropic.MessageParam): Anthropic.MessageParam {
  if (!Array.isArray(msg.content)) return msg;
  const content = msg.content.map((block: any) => {
    if (block.type !== 'tool_result' || typeof block.content !== 'string') return block;
    if (block.content.length <= TOOL_RESULT_MAX_CHARS) return block;
    const dropped = block.content.length - TOOL_RESULT_MAX_CHARS;
    return {
      ...block,
      content: `${block.content.slice(0, TOOL_RESULT_MAX_CHARS)}\n... [${dropped} chars truncated]`,
    };
  });
  return { ...msg, content };
}

/** Level 3 — strip tool_use INPUT blocks from assistant messages (keep text only). */
function applyLevel3(msg: Anthropic.MessageParam): Anthropic.MessageParam {
  if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return msg;
  const textOnly = msg.content.filter((block: any) => block.type !== 'tool_use');
  // If stripping leaves nothing, keep a placeholder so the turn structure stays valid
  if (textOnly.length === 0) {
    return { ...msg, content: [{ type: 'text', text: '[tool call — details omitted]' }] };
  }
  return { ...msg, content: textOnly };
}

/** Level 4 — return null for user messages that are ONLY tool_results (no human text). */
function applyLevel4(msg: Anthropic.MessageParam): Anthropic.MessageParam | null {
  if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;
  const hasNonToolResult = msg.content.some((block: any) => block.type !== 'tool_result');
  return hasNonToolResult ? msg : null;
}

// Keep the old export name so nothing else breaks.
function compactToolResults(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((msg, i, arr) => {
    const len = arr.length;
    // Level 2 always
    const m2 = applyLevel2(msg);
    // Level 3 for mid-window messages (older than last 20)
    if (i < len - 20) {
      const m3 = applyLevel3(m2);
      // Level 4 for old messages (older than last 60)
      if (i < len - 60) return applyLevel4(m3);
      return m3;
    }
    return m2;
  }).filter((m): m is Anthropic.MessageParam => m !== null);
}

export class BaseAgent {
  // Removed in-memory Map - now using database persistence (OpenClaw pattern)

  constructor(
    public config: AgentConfig,
    protected toolRegistry: ToolRegistry,
    protected sessionManager: SessionManager
  ) {}

  private async getLLMProvider(message?: string): Promise<{ provider: LLMProvider; modelProvider: string; modelName: string }> {
    // Get agent config from database to get model settings
    const agent = await prisma.agent.findUnique({
      where: { id: this.config.id },
      include: { store: { include: { user: true } } },
    });

    if (!agent) {
      throw new Error(`Agent ${this.config.id} not found in database`);
    }

    let modelProvider = agent.modelProvider || 'anthropic';
    let modelName = agent.modelName || 'claude-sonnet-4-5-20250929';
    const userId = agent.store.userId;

    // ClawXRouter: 3-tier complexity-based auto routing
    // simple  → Gemma 4 (fast, cheap) — data lookups, direct questions
    // moyenne → Claude Sonnet (balanced) — explanations, comparisons
    // complexe → Kimi K2.5 (powerful) — strategy, writing, multi-domain
    if (agent.routingMode === 'auto' && message) {
      const complexity = classifyComplexity(message);
      modelProvider = 'openrouter';
      modelName =
        complexity === 'simple'
          ? (agent.autoSimpleModel || 'google/gemma-4-31b-it')
          : complexity === 'moyenne'
          ? 'google/gemma-4-31b-it'
          : (agent.autoComplexModel || 'moonshotai/kimi-k2.5');
      console.log(`  🧭 ClawXRouter: ${complexity} → ${modelName}`);
    }

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

  // ── Pending approvals ────────────────────────────────────────────────────────
  // Module-level map: conversationId → pending tool call awaiting user confirmation.
  // TTL: 10 minutes. Only one pending action per conversation at a time.
  private static readonly pendingApprovals = new Map<string, {
    approvalKey: string;
    toolName: string;
    params: any;
    expiresAt: number;
  }>();

  private static getApprovalKey(toolName: string, params: any): string {
    // Stable key regardless of key ordering
    const sorted = Object.fromEntries(Object.entries(params).sort());
    return `${toolName}:${JSON.stringify(sorted)}`;
  }

  private static isConfirmation(message: string): boolean {
    const lower = message.toLowerCase().trim();
    if (lower.length > 80) return false; // Long messages are probably new requests, not confirmations
    return /^(yes|oui|ok|go|sure|yep|yeah|proceed|confirm|approve|do it|vas-y|absolument|d'accord|c'est bon|parfait|execute|exécute|confirme|approuve)/.test(lower);
  }

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

    // ── Approval gate ─────────────────────────────────────────────────────────
    // If the user's message is a confirmation, mark the pending action as approved
    // so the LLM can call it in this turn without being blocked again.
    const approvedKeysThisTurn = new Set<string>();
    if (BaseAgent.isConfirmation(message)) {
      const pending = BaseAgent.pendingApprovals.get(conversationId);
      if (pending && pending.expiresAt > Date.now()) {
        approvedKeysThisTurn.add(pending.approvalKey);
        BaseAgent.pendingApprovals.delete(conversationId);
        console.log(`  ✅ Approval received for: ${pending.toolName}`);
      }
    }
    // Also purge expired entries on each chat() call (lightweight GC)
    const now = Date.now();
    for (const [key, val] of BaseAgent.pendingApprovals) {
      if (val.expiresAt < now) BaseAgent.pendingApprovals.delete(key);
    }

    // First user message
    addToHistory({ role: 'user', content: message });

    // Level 5: LLM summarization — runs once before the agentic loop when history
    // exceeds the context window. The summary is cached in AgentMemory so future
    // turns reuse it unless the covered range has grown significantly.
    let contextSummaryMessages: Anthropic.MessageParam[] = [];
    if (fullHistory.length > BaseAgent.LLM_CONTEXT_WINDOW) {
      const cutoff = fullHistory.length - BaseAgent.LLM_CONTEXT_WINDOW;
      contextSummaryMessages = await this.buildContextSummaryMessages(
        fullHistory.slice(0, cutoff),
        conversationId,
        context,
      );
    }

    // Sliding context window for LLM: [summary?] + last N messages + new messages
    const buildContextWindow = (): Anthropic.MessageParam[] => {
      const recentBase = fullHistory.slice(-BaseAgent.LLM_CONTEXT_WINDOW);
      return compactToolResults([...contextSummaryMessages, ...recentBase, ...newMessages]);
    };

    const session = this.sessionManager.create(this.config.id, 'chat');

    try {
      const { provider, modelProvider, modelName } = await this.getLLMProvider(message);
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
            const approvalKey = BaseAgent.getApprovalKey(toolCall.name, toolCall.input as any);
            if (!approvedKeysThisTurn.has(approvalKey)) {
              // Block execution — store as pending, ask the user to confirm
              BaseAgent.pendingApprovals.set(conversationId, {
                approvalKey,
                toolName: toolCall.name,
                params: toolCall.input,
                expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
              });
              console.log(`  🔐 Approval required for: ${toolCall.name}`);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `APPROVAL_REQUIRED\n\nTool: ${toolCall.name}\nDetails:\n${JSON.stringify(toolCall.input, null, 2)}\n\nDescribe exactly what you are about to do and ask the user for explicit confirmation before proceeding. Once they confirm, the action will execute automatically.`,
                is_error: false,
              });
              continue;
            }
            // User already confirmed — remove from approved set and proceed
            approvedKeysThisTurn.delete(approvalKey);
            console.log(`  ✅ Executing approved action: ${toolCall.name}`);
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

      // ── Livrable interception ─────────────────────────────────────────────
      // Supports two formats:
      //   NEW (block): [LIVRABLE_CONTENT:slug:title]...[/LIVRABLE_CONTENT]
      //     → strip block from chat, save content, append card marker
      //   LEGACY (inline): [LIVRABLE:slug:title]
      //     → full response is the content, replace marker with real DB id
      let processedResponse = finalResponse;

      const blockRegex = /\[LIVRABLE_CONTENT:([^:\]]+):([^\]]+)\]([\s\S]*?)\[\/LIVRABLE_CONTENT\]/;
      const blockMatch = processedResponse.match(blockRegex);

      if (blockMatch) {
        const slug = blockMatch[1].trim();
        const title = blockMatch[2].trim();
        const content = blockMatch[3].trim();
        // Strip the block — keep only the brief chat summary
        processedResponse = processedResponse.replace(blockMatch[0], '').trim();
        try {
          const saved = await saveLivrable({
            slug,
            title,
            content,
            agentName: this.config.name,
            agentType: this.config.type,
            storeId: context.storeId,
            agentId: this.config.id,
          });
          // Append clickable card marker so the frontend renders a link card
          processedResponse = `${processedResponse}\n\n[LIVRABLE:${saved.id}:${title}]`;
          console.log(`  📄 Livrable saved (block): "${title}" (id: ${saved.id})`);
        } catch (err) {
          console.warn('  ⚠️  Could not save livrable:', err);
        }
      } else {
        // Legacy inline format
        const legacyMatch = processedResponse.match(/\[LIVRABLE:([^:\]]+):([^\]]+)\]/);
        if (legacyMatch) {
          const slug = legacyMatch[1].trim();
          const title = legacyMatch[2].trim();
          const content = processedResponse.replace(/\[LIVRABLE:[^\]]+\]\s*/g, '').trim();
          try {
            const saved = await saveLivrable({
              slug,
              title,
              content,
              agentName: this.config.name,
              agentType: this.config.type,
              storeId: context.storeId,
              agentId: this.config.id,
            });
            processedResponse = processedResponse.replace(
              legacyMatch[0],
              `[LIVRABLE:${saved.id}:${title}]`
            );
            console.log(`  📄 Livrable saved (legacy): "${title}" (id: ${saved.id})`);
          } catch (err) {
            console.warn('  ⚠️  Could not save livrable:', err);
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      addToHistory({ role: 'assistant', content: processedResponse });

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
      return processedResponse;
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
    product:   ['products', 'collections', 'inventory', 'orders', 'store', 'memory'],
    inventory: ['inventory', 'products', 'store', 'memory'],
    support:   ['customers', 'orders', 'products', 'store', 'memory'],
    content:   ['content', 'products', 'collections', 'store', 'memory'],
    seo:       ['seo', 'store', 'memory'],
    major:     ['products', 'collections', 'inventory', 'orders', 'customers', 'store', 'memory'],
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

    // Load memory index (Couche 1 — always injected, lightweight)
    const memoryEngine = new MemoryEngine(this.config.storeId);
    const memorySummary = await memoryEngine.buildIndexSummary();
    const memorySection = memorySummary ? `\n\n${memorySummary}` : '';

    return `${systemPrompt}${skillsSection}${additionalContext}${memorySection}

CURRENT DATE & TIME: ${now.toUTCString()} (today is ${todayStr})
When working with date ranges, always use dates relative to today (${todayStr}). For "last 30 days" use ${last30StartStr} to ${todayStr}.

Available tools: ${toolNames}

CRITICAL RULES:
1. Use tools to get REAL data from the store. Never make up data.
2. Tools marked as requiring approval (product_create, product_update, inventory_update, customer_update_tags) will NOT execute immediately. Instead, you must CLEARLY describe what you want to do and ask the user for confirmation before using those tools.
3. For read-only operations (product_list, product_get, customer_list, etc.), you can execute them directly.
4. When listing items, use reasonable limits (10-20) unless the user asks for more.
10. MÉMOIRE — Tu disposes des outils memory_read et memory_write:
    - Utilise memory_write("decision", ...) quand le boss prend une décision stratégique.
    - Utilise memory_write("fact", ...) quand il partage une info clé (objectif, contrainte, préférence).
    - Utilise memory_write("topic", ...) pour documenter une stratégie ou un processus détaillé.
    - Utilise memory_read(key) pour charger le détail d'un topic mentionné dans la section MÉMOIRE DE L'ÉQUIPE.
    - Ne mémorise PAS les données opérationnelles (liste de produits, commandes du jour) — seulement les infos stratégiques durables.
5. Format responses clearly. Use bullet points for lists.
6. If something fails, explain what went wrong and suggest alternatives.
7. Always be helpful, professional, and accurate.
8. NEVER use dates from your training data. Always use today's date (${todayStr}) as the reference point for any date ranges.
9. LANGUAGE: Tu réponds TOUJOURS en français par défaut, quelle que soit la langue du message système. Le français est ta langue principale. Si l'utilisateur écrit dans une autre langue, réponds dans cette langue — mais si la langue est ambiguë, utilise le français.
10. LIVRABLES — RÈGLE ABSOLUE: Quand tu produis un contenu long (article de blog, analyse SEO, rapport de performance, audit, plan d'action, stratégie, guide — tout contenu structuré de plus de ~200 mots), tu dois OBLIGATOIREMENT séparer le contenu du message de chat :

    DANS LE MESSAGE CHAT : écris UNIQUEMENT 2-3 phrases résumant ce que tu as produit et ce qu'il contient. JAMAIS le contenu complet.
    LE CONTENU COMPLET : enveloppe-le dans ce bloc spécial (à placer à la fin de ton message) :

    [LIVRABLE_CONTENT:{slug}:{titre}]
    ...contenu complet ici (markdown, HTML, tableaux, listes — tout)...
    [/LIVRABLE_CONTENT]

    Règles slug : kebab-case minuscule avec date (ex: article-blog-escamotable-avril-2026, analyse-seo-avril-2026, plan-action-seo-q2-2026)
    Règles titre : titre français lisible (ex: Article Blog — Bureau Escamotable vs Rabattable)

    EXEMPLE DE MESSAGE CORRECT :
    "J'ai rédigé l'article de blog sur les bureaux escamotables. Il couvre les définitions, une comparaison en 8 critères, et les recommandations produits Remood. Disponible dans vos Livrables.

    [LIVRABLE_CONTENT:article-blog-escamotable-avril-2026:Article Blog — Bureau Escamotable vs Rabattable]
    <h1>Bureau Escamotable vs Rabattable...</h1>
    ...contenu complet HTML ou markdown...
    [/LIVRABLE_CONTENT]"

    EXEMPLE DE MESSAGE INCORRECT (à ne JAMAIS faire) :
    Écrire l'intégralité de l'article ou du rapport directement dans le message de chat.

    Ce système permet à Armada HQ de créer automatiquement un livrable structuré, d'envoyer une notification à l'utilisateur, et de rendre le contenu accessible depuis l'espace Livrables avec un lien direct.

${customRules ? `\nADDITIONAL INSTRUCTIONS:\n${customRules}` : ''}`;
  }

  // ── Level 5 compaction helpers ────────────────────────────────────────────────

  /**
   * Returns a [user-summary, assistant-ack] message pair that replaces the oldest
   * messages that no longer fit in the context window. Caches the result in
   * AgentMemory so subsequent turns avoid regenerating until the covered range
   * shifts by more than 20 messages.
   */
  private async buildContextSummaryMessages(
    oldMessages: Anthropic.MessageParam[],
    conversationId: string,
    context: ToolContext,
  ): Promise<Anthropic.MessageParam[]> {
    const cutoff = oldMessages.length;
    const summaryKey = `ctx_summary_${conversationId}`;

    // Try cached summary first
    let summaryText: string | null = null;
    try {
      const cached = await prisma.agentMemory.findFirst({
        where: { storeId: context.storeId, type: 'summary', key: summaryKey },
      });
      if (cached) {
        const data = JSON.parse(cached.content) as { summary: string; coveredUntilIndex: number };
        if (data.coveredUntilIndex >= cutoff - 20) {
          summaryText = data.summary;
          console.log(`  📋 Level 5: reusing cached summary (covered ${data.coveredUntilIndex} msgs)`);
        }
      }
    } catch { /* cache miss is not fatal */ }

    // Generate fresh summary if needed
    if (!summaryText) {
      console.log(`  📋 Level 5: summarising ${oldMessages.length} old messages…`);
      summaryText = await this.generateContextSummary(oldMessages, context);
      try {
        const payload = JSON.stringify({ summary: summaryText, coveredUntilIndex: cutoff });
        await prisma.agentMemory.upsert({
          where: { storeId_type_key: { storeId: context.storeId, type: 'summary', key: summaryKey } },
          create: { storeId: context.storeId, type: 'summary', key: summaryKey, content: payload },
          update: { content: payload },
        });
      } catch (err) {
        console.warn('  ⚠️  Could not cache context summary:', err);
      }
    }

    return [
      {
        role: 'user',
        content: `[RÉSUMÉ — ${oldMessages.length} messages anciens condensés]\n\n${summaryText}`,
      },
      {
        role: 'assistant',
        content: 'Compris, je prends ce contexte en compte.',
      },
    ];
  }

  /** Calls a cheap LLM to produce a prose summary of the given messages. */
  private async generateContextSummary(
    oldMessages: Anthropic.MessageParam[],
    context: ToolContext,
  ): Promise<string> {
    const store = await prisma.store
      .findUnique({ where: { id: context.storeId }, select: { userId: true } })
      .catch(() => null);
    if (!store) return '[Résumé non disponible]';

    let summaryProvider: LLMProvider;
    try {
      summaryProvider = await createLLMProvider(store.userId, 'openrouter', 'google/gemma-4-26b-a4b-it');
    } catch {
      return '[Résumé non disponible]';
    }

    const formatted = oldMessages
      .map((m) => {
        const role = m.role === 'user' ? 'Utilisateur' : 'Agent';
        const content = Array.isArray(m.content)
          ? (m.content as any[])
              .map((b) => {
                if (b.type === 'text') return b.text?.slice(0, 400);
                if (b.type === 'tool_result') return `[Résultat: ${String(b.content).slice(0, 200)}]`;
                if (b.type === 'tool_use') return `[Outil: ${b.name}]`;
                return '';
              })
              .filter(Boolean)
              .join(' ')
          : String(m.content).slice(0, 400);
        return `${role}: ${content}`;
      })
      .join('\n\n');

    try {
      const resp = await summaryProvider.chat({
        messages: [
          {
            role: 'user',
            content: `Résume cette conversation en 3-5 paragraphes (max 600 mots). Garde les décisions, préférences, contexte business/produit important. Ignore les erreurs temporaires et données opérationnelles.\n\n${formatted}`,
          },
        ],
        systemPrompt:
          'Tu es un expert en synthèse de conversations professionnelles. Produis un résumé factuel et structuré en français.',
        tools: [],
        maxTokens: 800,
      });
      return resp.content || '[Résumé vide]';
    } catch (err) {
      console.warn('  ⚠️  Summary generation failed:', err);
      return '[Résumé non disponible — erreur de génération]';
    }
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
