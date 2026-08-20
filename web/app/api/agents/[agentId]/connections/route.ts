import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncConnectorGateway } from '@/lib/connector-gateway';

export async function GET(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, store: { userId: user.id } }, select: { id: true, storeId: true } });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  const connections = await prisma.appConnection.findMany({
    where: { storeId: agent.storeId, userId: user.id, status: { not: 'disabled' } },
    include: { connector: { select: { slug: true, name: true, logo: true, verificationTier: true, isBeta: true } }, grants: { where: { agentId }, select: { id: true } }, policies: { where: { agentId } } },
    orderBy: [{ connector: { name: 'asc' } }, { label: 'asc' }],
  });
  return NextResponse.json({ connections: connections.map(({ credentials: _credentials, grants, ...connection }) => ({ ...connection, granted: grants.length > 0 })) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, store: { userId: user.id } }, select: { id: true, storeId: true } });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  const body = await request.json();
  const connectionId = String(body.connectionId || '');
  const connection = await prisma.appConnection.findFirst({ where: { id: connectionId, storeId: agent.storeId, userId: user.id } });
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  if (body.granted) await prisma.agentConnectionGrant.upsert({ where: { agentId_connectionId: { agentId, connectionId } }, create: { agentId, connectionId }, update: {} });
  else await prisma.agentConnectionGrant.deleteMany({ where: { agentId, connectionId } });
  await prisma.connectorAuditEvent.create({ data: { storeId: agent.storeId, connectionId, agentId, eventType: body.granted ? 'agent_granted' : 'agent_revoked', status: 'completed', summary: {} } });
  await syncConnectorGateway().catch(() => null);
  return NextResponse.json({ ok: true });
}
