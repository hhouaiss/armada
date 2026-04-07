import { config } from 'dotenv';
import { Gateway } from './core/gateway.js';
import { Router } from './core/router.js';
import { SessionManager } from './core/session-manager.js';
import { ToolRegistry } from './core/tool-registry.js';
import { TelegramIntegration } from './integrations/telegram.js';
import { startGeminiLiveBridge } from './core/gemini-live-bridge.js';
import { registerStoreAgents } from './lib/store-loader.js';
import { prisma, cleanupOldSessions } from './lib/database.js';

// Import tools
import {
  getProductTool,
  listProductsTool,
  createProductTool,
  updateProductTool,
} from './tools/shopify/products.js';
import {
  getInventoryTool,
  updateInventoryTool,
  getLowStockTool,
} from './tools/shopify/inventory.js';
import {
  getCustomerTool,
  listCustomersTool,
  updateCustomerTagsTool,
} from './tools/shopify/customers.js';
import {
  getOrderTool,
  listOrdersTool,
} from './tools/shopify/orders.js';
import {
  getCollectionTool,
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
import { callKlaviyoApiTool } from './tools/klaviyo.js';
import { dispatchToSpecialistTool } from './tools/dispatch-agent.js';
import { manageAgentsTool } from './tools/manage-agents.js';

// Load environment variables
config();

const PORT = parseInt(process.env.PORT || '18790');

async function bootstrap() {
  console.log('🚀 Starting Store Team Gateway...\n');

  // Initialize core systems
  const toolRegistry = new ToolRegistry();
  const sessionManager = new SessionManager();
  const router = new Router();

  // Register product tools
  console.log('📦 Registering Shopify tools...');
  toolRegistry.register(getProductTool);
  toolRegistry.register(listProductsTool);
  toolRegistry.register(createProductTool);
  toolRegistry.register(updateProductTool);

  // Register inventory tools
  toolRegistry.register(getInventoryTool);
  toolRegistry.register(updateInventoryTool);
  toolRegistry.register(getLowStockTool);

  // Register customer tools
  toolRegistry.register(getCustomerTool);
  toolRegistry.register(listCustomersTool);
  toolRegistry.register(updateCustomerTagsTool);

  // Register order tools (read-only)
  toolRegistry.register(getOrderTool);
  toolRegistry.register(listOrdersTool);

  // Register collection SEO tools
  toolRegistry.register(getCollectionTool);
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

  // Register orchestration tools (used by The Major)
  toolRegistry.register(dispatchToSpecialistTool);
  toolRegistry.register(manageAgentsTool);

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
    console.log('✓ Telegram bot connected\n');
  } else {
    console.log('⚠️  Telegram integration not configured (optional)\n');
  }

  // Cleanup sessions periodically
  setInterval(async () => {
    sessionManager.cleanup();

    // Cleanup old conversation sessions (OpenClaw pattern)
    const deletedCount = await cleanupOldSessions(7); // Delete sessions older than 7 days
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old conversation sessions`);
    }
  }, 300000); // Every 5 minutes

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
