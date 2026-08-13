import { config } from 'dotenv';
import { Gateway, setMissionTelegramNotifier } from './core/gateway.js';
import { Router } from './core/router.js';
import { SessionManager } from './core/session-manager.js';
import { ToolRegistry } from './core/tool-registry.js';
import { TelegramIntegration } from './integrations/telegram.js';
import { startGeminiLiveBridge } from './core/gemini-live-bridge.js';
import { registerStoreAgents } from './lib/store-loader.js';
import { prisma, cleanupOldSessions, testConnection } from './lib/database.js';

// Import tools
import {
  getProductTool,
  listProductsTool,
  searchProductsTool,
  createProductTool,
  updateProductTool,
} from './tools/shopify/products.js';
import {
  getProductByHandleTool,
  updateProductMetafieldsTool,
  createRedirectTool,
  storefrontUrlTool,
  getNavigationTool,
} from './tools/shopify/enhanced.js';
import {
  getInventoryTool,
  updateInventoryTool,
  getLowStockTool,
} from './tools/shopify/inventory.js';
import {
  getCustomerTool,
  listCustomersTool,
  searchCustomersTool,
  updateCustomerTagsTool,
} from './tools/shopify/customers.js';
import {
  getOrderTool,
  listOrdersTool,
} from './tools/shopify/orders.js';
import {
  getCollectionTool,
  searchCollectionsTool,
  listCollectionsTool,
  updateCollectionSEOTool,
} from './tools/shopify/collections.js';
import {
  listBlogsTool,
  createBlogTool,
  listArticlesTool,
  createArticleTool,
  updateArticleTool,
} from './tools/shopify/content.js';
import { getStoreInfoTool } from './tools/shopify/store.js';
import { googleSearchConsoleTools } from './tools/google-search-console.js';
import { callKlaviyoApiTool, callKlaviyoApiWriteTool } from './tools/klaviyo.js';
import { dispatchToSpecialistTool } from './tools/dispatch-agent.js';
import { parallelDispatchTool } from './tools/parallel-dispatch.js';
import { manageAgentsTool } from './tools/manage-agents.js';
import { memoryReadTool, memoryWriteTool } from './tools/memory.js';
import { notionTools } from './tools/notion.js';
import { inboxCompleteTool } from './tools/inbox.js';
import { checkDreamSchedule } from './workers/auto-dream.js';
import { checkKairosSchedule, setTelegramNotifier } from './workers/kairos-worker.js';
import { webBrowseTool } from './tools/web-browse.js';
import { readObjectivesTool } from './tools/read-objectives.js';
import { requestApprovalTool, setApprovalTelegramNotifier } from './tools/request-approval.js';
import {
  startApprovalExecutor,
  setApprovalActionNotifier,
  setApprovalResultNotifier,
} from './lib/approval-flow.js';
import { connectMcpServers } from './lib/mcp-bridge.js';

// Load environment variables
config();

const PORT = parseInt(process.env.PORT || '18790');

async function bootstrap() {
  console.log('🚀 Starting Armada Gateway...\n');

  // Verify database connectivity before doing anything else (Railway cold-start safe)
  console.log('🗄️  Testing database connection…');
  await testConnection(5);

  // Initialize core systems
  const toolRegistry = new ToolRegistry();
  const sessionManager = new SessionManager();
  const router = new Router();

  // Register product tools
  console.log('📦 Registering Shopify tools...');
  toolRegistry.register(getProductTool);
  toolRegistry.register(listProductsTool);
  toolRegistry.register(searchProductsTool);
  toolRegistry.register(createProductTool);
  toolRegistry.register(updateProductTool);

  // Enhanced Shopify tools (Sprint 2 — web navigation, handles, redirects, metafields)
  toolRegistry.register(getProductByHandleTool);
  toolRegistry.register(updateProductMetafieldsTool);
  toolRegistry.register(createRedirectTool);
  toolRegistry.register(storefrontUrlTool);
  toolRegistry.register(getNavigationTool);

  // Register inventory tools
  toolRegistry.register(getInventoryTool);
  toolRegistry.register(updateInventoryTool);
  toolRegistry.register(getLowStockTool);

  // Register customer tools
  toolRegistry.register(getCustomerTool);
  toolRegistry.register(listCustomersTool);
  toolRegistry.register(searchCustomersTool);
  toolRegistry.register(updateCustomerTagsTool);

  // Register order tools (read-only)
  toolRegistry.register(getOrderTool);
  toolRegistry.register(listOrdersTool);

  // Register collection SEO tools
  toolRegistry.register(getCollectionTool);
  toolRegistry.register(searchCollectionsTool);
  toolRegistry.register(listCollectionsTool);
  toolRegistry.register(updateCollectionSEOTool);

  // Register content/blog tools
  toolRegistry.register(listBlogsTool);
  toolRegistry.register(createBlogTool);
  toolRegistry.register(listArticlesTool);
  toolRegistry.register(createArticleTool);
  toolRegistry.register(updateArticleTool);

  // Register store info tool
  toolRegistry.register(getStoreInfoTool);

  // Register Google Search Console (SEO) tools
  for (const tool of googleSearchConsoleTools) {
    toolRegistry.register(tool);
  }

  // Register Klaviyo (marketing) tool
  toolRegistry.register(callKlaviyoApiTool);
  toolRegistry.register(callKlaviyoApiWriteTool);

  // Register orchestration tools (used by The Major)
  toolRegistry.register(dispatchToSpecialistTool);
  toolRegistry.register(parallelDispatchTool);
  toolRegistry.register(manageAgentsTool);

  // Register memory tools (available to all agents)
  toolRegistry.register(memoryReadTool);
  toolRegistry.register(memoryWriteTool);
  toolRegistry.register(inboxCompleteTool);

  // Register Notion tools
  for (const tool of notionTools) {
    toolRegistry.register(tool);
  }

  // Web browsing (agents can read any URL)
  toolRegistry.register(webBrowseTool);

  // Mission Control — read strategic objectives
  toolRegistry.register(readObjectivesTool);

  // Human-in-the-loop approval gate
  toolRegistry.register(requestApprovalTool);

  // External MCP servers (Integration rows with platform "mcp:<slug>")
  await connectMcpServers(toolRegistry);

  console.log(`\n✓ Registered ${toolRegistry.listAll().length} tools\n`);

  // Load all active stores from database
  console.log('🤖 Loading stores and agents from database...\n');

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    include: {
      agents: {
        where: { isActive: true },
      },
    },
  });

  console.log(`✓ Found ${stores.length} active stores\n`);

  for (const store of stores) {
    await registerStoreAgents(store, toolRegistry, sessionManager, router);
  }

  console.log(`\n✓ Loaded ${router.getAllAgents().length} total agents\n`);

  // Start Gateway WebSocket server
  const gateway = new Gateway(PORT, router, sessionManager, toolRegistry);

  // Start Gemini Live bridge (isolated, port 18795)
  const LIVE_PORT = PORT + 5; // 18795
  startGeminiLiveBridge(LIVE_PORT, router, toolRegistry, sessionManager);

  // Initialize Telegram integration if configured
  let telegram: TelegramIntegration | null = null;
  let botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Try to get bot token from database if not in env
  if (!botToken) {
    try {
      const { getIntegrationCredentials } = await import('./lib/database.js');
      const { decryptToken } = await import('./lib/shopify-client.js');
      const encryptedToken = await getIntegrationCredentials('telegram');
      if (encryptedToken) {
        const decrypted = decryptToken(encryptedToken);
        const credentials = JSON.parse(decrypted);
        botToken = credentials.botToken;
      }
    } catch (error) {
      console.warn('Failed to load Telegram credentials from database:', error);
    }
  }

  if (botToken) {
    console.log('📱 Initializing Telegram integration...');
    telegram = new TelegramIntegration(
      botToken,
      router,
      toolRegistry,
      sessionManager
    );
    await telegram.start();
    // Wire KAIROS → Telegram alerts
    setTelegramNotifier((storeId, text, hasActionButtons) =>
      telegram!.sendAlert(storeId, text, hasActionButtons)
    );

    // Wire approval requests → Telegram notifications
    setApprovalTelegramNotifier((storeId, text, hasButtons) =>
      telegram!.sendAlert(storeId, text, hasButtons)
    );

    // Wire gated-tool approvals → Telegram (Approuver/Refuser buttons + result reports)
    setApprovalActionNotifier((storeId, approvalId, text) =>
      telegram!.sendApprovalRequest(storeId, approvalId, text)
    );
    setApprovalResultNotifier((storeId, text) =>
      telegram!.sendAlert(storeId, text, false)
    );

    // Wire Mission Control task completion → Telegram notifications
    setMissionTelegramNotifier((storeId, text) =>
      telegram!.sendAlert(storeId, text, false)
    );
    console.log('✓ Telegram bot connected\n');
  } else {
    console.log('⚠️  Telegram integration not configured (optional)\n');
  }

  // Approval executor: runs gated tool calls automatically once approved
  // (from Mission Control, Telegram, or chat) — checks every 5s
  startApprovalExecutor({ router, toolRegistry, sessionManager });

  // Cleanup sessions + AutoDream schedule check (every 5 minutes)
  setInterval(async () => {
    sessionManager.cleanup();

    // Cleanup old conversation sessions (OpenClaw pattern)
    const deletedCount = await cleanupOldSessions(7);
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old conversation sessions`);
    }

    // AutoDream: nightly memory consolidation (runs at 03:00 UTC if cooldown elapsed)
    await checkDreamSchedule(stores.map((s) => ({ id: s.id, userId: s.userId })));
  }, 300000); // Every 5 minutes

  // KAIROS: proactive monitoring daemon (checks every 15 minutes per store)
  setInterval(async () => {
    await checkKairosSchedule(stores.map((s) => ({ id: s.id, userId: s.userId })));
  }, 15 * 60 * 1000); // Every 15 minutes

  // Morning briefing: send at BRIEFING_HOUR in BRIEFING_TIMEZONE (check every 5 minutes).
  // Last-sent date is persisted per store in AgentMemory so restarts never
  // duplicate or skip a briefing.
  if (telegram) {
    const briefingTz = process.env.BRIEFING_TIMEZONE || 'Europe/Paris';
    const briefingHour = parseInt(process.env.BRIEFING_HOUR || '9', 10);
    setInterval(async () => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: briefingTz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
      }).formatToParts(new Date());
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      const hour = parseInt(get('hour'), 10) % 24;
      const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
      if (hour !== briefingHour) return;

      const activeStores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const store of activeStores) {
        const where = {
          storeId_type_key: { storeId: store.id, type: 'meta', key: 'briefing_last_sent' },
        };
        const last = await prisma.agentMemory.findUnique({ where }).catch(() => null);
        if (last?.content === dateKey) continue;

        // Mark as sent before sending so a mid-send crash can't cause a duplicate
        await prisma.agentMemory.upsert({
          where,
          create: { storeId: store.id, type: 'meta', key: 'briefing_last_sent', content: dateKey },
          update: { content: dateKey },
        });
        console.log(`☀️  Morning briefing time (${briefingTz}) — sending to store ${store.id}`);
        await telegram!.sendMorningBriefing(store.id).catch((err: any) =>
          console.error(`Morning briefing error for store ${store.id}:`, err)
        );
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Shutting down Gateway...');
    if (telegram) {
      await telegram.stop();
    }
    gateway.close();
    process.exit(0);
  });

  console.log('✨ Gateway is ready to handle operations!\n');
  console.log('Available tools:');
  toolRegistry.listAll().forEach(tool => {
    console.log(`  - ${tool.name} (${tool.category})`);
  });
  console.log('\n');
}

bootstrap().catch((error) => {
  console.error('Failed to start Gateway:', error);
  process.exit(1);
});
