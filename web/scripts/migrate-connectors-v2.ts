import { Prisma, PrismaClient } from '@prisma/client';
import { ensureCuratedConnectors } from '../lib/connector-catalog';

const prisma = new PrismaClient();

async function main() {
  await ensureCuratedConnectors(prisma);
  const integrations = await prisma.integration.findMany({
    where: { isActive: true, platform: { notIn: ['telegram'] } },
    include: { user: { include: { stores: { where: { isActive: true }, select: { id: true } } } } },
  });
  let imported = 0;
  for (const integration of integrations) {
    const sourceSlug = integration.platform.startsWith('mcp:') ? integration.platform.slice(4) : integration.platform;
    let definition = await prisma.connectorDefinition.findUnique({ where: { slug: sourceSlug } });
    if (!definition) {
      definition = await prisma.connectorDefinition.upsert({
        where: { slug: `legacy-${sourceSlug}` },
        create: {
          slug: `legacy-${sourceSlug}`, name: sourceSlug, description: 'Connexion héritée à reconfigurer via MCP v2.',
          publisher: 'Legacy', source: 'armada', transport: 'streamable-http', authMode: 'secret',
          verificationTier: 'community', category: 'productivity', scopes: [], toolMetadata: [], riskOverrides: {}, isActive: false,
        },
        update: {},
      });
    }
    for (const store of integration.user.stores) {
      const label = `Migration ${definition.name}`.slice(0, 80);
      await prisma.appConnection.upsert({
        where: { storeId_connectorDefinitionId_label: { storeId: store.id, connectorDefinitionId: definition.id, label } },
        create: {
          userId: integration.userId, storeId: store.id, connectorDefinitionId: definition.id,
          label, credentials: (integration.credentials ?? {}) as Prisma.InputJsonValue,
          status: 'review_required', grantedScopes: [], discoveredTools: [],
        },
        update: {},
      });
      imported++;
    }
  }
  console.log(`Connector v2 shadow import complete: ${imported} store-scoped connection(s), all review_required.`);
}

main().finally(() => prisma.$disconnect());
