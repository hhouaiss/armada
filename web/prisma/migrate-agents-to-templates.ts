import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
config({ path: '.env.local' });

const prisma = new PrismaClient();

const agentTypeToTemplate: Record<string, string> = {
  product: 'shopify-product',
  inventory: 'shopify-inventory',
  support: 'shopify-support',
};

async function main() {
  console.log('🔄 Migrating agents to use templates...\n');

  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
    },
  });

  console.log(`Found ${agents.length} active agents\n`);

  for (const agent of agents) {
    const templateId = agentTypeToTemplate[agent.type];

    if (!templateId) {
      console.log(`⚠️  No template for agent type: ${agent.type} - skipping`);
      continue;
    }

    // Load template
    const template = await prisma.agentTemplate.findUnique({
      where: { templateId },
    });

    if (!template) {
      console.log(`❌ Template not found: ${templateId} - skipping`);
      continue;
    }

    // Update agent with template data
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        templateId: template.templateId,
        systemPrompt: template.systemPrompt,
        capabilities: template.capabilities,
        customRules: template.defaultRules,
      },
    });

    console.log(`✓ Updated ${agent.name} (${agent.type}) → ${template.name}`);
  }

  console.log('\n✅ Agent migration completed!\n');
}

main()
  .catch((error) => {
    console.error('❌ Error migrating agents:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
