import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  // 1. Remove "seo" from Sarah's keywords — that's Olivia's domain
  const sarahRule = await prisma.routingRule.findFirst({
    where: { description: 'Route product-related queries to Product Agent' }
  });
  if (sarahRule) {
    const keywords = (sarahRule.keywords as string[]).filter(k => k !== 'seo');
    await prisma.routingRule.update({
      where: { id: sarahRule.id },
      data: { keywords }
    });
    console.log('✓ Removed "seo" from Sarah\'s keywords:', keywords);
  }

  // 2. Increase Olivia's routing priority to 120 (higher than any other rule)
  const oliviaRule = await prisma.routingRule.findFirst({
    where: { description: 'Route SEO-related messages to Olivia' }
  });
  if (oliviaRule) {
    await prisma.routingRule.update({
      where: { id: oliviaRule.id },
      data: { priority: 120 }
    });
    console.log('✓ Updated Olivia\'s routing priority to 120');
  } else {
    // Create Olivia's routing rule if it doesn't exist
    const store = await prisma.store.findFirst({ where: { isActive: true } });
    const olivia = await prisma.agent.findFirst({ where: { type: 'seo', isActive: true } });
    if (store && olivia) {
      await prisma.routingRule.create({
        data: {
          storeId: store.id,
          agentId: olivia.id,
          priority: 120,
          keywords: ['olivia', 'seo', 'search', 'ranking', 'keywords', 'google', 'optimization', 'serp'],
          description: 'Route SEO-related messages to Olivia',
          isActive: true,
        }
      });
      console.log('✓ Created Olivia\'s routing rule with priority 120');
    }
  }

  // 3. Also add Olivia's name trigger to the Telegram default fallback —
  //    update the Telegram default to NOT match when "olivia" is mentioned
  //    (Olivia's high-priority rule will catch it first anyway)
  console.log('\n✓ Routing fix complete! Final priority order:');
  const rules = await prisma.routingRule.findMany({
    include: { agent: { select: { name: true, type: true } } },
    orderBy: { priority: 'desc' }
  });
  rules.forEach(r => {
    console.log(`  [${r.priority}] ${r.agent?.name} (${r.description})`);
  });

  await prisma.$disconnect();
}

main();
