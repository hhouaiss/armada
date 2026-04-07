import { Bot, Context } from 'grammy';
import { Router } from '../core/router.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { SessionManager } from '../core/session-manager.js';
import { getStoreCredentials, saveChatMessage, prisma } from '../lib/database.js';
import { decryptToken } from '../lib/shopify-client.js';
import { nanoid } from 'nanoid';

export class TelegramIntegration {
  private bot: Bot;
  private router: Router;
  private toolRegistry: ToolRegistry;
  private sessionManager: SessionManager;

  constructor(
    botToken: string,
    router: Router,
    toolRegistry: ToolRegistry,
    sessionManager: SessionManager
  ) {
    this.bot = new Bot(botToken);
    this.router = router;
    this.toolRegistry = toolRegistry;
    this.sessionManager = sessionManager;

    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.command('start', async (ctx: Context) => {
      await ctx.reply(
        `🚀 *Welcome to StoreTeam!*\n\n` +
        `I'm your AI-powered store assistant. I can help you:\n` +
        `• Manage products\n` +
        `• Track inventory\n` +
        `• Handle customer data\n\n` +
        `Just type a message to talk to your agents.\n` +
        `Use /agents to see available agents.\n` +
        `Use /help for more commands.`,
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.command('help', async (ctx: Context) => {
      await ctx.reply(
        `📚 *Commands:*\n\n` +
        `/start - Get started\n` +
        `/agents - List your agents\n` +
        `/products - Ask about products\n` +
        `/inventory - Check inventory\n` +
        `/customers - Customer info\n` +
        `/help - Show this help\n\n` +
        `Or just chat naturally! I'll route your message to the right agent.`,
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.command('agents', async (ctx: Context) => {
      const agents = this.router.getAllAgents();
      if (agents.length === 0) {
        await ctx.reply('No agents loaded. Connect a store first in the StoreTeam dashboard.');
        return;
      }
      const agentList = agents.map(a => `• *${a.name}* (${a.type})`).join('\n');
      await ctx.reply(`🤖 *Active Agents:*\n\n${agentList}`, { parse_mode: 'Markdown' });
    });

    // Shortcut commands route with context hints
    this.bot.command('products', async (ctx: Context) => {
      const text = ctx.message?.text?.replace('/products', '').trim() || 'List my products';
      await this.routeToAgent(ctx, text);
    });

    this.bot.command('inventory', async (ctx: Context) => {
      const text = ctx.message?.text?.replace('/inventory', '').trim() || 'Show low stock items';
      await this.routeToAgent(ctx, text);
    });

    this.bot.command('customers', async (ctx: Context) => {
      const text = ctx.message?.text?.replace('/customers', '').trim() || 'List my customers';
      await this.routeToAgent(ctx, text);
    });

    // Handle all text messages - route to agents
    this.bot.on('message:text', async (ctx: Context) => {
      const message = ctx.message?.text;
      if (!message) return;

      console.log(`\n📱 Telegram message from ${ctx.from?.first_name}: ${message}`);

      // Use smart routing (OpenClaw context-aware pattern)
      await this.routeToAgent(ctx, message);
    });

    this.bot.catch((err: any) => {
      console.error('Telegram bot error:', err);
    });
  }

  private async routeToAgent(ctx: Context, message: string) {
    try {
      // Find the first store with agents
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        include: { agents: { where: { isActive: true } } },
        take: 1,
      });

      if (stores.length === 0) {
        await ctx.reply('❌ No store connected. Please connect a store in the StoreTeam dashboard first.');
        return;
      }

      const store = stores[0];

      // Always route through The Major so the full conversation is remembered.
      // The Major dispatches to specialists as needed while maintaining a single
      // persistent session for this Telegram user.
      const storeAgents = this.router.getAgentsByStore(store.id);
      const agent = storeAgents.find(a => a.config.type === 'major')
        ?? storeAgents[0]; // fallback to any available agent if Major not seeded yet

      if (!agent) {
        await ctx.reply('❌ No agents available for this store. Please check the dashboard.');
        return;
      }

      await ctx.reply('🤖 Processing...');

      // Build tool context — include router so The Major can dispatch to specialists
      const accessToken = decryptToken(store.accessToken);
      const context = {
        storeId: store.id,
        shopifyAccessToken: accessToken,
        shopifyDomain: store.shopifyDomain,
        agentId: agent.config.id,
        operationId: nanoid(),
        channel: 'telegram' as const,
        router: this.router,
      };

      // Save user message
      await saveChatMessage({
        storeId: store.id,
        agentId: agent.config.id,
        sender: 'user',
        content: message,
        metadata: { channel: 'telegram', telegramUserId: ctx.from?.id },
      });

      // Unified conversationId shared with the web app — same memory across all channels
      const conversationId = `user-${store.id}`;
      const response = await agent.chat(message, context, conversationId);

      // Save agent response
      await saveChatMessage({
        storeId: store.id,
        agentId: agent.config.id,
        sender: 'agent',
        content: response,
        metadata: { channel: 'telegram' },
      });

      // Send response (split long messages)
      const chunks = this.splitMessage(response, 4000);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } catch (error) {
      console.error('Telegram routing error:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Error: ${errMsg}`);
    }
  }

  // Removed inferAgentType() - now using SmartRouter for context-aware routing

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt === -1 || splitAt < maxLength / 2) splitAt = maxLength;
      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trimStart();
    }
    return chunks;
  }

  async start() {
    console.log('📱 Starting Telegram bot...');
    this.bot.start();
    console.log('✓ Telegram bot started');
  }

  async stop() {
    await this.bot.stop();
  }

  async sendMessage(chatId: string, message: string) {
    await this.bot.api.sendMessage(chatId, message);
  }
}
