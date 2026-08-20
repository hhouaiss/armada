import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/shopify';
import { CURATED_CONNECTORS, ensureCuratedConnectors } from '@/lib/connector-catalog';
import { encryptedConnectionConfig, validateCustomMcpUrl } from '@/lib/connector-security';
import { syncConnectorGateway } from '@/lib/connector-gateway';
import crypto from 'node:crypto';

async function ownedStore(userId: string, storeId: string) {
  return prisma.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!storeId || !(await ownedStore(user.id, storeId))) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  const connections = await prisma.appConnection.findMany({
    where: { storeId, userId: user.id },
    include: {
      connector: { select: { id: true, slug: true, name: true, description: true, publisher: true, category: true, logo: true, transport: true, authMode: true, verificationTier: true, scopes: true, toolMetadata: true, isBeta: true } },
      grants: { include: { agent: { select: { id: true, name: true, type: true } } } },
      policies: true,
    },
    orderBy: [{ connector: { name: 'asc' } }, { label: 'asc' }],
  });
  return NextResponse.json({ connections: connections.map(({ credentials: _credentials, ...connection }) => connection) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const storeId = String(body.storeId || '');
  if (!(await ownedStore(user.id, storeId))) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  await ensureCuratedConnectors(prisma);

  let definition: any;
  if (body.customUrl) {
    const endpoint = await validateCustomMcpUrl(String(body.customUrl));
    const requested = String(body.slug || new URL(endpoint).hostname).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
    const ownerKey = crypto.createHash('sha256').update(user.id).digest('hex').slice(0, 12);
    const slug = `custom-${ownerKey}-${requested}`;
    definition = await prisma.connectorDefinition.upsert({
      where: { slug },
      create: { slug, name: body.name || requested, description: 'Serveur MCP personnalisé', publisher: 'Custom', source: 'custom', transport: 'streamable-http', authMode: body.authHeader ? 'secret' : 'oauth-mcp', verificationTier: 'custom', category: body.category || 'productivity', endpoint, scopes: [], toolMetadata: [], riskOverrides: {} },
      update: { endpoint, name: body.name || requested },
    });
  } else {
    definition = await prisma.connectorDefinition.findUnique({ where: { slug: String(body.connectorSlug || '') } });
  }
  if (!definition) return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  if (definition.authMode !== 'secret' && (!body.customUrl || !body.authHeader)) {
    return NextResponse.json({ error: 'OAuth required', oauthUrl: definition.authMode === 'oauth-google' ? `/api/auth/google?slug=${definition.slug}&storeId=${storeId}&label=${encodeURIComponent(body.label || definition.name)}` : `/api/mcp/oauth/start?slug=${definition.slug}&storeId=${storeId}&label=${encodeURIComponent(body.label || definition.name)}` }, { status: 409 });
  }

  const curated = CURATED_CONNECTORS.find((item) => item.slug === definition.slug);
  const config = body.customUrl
    ? { headers: body.authHeader ? { Authorization: body.authHeader } : {} }
    : encryptedConnectionConfig(body.credentials || {}, curated?.secretFields || []);
  const connection = await prisma.appConnection.create({
    data: {
      userId: user.id, storeId, connectorDefinitionId: definition.id,
      label: String(body.label || definition.name).trim().slice(0, 80), accountEmail: body.accountEmail || null,
      credentials: { encrypted: encryptToken(JSON.stringify(config)) }, grantedScopes: [], status: 'active',
    },
  });
  await prisma.connectorAuditEvent.create({ data: { storeId, connectionId: connection.id, eventType: 'connection_created', status: 'completed', summary: { connector: definition.slug } } });
  const gateway = await syncConnectorGateway().catch(() => null);
  return NextResponse.json({ connection: { ...connection, credentials: undefined }, gateway }, { status: 201 });
}
