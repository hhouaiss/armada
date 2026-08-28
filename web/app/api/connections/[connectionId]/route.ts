import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncConnectorGateway } from '@/lib/connector-gateway';
import { encryptToken } from '@/lib/shopify';
import { CURATED_CONNECTORS } from '@/lib/connector-catalog';
import { encryptedConnectionConfig } from '@/lib/connector-security';

async function owned(userId: string, id: string) {
  return prisma.appConnection.findFirst({ where: { id, userId, store: { userId } }, include: { connector: true } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await params;
  const connection = await owned(user.id, connectionId);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  const body = await request.json();
  const data: any = {};
  // Reconnect for secret-based connectors: replace the stored secret in place,
  // keeping agent grants, tool policies and history.
  if (body.credentials && typeof body.credentials === 'object') {
    if (connection.connector.authMode !== 'secret') {
      return NextResponse.json({ error: 'This connector reconnects through OAuth' }, { status: 400 });
    }
    const curated = CURATED_CONNECTORS.find((item) => item.slug === connection.connector.slug);
    const config = encryptedConnectionConfig(body.credentials, curated?.secretFields || []);
    data.credentials = { encrypted: encryptToken(JSON.stringify(config)) };
    data.status = 'active';
    data.lastError = null;
    data.lastConnectedAt = new Date();
  }
  if (typeof body.label === 'string' && body.label.trim()) data.label = body.label.trim().slice(0, 80);
  if (['active', 'disabled'].includes(body.status)) data.status = body.status;
  if (typeof body.isDefault === 'boolean') data.isDefault = body.isDefault;
  if (body.isDefault) await prisma.appConnection.updateMany({ where: { storeId: connection.storeId, connectorDefinitionId: connection.connectorDefinitionId, id: { not: connection.id } }, data: { isDefault: false } });
  const updated = await prisma.appConnection.update({ where: { id: connection.id }, data });
  await prisma.connectorAuditEvent.create({ data: { storeId: connection.storeId, connectionId, eventType: data.credentials ? 'connection_reconnected' : 'connection_updated', status: 'completed', summary: { fields: Object.keys(data).filter((field) => field !== 'credentials') } } });
  await syncConnectorGateway().catch(() => null);
  return NextResponse.json({ connection: { ...updated, credentials: undefined } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await params;
  const connection = await owned(user.id, connectionId);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  await prisma.appConnection.delete({ where: { id: connectionId } });
  await syncConnectorGateway().catch(() => null);
  return NextResponse.json({ ok: true });
}
