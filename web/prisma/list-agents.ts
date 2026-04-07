import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, type: true, isActive: true }
  });
  console.log(JSON.stringify(agents, null, 2));
  await prisma.$disconnect();
}

main();
