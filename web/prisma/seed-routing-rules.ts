import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding routing rules...\n');

  // Get all active stores with their agents
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    include: {
      agents: {
        where: { isActive: true },
      },
    },
  });

  for (const store of stores) {
    console.log(`→ Creating rules for store: ${store.storeName}\n`);

    // Find agents by type
    const productAgent = store.agents.find((a) => a.type === 'product');
    const inventoryAgent = store.agents.find((a) => a.type === 'inventory');
    const supportAgent = store.agents.find((a) => a.type === 'support');

    const rules = [];

    // Priority 100: Product-specific keywords → Product Agent
    if (productAgent) {
      rules.push({
        storeId: store.id,
        agentId: productAgent.id,
        priority: 100,
        keywords: ['product', 'products', 'catalog', 'listing', 'seo', 'description', 'collection'],
        description: 'Route product-related queries to Product Agent',
        isActive: true,
      });
    }

    // Priority 90: Inventory-specific keywords → Inventory Agent
    if (inventoryAgent) {
      rules.push({
        storeId: store.id,
        agentId: inventoryAgent.id,
        priority: 90,
        keywords: ['inventory', 'stock', 'warehouse', 'quantity', 'low stock', 'restock', 'out of stock'],
        description: 'Route inventory-related queries to Inventory Agent',
        isActive: true,
      });
    }

    // Priority 80: Customer/Support keywords → Support Agent
    if (supportAgent) {
      rules.push({
        storeId: store.id,
        agentId: supportAgent.id,
        priority: 80,
        keywords: ['customer', 'support', 'refund', 'return', 'order', 'complaint', 'help', 'issue'],
        description: 'Route customer support queries to Support Agent',
        isActive: true,
      });
    }

    // Priority 50: Telegram channel → Product Agent (default for Telegram)
    if (productAgent) {
      rules.push({
        storeId: store.id,
        agentId: productAgent.id,
        priority: 50,
        channel: 'telegram',
        description: 'Default Telegram routing to Product Agent',
        isActive: true,
      });
    }

    // Priority 10: WebSocket fallback → Product Agent
    if (productAgent) {
      rules.push({
        storeId: store.id,
        agentId: productAgent.id,
        priority: 10,
        channel: 'websocket',
        description: 'Default WebSocket routing to Product Agent',
        isActive: true,
      });
    }

    // Priority 0: Global fallback → Product Agent (or first available)
    const fallbackAgent = productAgent || store.agents[0];
    if (fallbackAgent) {
      rules.push({
        storeId: store.id,
        agentId: fallbackAgent.id,
        priority: 0,
        description: 'Global fallback route',
        isActive: true,
      });
    }

    // Create all rules
    for (const rule of rules) {
      await prisma.routingRule.create({
        data: rule,
      });
      console.log(`  ✓ Priority ${rule.priority}: ${rule.description}`);
    }

    console.log(`\n✅ Created ${rules.length} routing rules for ${store.storeName}\n`);
  }

  console.log('✅ Routing rules seeding complete!\n');
}

main()
  .catch((error) => {
    console.error('❌ Error seeding routing rules:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
