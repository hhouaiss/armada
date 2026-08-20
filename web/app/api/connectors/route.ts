import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CURATED_CONNECTORS, ensureCuratedConnectors } from '@/lib/connector-catalog';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureCuratedConnectors(prisma);
  const query = request.nextUrl.searchParams.get('q')?.toLowerCase().trim() || '';
  const storeId = request.nextUrl.searchParams.get('storeId');
  if (storeId && !(await prisma.store.findFirst({ where: { id: storeId, userId: user.id }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }
  const counts = storeId ? await prisma.appConnection.groupBy({
    by: ['connectorDefinitionId'], where: { storeId, userId: user.id }, _count: { _all: true },
  }) : [];
  const definitions = await prisma.connectorDefinition.findMany({
    where: {
      isActive: true,
      source: { not: 'custom' },
      ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { publisher: { contains: query, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ verificationTier: 'asc' }, { name: 'asc' }],
  });
  const curated = new Map(CURATED_CONNECTORS.map((item) => [item.slug, item]));
  const countMap = new Map(counts.map((item) => [item.connectorDefinitionId, item._count._all]));
  return NextResponse.json({ connectors: definitions.map((definition) => ({
    ...definition,
    packageConfig: undefined,
    capabilities: curated.get(definition.slug)?.capabilities || [],
    secretFields: curated.get(definition.slug)?.secretFields || [],
    docsUrl: curated.get(definition.slug)?.docsUrl,
    connectionCount: countMap.get(definition.id) || 0,
  })) });
}
