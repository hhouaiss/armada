/**
 * Telegram Integration — Sprint 5
 *
 * Features:
 * - /link {storeId}    — Associate this chat with a store
 * - /status            — Day summary via The Major
 * - /dream             — Trigger AutoDream manually
 * - /kairos on|off     — Toggle KAIROS proactive alerts
 * - Natural text       — Routes to The Major for the linked store
 * - KAIROS alerts      — Sent with inline confirm/dismiss buttons
 */

import { Bot, Context, InlineKeyboard } from 'grammy';
import { Router } from '../core/router.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { SessionManager } from '../core/session-manager.js';
import { getStoreCredentials, saveChatMessage, prisma } from '../lib/database.js';
import { decryptToken } from '../lib/shopify-client.js';
import { nanoid } from 'nanoid';
import { runAutoDream } from '../workers/auto-dream.js';
import { setKairosEnabled } from '../workers/kairos-worker.js';

// ─── chatId ↔ storeId mapping helpers ────────────────────────────────────────
// Stored in AgentMemory: type='meta', key='telegram_chat_{chatId}', content=storeId
// Reverse:              type='meta', key='telegram_store_chat', content=chatId (per store)

async function getStoreIdForChat(chatId: string): Promise<string | null> {
  const record = await prisma.agentMemory
    .findFirst({ where: { type: 'meta', key: `telegram_chat_${chatId}` } })
    .catch(() => null);
  return record?.content ?? null;
}

async function getChatIdForStore(storeId: string): Promise<string | null> {
  const record = await prisma.agentMemory
    .findUnique({ where: { storeId_type_key: { storeId, type: 'meta', key: 'telegram_store_chat' } } })
    .catch(() => null);
  return record?.content ?? null;
}

async function linkChatToStore(chatId: string, storeId: string): Promise<void> {
  await Promise.all([
    // chatId → storeId (global lookup — no storeId in WHERE, so upsert by findFirst + create)
    prisma.agentMemory.upsert({
      where: { storeId_type_key: { storeId, type: 'meta', key: `telegram_chat_${chatId}` } },
      create: { storeId, type: 'meta', key: `telegram_chat_${chatId}`, content: storeId },
      update: { content: storeId },
    }),
    // storeId → chatId (one Telegram chat per store)
    prisma.agentMemory.upsert({
      where: { storeId_type_key: { storeId, type: 'meta', key: 'telegram_store_chat' } },
      create: { storeId, type: 'meta', key: 'telegram_store_chat', content: chatId },
      update: { content: chatId },
    }),
  ]);
}

// ─── TelegramIntegration ──────────────────────────────────────────────────────

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

  // ─── Handlers ───────────────────────────────────────────────────────────────

  private setupHandlers() {
    // ── /start ────────────────────────────────────────────────────────────────
    this.bot.command('start', async (ctx: Context) => {
      const chatId = String(ctx.chat?.id);
      const linkedStoreId = await getStoreIdForChat(chatId);

      if (linkedStoreId) {
        const store = await prisma.store.findUnique({
          where: { id: linkedStoreId },
          select: { storeName: true },
        }).catch(() => null);
        await ctx.reply(
          `Bonjour ! Vous êtes connecté à *${store?.storeName ?? linkedStoreId}*.\n\nTapez un message pour parler à votre équipe.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `Bienvenue sur *Armada HQ* !\n\n` +
          `Pour commencer, liez ce chat à votre boutique :\n` +
          `\`/link VOTRE_STORE_ID\`\n\n` +
          `Vous trouverez votre Store ID dans le tableau de bord.`,
          { parse_mode: 'Markdown' }
        );
      }
    });

    // ── /link {storeId} ───────────────────────────────────────────────────────
    this.bot.command('link', async (ctx: Context) => {
      const chatId = String(ctx.chat?.id);
      const storeId = ctx.message?.text?.split(' ')[1]?.trim();

      if (!storeId) {
        await ctx.reply('Usage: `/link STORE_ID`', { parse_mode: 'Markdown' });
        return;
      }

      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, storeName: true, isActive: true },
      }).catch(() => null);

      if (!store || !store.isActive) {
        await ctx.reply(`Store introuvable ou inactif : \`${storeId}\``, { parse_mode: 'Markdown' });
        return;
      }

      await linkChatToStore(chatId, storeId);
      await ctx.reply(
        `✅ Chat lié à *${store.storeName}*.\n\nKAIROS vous enverra des alertes ici. Tapez un message pour commencer.`,
        { parse_mode: 'Markdown' }
      );
    });

    // ── /help ─────────────────────────────────────────────────────────────────
    this.bot.command('help', async (ctx: Context) => {
      await ctx.reply(
        `*Commandes disponibles :*\n\n` +
        `/link ID — Lier ce chat à un workspace\n` +
        `/status — Résumé du jour\n` +
        `/briefing — Briefing complet + priorités\n` +
        `/agents — Liste des agents actifs\n` +
        `/dream — Consolider la mémoire (AutoDream)\n` +
        `/kairos on|off — Activer/désactiver les alertes proactives\n` +
        `/help — Cette aide\n\n` +
        `Ou tapez simplement votre message pour parler à votre équipe.`,
        { parse_mode: 'Markdown' }
      );
    });

    // ── /status ───────────────────────────────────────────────────────────────
    this.bot.command('status', async (ctx: Context) => {
      await this.routeToAgent(
        ctx,
        'Donne-moi un résumé rapide de la situation du jour : activité des agents, tâches en cours, et points d\'attention.'
      );
    });

    // ── /briefing ─────────────────────────────────────────────────────────────
    this.bot.command('briefing', async (ctx: Context) => {
      await this.routeToAgent(
        ctx,
        'Génère un briefing complet pour aujourd\'hui : bilan de la nuit (AutoDream), ' +
        'actions prioritaires du jour, points d\'attention importants. ' +
        'Sois proactif et propose des actions concrètes.'
      );
    });

    // ── /agents ───────────────────────────────────────────────────────────────
    this.bot.command('agents', async (ctx: Context) => {
      const chatId = String(ctx.chat?.id);
      const storeId = await getStoreIdForChat(chatId);
      if (!storeId) {
        await ctx.reply('Aucun workspace lié. Utilisez `/link STORE_ID` d\'abord.', { parse_mode: 'Markdown' });
        return;
      }

      const storeAgents = this.router.getAgentsByStore(storeId);
      if (storeAgents.length === 0) {
        await ctx.reply('Aucun agent actif pour ce workspace.');
        return;
      }

      const lines = storeAgents.map(a => {
        const status = a.config.type === 'major' ? '⭐' : '🤖';
        return `${status} *${a.config.name}* — ${a.config.type}`;
      });

      await ctx.reply(
        `*Votre équipe (${storeAgents.length} agents) :*\n\n${lines.join('\n')}\n\n` +
        `Tapez un message pour interagir avec Le Major.`,
        { parse_mode: 'Markdown' }
      );
    });

    // ── /dream ────────────────────────────────────────────────────────────────
    this.bot.command('dream', async (ctx: Context) => {
      const chatId = String(ctx.chat?.id);
      const storeId = await getStoreIdForChat(chatId);
      if (!storeId) {
        await ctx.reply('Aucune boutique liée. Utilisez `/link STORE_ID` d\'abord.', { parse_mode: 'Markdown' });
        return;
      }

      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { userId: true },
      }).catch(() => null);

      if (!store) {
        await ctx.reply('Boutique introuvable.');
        return;
      }

      await ctx.reply('💤 AutoDream démarré en arrière-plan...');
      runAutoDream(storeId, store.userId).catch((err) =>
        console.error('AutoDream error (Telegram trigger):', err)
      );
    });

    // ── /kairos on|off ────────────────────────────────────────────────────────
    this.bot.command('kairos', async (ctx: Context) => {
      const chatId = String(ctx.chat?.id);
      const storeId = await getStoreIdForChat(chatId);
      if (!storeId) {
        await ctx.reply('Aucune boutique liée. Utilisez `/link STORE_ID` d\'abord.', { parse_mode: 'Markdown' });
        return;
      }

      const arg = ctx.message?.text?.split(' ')[1]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        await ctx.reply('Usage: `/kairos on` ou `/kairos off`', { parse_mode: 'Markdown' });
        return;
      }

      await setKairosEnabled(storeId, arg === 'on');
      await ctx.reply(
        arg === 'on'
          ? '✅ KAIROS activé — vous recevrez des alertes proactives toutes les 15 minutes.'
          : '⏸ KAIROS désactivé — plus d\'alertes automatiques.'
      );
    });

    // ── Callback queries (inline buttons) ────────────────────────────────────
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      if (data === 'kairos:dismiss') {
        await ctx.answerCallbackQuery({ text: 'Alerte ignorée.' });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return;
      }

      if (data === 'kairos:ack') {
        await ctx.answerCallbackQuery({ text: 'Compris, je note.' });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return;
      }

      if (data === 'kairos:analyse') {
        await ctx.answerCallbackQuery({ text: 'Le Major analyse...' });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        // Trigger an analysis via the Major agent
        await this.routeToAgent(
          ctx,
          'KAIROS vient de détecter une alerte. Analyse la situation et propose des actions concrètes immédiates.'
        );
        return;
      }

      await ctx.answerCallbackQuery();
    });

    // ── Text messages ─────────────────────────────────────────────────────────
    this.bot.on('message:text', async (ctx: Context) => {
      const message = ctx.message?.text;
      if (!message) return;
      console.log(`\n📱 Telegram [${ctx.from?.first_name}]: ${message}`);
      await this.routeToAgent(ctx, message);
    });

    this.bot.catch((err: any) => {
      console.error('Telegram bot error:', err);
    });
  }

  // ─── Route to agent ──────────────────────────────────────────────────────────

  private async routeToAgent(ctx: Context, message: string) {
    const chatId = String(ctx.chat?.id);

    try {
      // Resolve store from linked chatId, fall back to first active store
      let storeId = await getStoreIdForChat(chatId);

      if (!storeId) {
        const firstStore = await prisma.store.findFirst({
          where: { isActive: true },
          select: { id: true },
        });
        if (!firstStore) {
          await ctx.reply('Aucune boutique connectée. Configurez-en une dans le tableau de bord.');
          return;
        }
        storeId = firstStore.id;
      }

      const storeAgents = this.router.getAgentsByStore(storeId);
      const agent =
        storeAgents.find((a) => a.config.type === 'major') ?? storeAgents[0];

      if (!agent) {
        await ctx.reply('Aucun agent disponible pour cette boutique.');
        return;
      }

      const thinkingMsg = await ctx.reply('_Traitement en cours..._', { parse_mode: 'Markdown' });

      const store = await getStoreCredentials(storeId);
      const accessToken = decryptToken(store.accessToken);
      const context = {
        storeId,
        shopifyAccessToken: accessToken,
        shopifyDomain: store.shopifyDomain,
        agentId: agent.config.id,
        operationId: nanoid(),
        channel: 'telegram' as const,
        router: this.router,
        toolRegistry: this.toolRegistry,
        sessionManager: this.sessionManager,
      };

      await saveChatMessage({
        storeId,
        agentId: agent.config.id,
        sender: 'user',
        content: message,
        metadata: { channel: 'telegram', chatId },
      });

      // Shared conversationId with the web app — same memory across channels
      const conversationId = `user-${storeId}`;
      const response = await agent.chat(message, context, conversationId);

      await saveChatMessage({
        storeId,
        agentId: agent.config.id,
        sender: 'agent',
        content: response,
        metadata: { channel: 'telegram' },
      });

      // Delete "thinking" indicator
      await ctx.api.deleteMessage(ctx.chat!.id, thinkingMsg.message_id).catch(() => {});

      const chunks = this.splitMessage(response, 4000);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(async () => {
          // If Markdown parse fails (special chars), send as plain text
          await ctx.reply(chunk);
        });
      }
    } catch (error) {
      console.error('Telegram routing error:', error);
      const errMsg = error instanceof Error ? error.message : 'Erreur inconnue';
      await ctx.reply(`Erreur : ${errMsg}`);
    }
  }

  // ─── KAIROS alert sending ────────────────────────────────────────────────────

  /**
   * Send a KAIROS alert to the store's linked Telegram chat.
   * Shows inline buttons: "J'ai compris" / "Ignorer"
   */
  async sendAlert(storeId: string, text: string, hasActionButtons = false): Promise<void> {
    const chatId = await getChatIdForStore(storeId);
    if (!chatId) return; // Store not linked to any Telegram chat

    const keyboard = new InlineKeyboard();
    if (hasActionButtons) {
      keyboard
        .text('Demander analyse', 'kairos:analyse')
        .text('J\'ai compris', 'kairos:ack')
        .row()
        .text('Ignorer', 'kairos:dismiss');
    } else {
      keyboard.text('Ignorer', 'kairos:dismiss');
    }

    await this.bot.api.sendMessage(Number(chatId), text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  /**
   * Send a proactive morning briefing to the store's linked Telegram chat.
   * Called daily at ~09:00 local time from the gateway scheduler.
   */
  async sendMorningBriefing(storeId: string): Promise<void> {
    const chatId = await getChatIdForStore(storeId);
    if (!chatId) return;

    const storeAgents = this.router.getAgentsByStore(storeId);
    const agent = storeAgents.find(a => a.config.type === 'major') ?? storeAgents[0];
    if (!agent) return;

    console.log(`☀️  Sending morning briefing for store ${storeId}`);

    try {
      const store = await getStoreCredentials(storeId);
      const accessToken = decryptToken(store.accessToken);
      const context = {
        storeId,
        shopifyAccessToken: accessToken,
        shopifyDomain: store.shopifyDomain,
        agentId: agent.config.id,
        operationId: nanoid(),
        channel: 'telegram' as const,
        router: this.router,
        toolRegistry: this.toolRegistry,
        sessionManager: this.sessionManager,
      };

      const briefingPrompt =
        'C\'est le matin. Génère un briefing de démarrage de journée : ' +
        'bilan de la nuit, métriques clés, 3 priorités du jour, ' +
        'et une recommandation proactive. Sois concis et actionnable.';

      const response = await agent.chat(briefingPrompt, context, `briefing-${storeId}`);

      const chunks = this.splitMessage(`☀️ *Briefing du matin*\n\n${response}`, 4000);
      for (const chunk of chunks) {
        await this.bot.api.sendMessage(Number(chatId), chunk, { parse_mode: 'Markdown' }).catch(async () => {
          await this.bot.api.sendMessage(Number(chatId), chunk);
        });
      }
    } catch (err) {
      console.error('Morning briefing error:', err);
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

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
    // Register bot commands — creates the "/" menu in the Telegram UI
    await this.bot.api.setMyCommands([
      { command: 'status',   description: 'Résumé rapide du jour' },
      { command: 'briefing', description: 'Briefing complet + priorités du jour' },
      { command: 'agents',   description: 'Liste des agents actifs' },
      { command: 'kairos',   description: 'Alertes proactives — /kairos on | off' },
      { command: 'dream',    description: 'Consolider la mémoire (AutoDream)' },
      { command: 'link',     description: 'Lier ce chat à un workspace — /link ID' },
      { command: 'help',     description: 'Afficher l\'aide' },
    ]);

    this.bot.start();
  }

  async stop() {
    await this.bot.stop();
  }
}
