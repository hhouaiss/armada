import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Migrating agents to proactive templates...\n');

  const agents = await prisma.agent.findMany({
    where: {
      templateId: {
        in: ['shopify-product', 'shopify-inventory', 'shopify-support'],
      },
    },
  });

  console.log(`Found ${agents.length} agents to update\n`);

  for (const agent of agents) {
    if (!agent.templateId) continue;

    const template = await prisma.agentTemplate.findUnique({
      where: { templateId: agent.templateId },
    });

    if (!template) {
      console.log(`⚠️  Template not found for agent ${agent.id} (${agent.name})`);
      continue;
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        systemPrompt: template.systemPrompt,
        personality: template.personality,
        customRules: template.defaultRules,
        capabilities: template.capabilities,
      },
    });

    console.log(`✓ Updated ${agent.name} (${agent.type}) with proactive template`);
  }

  console.log('\n✅ All agents updated successfully!\n');
}

main()
  .catch((error) => {
    console.error('❌ Error migrating agents:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
