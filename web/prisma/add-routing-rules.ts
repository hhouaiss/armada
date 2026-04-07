import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

// Define routing rules for each agent type
const agentRoutingRules = [
  {
    type: 'product',
    name: 'Sarah',
    keywords: ['sarah', 'product', 'products', 'catalog', 'inventory management', 'stock'],
    description: 'Route product-related messages to Sarah',
    priority: 10,
  },
  {
    type: 'inventory',
    name: 'Marcus',
    keywords: ['marcus', 'inventory', 'stock', 'low stock', 'restock', 'quantities'],
    description: 'Route inventory-related messages to Marcus',
    priority: 10,
  },
  {
    type: 'support',
    name: 'Emma',
    keywords: ['emma', 'customer', 'customers', 'support', 'help', 'contact'],
    description: 'Route customer support messages to Emma',
    priority: 10,
  },
  {
    type: 'content',
    name: 'Alex',
    keywords: ['alex', 'content', 'blog', 'article', 'write', 'writing'],
    description: 'Route content-related messages to Alex',
    priority: 10,
  },
  {
    type: 'seo',
    name: 'Olivia',
    keywords: ['olivia', 'seo', 'search', 'ranking', 'keywords', 'google', 'optimization'],
    description: 'Route SEO-related messages to Olivia',
    priority: 10,
  },
];

async function addRoutingRules() {
  try {
    // Get all active stores
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      include: { agents: { where: { isActive: true } } },
    });

    console.log(`Found ${stores.length} active store(s)`);

    for (const store of stores) {
      console.log(`\n→ Setting up routing rules for: ${store.storeName}`);

      for (const ruleTemplate of agentRoutingRules) {
        // Find the agent of this type
        const agent = store.agents.find(a => a.type === ruleTemplate.type);

        if (!agent) {
          console.log(`  ⚠️  No ${ruleTemplate.type} agent found, skipping`);
          continue;
        }

        // Check if rule already exists
        const existing = await prisma.routingRule.findFirst({
          where: {
            storeId: store.id,
            agentId: agent.id,
          },
        });

        if (existing) {
          console.log(`  ✓ Routing rule for ${ruleTemplate.name} already exists`);
          continue;
        }

        // Create routing rule
        await prisma.routingRule.create({
          data: {
            storeId: store.id,
            agentId: agent.id,
            priority: ruleTemplate.priority,
            keywords: ruleTemplate.keywords,
            description: ruleTemplate.description,
            isActive: true,
          },
        });

        console.log(`  ✅ Created routing rule for ${ruleTemplate.name} (${ruleTemplate.keywords.join(', ')})`);
      }
    }

    console.log('\n✓ Routing rules setup complete!');
    console.log('\nNow you can:');
    console.log('• Message "Ask Olivia about SEO" in Telegram');
    console.log('• Type "Talk to Marcus about inventory" in the web chat');
    console.log('• Mention any agent by name to route to them');

  } catch (error) {
    console.error('Error adding routing rules:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addRoutingRules();
