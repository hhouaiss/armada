import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const rules = await prisma.routingRule.findMany({
    include: { agent: { select: { name: true, type: true } } }
  });
  console.log(JSON.stringify(rules, null, 2));
  await prisma.$disconnect();
}

main();
