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
import { decryptToken, ShopifyClient } from '../lib/shopify-client.js';
import { readObjectivesTool } from '../tools/read-objectives.js';
import { nanoid } from 'nanoid';
import { runAutoDream, setDreamEnabled, isDreamEnabled } from '../workers/auto-dream.js';
import {
  ChatAttachment,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  normalizeAttachment,
  toDataUrl,
} from '../lib/attachments.js';
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

/**
 * Resolve the store for a given chatId.
 * If not linked yet, auto-links to the single active store (no manual /link needed).
 * Returns null only if there are no active stores at all.
 */
async function resolveStore(chatId: string): Promise<{ id: string; storeName: string | null } | null> {
  let storeId = await getStoreIdForChat(chatId);

  if (!storeId) {
    // Auto-link to the first active store — users should never need to type a store ID
    const firstStore = await prisma.store
      .findFirst({ where: { isActive: true }, select: { id: true, storeName: true } })
      .catch(() => null);
    if (!firstStore) return null;
    await linkChatToStore(chatId, firstStore.id);
    return firstStore;
  }

  const store = await prisma.store
    .findUnique({ where: { id: storeId }, select: { id: true, storeName: true } })
    .catch(() => null);
  return store ?? null;
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
  private botToken: string;
  private router: Router;
  /**
   * Telegram sends an album as N separate messages sharing a media_group_id.
   * Buffer them briefly so the agent receives all the images in one turn.
   */
  private mediaGroups = new Map<
    string,
    { attachments: ChatAttachment[]; caption: string; timer: NodeJS.Timeout }
  >();
  private toolRegistry: ToolRegistry;
  private sessionManager: SessionManager;

  constructor(
    botToken: string,
    router: Router,
    toolRegistry: ToolRegistry,
    sessionManager: SessionManager
  ) {
    this.bot = new Bot(botToken);
    this.botToken = botToken;
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
      const store = await resolveStore(chatId);

      if (!store) {
        await ctx.reply(
          `Bienvenue sur *Armada HQ* !\n\n` +
          `Aucun workspace trouvé. Configurez-en un depuis le tableau de bord, puis revenez ici.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await ctx.reply(
        `Bonjour ! Connecté à *${store.storeName ?? 'votre workspace'}*.\n\nTapez un message pour parler à votre équipe, ou utilisez /help pour voir les commandes.`,
        { parse_mode: 'Markdown' }
      );
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
        `/status — Résumé du jour\n` +
        `/briefing — Briefing complet + priorités\n` +
        `/agents — Liste des agents actifs\n` +
        `/dream — Consolider la mémoire (AutoDream)\n` +
        `/kairos on|off — Activer/désactiver les alertes proactives\n` +
        `/help — Cette aide\n\n` +
        `Ou tapez simplement votre message pour parler à votre équipe.\n` +
        `Vous pouvez aussi *envoyer une photo* (visuel produit, capture d'écran, étiquette) : l'agent l'analyse.`,
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
      const store = await resolveStore(chatId);
      if (!store) {
        await ctx.reply('Aucun workspace trouvé. Configurez-en un depuis le tableau de bord.');
        return;
      }

      const storeAgents = this.router.getAgentsByStore(store.id);
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
      const store = await resolveStore(chatId);
      if (!store) {
        await ctx.reply('Aucun workspace trouvé. Configurez-en un depuis le tableau de bord.');
        return;
      }

      const arg = ctx.message?.text?.split(' ')[1]?.toLowerCase();

      // /dream on | off — toggle the nightly schedule
      if (arg === 'on' || arg === 'off') {
        await setDreamEnabled(store.id, arg === 'on');
        await ctx.reply(
          arg === 'on'
            ? '✅ AutoDream activé — consolidation mémoire chaque nuit à 03:00 UTC.'
            : '⏸ AutoDream désactivé — plus de cycle nocturne automatique.'
        );
        return;
      }

      // /dream (no arg) — trigger manually
      const storeData = await prisma.store.findUnique({
        where: { id: store.id },
        select: { userId: true },
      }).catch(() => null);

      if (!storeData) {
        await ctx.reply('Workspace introuvable en base de données.');
        return;
      }

      await ctx.reply('💤 AutoDream démarré en arrière-plan...');
      runAutoDream(store.id, storeData.userId).catch((err) =>
        console.error('AutoDream error (Telegram trigger):', err)
      );
    });

    // ── /kairos on|off ────────────────────────────────────────────────────────
    this.bot.command('kairos', async (ctx: Context) => {
      const chatId = String(ctx.chat?.id);
      const store = await resolveStore(chatId);
      if (!store) {
        await ctx.reply('Aucun workspace trouvé. Configurez-en un depuis le tableau de bord.');
        return;
      }

      const arg = ctx.message?.text?.split(' ')[1]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        await ctx.reply('Usage: `/kairos on` ou `/kairos off`', { parse_mode: 'Markdown' });
        return;
      }

      await setKairosEnabled(store.id, arg === 'on');
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

      // Approval decisions from inline buttons: approval:approve:<id> / approval:reject:<id>
      const approvalMatch = data?.match(/^approval:(approve|reject):(.+)$/);
      if (approvalMatch) {
        const [, decision, approvalId] = approvalMatch;
        const handled = await this.decideApproval(approvalId, decision === 'approve');
        await ctx.answerCallbackQuery({
          text: handled
            ? decision === 'approve' ? 'Approuvé — exécution en cours…' : 'Refusé.'
            : 'Demande déjà traitée ou expirée.',
        });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
        if (handled) {
          await ctx.reply(
            decision === 'approve'
              ? '✅ Approuvé — l\'action s\'exécute automatiquement. Résultat dans quelques secondes.'
              : '🚫 Refusé — l\'action ne sera pas exécutée.'
          );
        }
        return;
      }

      await ctx.answerCallbackQuery();
    });

    // ── Approval text commands: /approve_xxxxxxxx and /reject_xxxxxxxx ───────
    this.bot.hears(/^\/(approve|reject)_([A-Za-z0-9]+)\s*$/, async (ctx) => {
      const decision = ctx.match[1] as 'approve' | 'reject';
      const idSuffix = ctx.match[2];
      const approval = await prisma.approvalRequest.findFirst({
        where: { status: 'pending', id: { endsWith: idSuffix } },
        orderBy: { createdAt: 'desc' },
      });
      if (!approval) {
        await ctx.reply('Aucune demande d\'approbation en attente avec cet identifiant.');
        return;
      }
      const handled = await this.decideApproval(approval.id, decision === 'approve');
      await ctx.reply(
        !handled
          ? 'Demande déjà traitée ou expirée.'
          : decision === 'approve'
            ? '✅ Approuvé — l\'action s\'exécute automatiquement. Résultat dans quelques secondes.'
            : '🚫 Refusé — l\'action ne sera pas exécutée.'
      );
    });

    // ── Photos ────────────────────────────────────────────────────────────────
    this.bot.on('message:photo', async (ctx: Context) => {
      const sizes = ctx.message?.photo ?? [];
      // Telegram sends several resolutions — take the largest one that fits
      // the model's image budget.
      const best = [...sizes]
        .sort((a, b) => (a.file_size ?? a.width * a.height) - (b.file_size ?? b.width * b.height))
        .filter((p) => (p.file_size ?? 0) <= MAX_IMAGE_BYTES)
        .pop() ?? sizes[0];
      if (!best) return;

      console.log(`\n📱 Telegram [${ctx.from?.first_name}]: 🖼️ photo`);
      const attachment = await this.downloadAttachment(best.file_id, 'image/jpeg', 'photo.jpg');
      if (!attachment) {
        await ctx.reply("Impossible de lire cette image (trop lourde ou format non supporté).");
        return;
      }
      await this.handleIncomingImage(ctx, attachment, ctx.message?.caption ?? '');
    });

    // ── Images sent as files (document) ───────────────────────────────────────
    this.bot.on('message:document', async (ctx: Context) => {
      const doc = ctx.message?.document;
      const mime = doc?.mime_type ?? '';
      if (!doc || !mime.startsWith('image/')) return;

      console.log(`\n📱 Telegram [${ctx.from?.first_name}]: 🖼️ document ${doc.file_name ?? ''}`);
      if ((doc.file_size ?? 0) > MAX_IMAGE_BYTES) {
        await ctx.reply(`Image trop lourde (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} Mo).`);
        return;
      }
      const attachment = await this.downloadAttachment(doc.file_id, mime, doc.file_name);
      if (!attachment) {
        await ctx.reply("Impossible de lire cette image (format non supporté : JPEG, PNG, GIF ou WebP).");
        return;
      }
      await this.handleIncomingImage(ctx, attachment, ctx.message?.caption ?? '');
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

  // ─── Images ──────────────────────────────────────────────────────────────────

  /** Download a Telegram file and turn it into a normalized attachment. */
  private async downloadAttachment(
    fileId: string,
    mediaType: string,
    name?: string
  ): Promise<ChatAttachment | null> {
    try {
      const file = await this.bot.api.getFile(fileId);
      if (!file.file_path) return null;
      if ((file.file_size ?? 0) > MAX_IMAGE_BYTES) return null;

      const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      return normalizeAttachment({
        type: 'image',
        mediaType,
        data: buffer.toString('base64'),
        name: name ?? file.file_path.split('/').pop(),
      });
    } catch (err) {
      console.error('Telegram image download failed:', err);
      return null;
    }
  }

  /**
   * Route an image to the agent. Photos belonging to the same album
   * (media_group_id) are buffered for a moment and sent together.
   */
  private async handleIncomingImage(ctx: Context, attachment: ChatAttachment, caption: string) {
    const groupId = ctx.message?.media_group_id;

    if (!groupId) {
      await this.routeToAgent(ctx, caption, [attachment]);
      return;
    }

    const existing = this.mediaGroups.get(groupId);
    if (existing) {
      clearTimeout(existing.timer);
      if (existing.attachments.length < MAX_ATTACHMENTS_PER_MESSAGE) {
        existing.attachments.push(attachment);
      }
      if (!existing.caption && caption) existing.caption = caption;
      existing.timer = setTimeout(() => this.flushMediaGroup(ctx, groupId), 1500);
      return;
    }

    this.mediaGroups.set(groupId, {
      attachments: [attachment],
      caption,
      timer: setTimeout(() => this.flushMediaGroup(ctx, groupId), 1500),
    });
  }

  private async flushMediaGroup(ctx: Context, groupId: string) {
    const group = this.mediaGroups.get(groupId);
    if (!group) return;
    this.mediaGroups.delete(groupId);
    await this.routeToAgent(ctx, group.caption, group.attachments);
  }

  // ─── Route to agent ──────────────────────────────────────────────────────────

  private async routeToAgent(ctx: Context, message: string, attachments: ChatAttachment[] = []) {
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

      const thinkingMsg = await ctx.reply(
        attachments.length > 0 ? '_Analyse de l\'image en cours..._' : '_Traitement en cours..._',
        { parse_mode: 'Markdown' }
      );

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

      // Images arrive with no caption more often than not — give the agent a
      // clear instruction so it actually analyses what it was sent.
      const userMessage =
        message.trim() ||
        (attachments.length > 0
          ? "Analyse cette image et dis-moi ce qui est pertinent pour la boutique."
          : message);

      await saveChatMessage({
        storeId,
        agentId: agent.config.id,
        sender: 'user',
        content: userMessage,
        metadata: {
          channel: 'telegram',
          chatId,
          ...(attachments.length > 0
            ? {
                attachments: attachments.map((a) => ({
                  type: 'image',
                  mediaType: a.mediaType,
                  name: a.name,
                  url: toDataUrl(a),
                })),
              }
            : {}),
        },
      });

      // Shared conversationId with the web app — same memory across channels
      const conversationId = `user-${storeId}`;
      const response = await agent.chat(userMessage, context, conversationId, attachments);

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

  // ─── Approval handling ───────────────────────────────────────────────────────

  /**
   * Flip a pending ApprovalRequest to approved/rejected.
   * The approval executor (approval-flow.ts) picks up approved rows within ~5s
   * and runs the stored tool call automatically.
   * Returns false if the request was already decided or expired.
   */
  private async decideApproval(approvalId: string, approve: boolean): Promise<boolean> {
    const updated = await prisma.approvalRequest.updateMany({
      where: { id: approvalId, status: 'pending' },
      data: {
        status: approve ? 'approved' : 'rejected',
        decidedBy: 'telegram',
        decidedAt: new Date(),
      },
    });
    return updated.count === 1;
  }

  /**
   * Send an approval request to the store's linked chat with
   * Approuver / Refuser inline buttons.
   */
  async sendApprovalRequest(storeId: string, approvalId: string, text: string): Promise<void> {
    const chatId = await getChatIdForStore(storeId);
    if (!chatId) return;

    const keyboard = new InlineKeyboard()
      .text('✅ Approuver', `approval:approve:${approvalId}`)
      .text('🚫 Refuser', `approval:reject:${approvalId}`);

    await this.bot.api
      .sendMessage(Number(chatId), text, { parse_mode: 'Markdown', reply_markup: keyboard })
      .catch(async () => {
        // Markdown parse can fail on special chars — retry as plain text
        await this.bot.api.sendMessage(Number(chatId), text.replace(/[*_`\\]/g, ''), {
          reply_markup: keyboard,
        });
      });
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

      // Load today's strategic plan from AutoDream if available
      let planContext = '';
      try {
        const { MemoryEngine } = await import('../lib/memory-engine.js');
        const engine = new MemoryEngine(storeId);
        const today = new Date().toISOString().split('T')[0];
        const plan = await engine.loadTopicFile(`plan_du_jour/${today}`).catch(() => null);
        if (plan) {
          planContext = `\n\nPLAN STRATÉGIQUE DU JOUR (généré cette nuit):\n${plan.slice(0, 2000)}`;
        }
      } catch { /* non-blocking */ }

      // Inject active objectives directly so the briefing doesn't depend on
      // the agent choosing to call read_objectives
      let objectivesContext = '';
      try {
        const res = await readObjectivesTool.execute({ status: 'active' }, context as any);
        const summary = (res.data as any)?.summary;
        if (res.success && summary) {
          objectivesContext = `\n\nOBJECTIFS ACTIFS:\n${summary}`;
        }
      } catch { /* non-blocking */ }

      // Inject yesterday's concrete numbers from Shopify
      let salesContext = '';
      try {
        const client = new ShopifyClient(store.shopifyDomain, accessToken);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const { orders } = await client.getOrders({ limit: 50 });
        const recent = orders.filter(
          (o: any) => o.created_at && new Date(o.created_at) >= since
        );
        const revenue = recent.reduce(
          (sum: number, o: any) => sum + parseFloat(o.total_price ?? '0'),
          0
        );
        const currency = recent[0]?.currency ?? '';
        salesContext =
          `\n\nCHIFFRES DES DERNIÈRES 24H (source Shopify):\n` +
          `- Commandes: ${recent.length}\n` +
          `- Chiffre d'affaires: ${revenue.toFixed(2)} ${currency}`.trim();
      } catch { /* non-blocking */ }

      const briefingPrompt =
        'C\'est le matin. Génère un briefing de démarrage de journée. ' +
        'Les objectifs actifs, les chiffres de vente et le plan du jour sont fournis ci-dessous — ' +
        'ne les recharge pas via des outils, utilise-les directement. Synthétise : ' +
        '1) Bilan de la nuit et chiffres des dernières 24h, ' +
        '2) Plan stratégique du jour (tâches prioritaires par département), ' +
        '3) Points d\'attention et alertes, ' +
        '4) Une recommandation proactive. ' +
        'Sois concis, structuré, et orienté action.' +
        objectivesContext +
        salesContext +
        planContext;

      const response = await agent.chat(briefingPrompt, context, `user-${storeId}`);

      const chunks = this.splitMessage(`☀️ *Briefing du matin*\n\n${response}`, 4000);
      for (const chunk of chunks) {
        await this.bot.api.sendMessage(Number(chatId), chunk, { parse_mode: 'Markdown' }).catch(async () => {
          await this.bot.api.sendMessage(Number(chatId), chunk);
        });
      }
    } catch (err) {
      console.error('Morning briefing error:', err);
      await this.bot.api
        .sendMessage(
          Number(chatId),
          '☀️ Briefing du matin indisponible ce matin — utilisez /briefing pour réessayer.'
        )
        .catch(() => {});
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
      { command: 'dream',    description: 'AutoDream — /dream on | off | (déclencher)' },
      { command: 'help',     description: 'Afficher l\'aide' },
    ]);

    // bot.start() long-polls forever; its promise rejects on polling failures.
    // Never let that take down the gateway — notably the 409 Conflict thrown
    // when two gateway instances (e.g. local dev + deployed) poll with the
    // same bot token: Telegram alerts stop, everything else keeps running.
    this.bot.start().catch((err: any) => {
      const desc = err?.description || err?.message || String(err);
      if (err?.error_code === 409) {
        console.error(
          '⚠️ Telegram désactivé : une autre instance du gateway utilise déjà ce bot token (409 Conflict). ' +
          'Arrêtez l\'autre instance (local vs déployé) ou utilisez des tokens différents.'
        );
      } else {
        console.error(`⚠️ Telegram polling arrêté (le gateway continue) : ${desc}`);
      }
    });
  }

  async stop() {
    await this.bot.stop();
  }
}
