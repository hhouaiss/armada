import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default platform config
  const platformConfig = await prisma.platformConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'StoreTeam',
      tagline: 'AI-Powered Agent Command Center',
      primaryColor: '#FF8C42',
      features: {
        enableChat: true,
        enableContent: false,
        enableTelegram: false,
        enableWhatsApp: false,
        enableInventory: true,
        enableCustomers: true,
      },
      agentTypes: ['product', 'inventory', 'support', 'marketing'],
      toolCategories: ['products', 'orders', 'inventory', 'customers', 'analytics', 'content'],
    },
  });

  console.log('✓ Created platform config:', platformConfig.name);

  // Create default user (temporary, until auth is added)
  const defaultUser = await prisma.user.upsert({
    where: { email: 'demo@storeteam.ai' },
    update: {},
    create: {
      email: 'demo@storeteam.ai',
      name: 'Demo User',
    },
  });

  console.log('✓ Created default user:', defaultUser.email);

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
