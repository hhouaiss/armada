import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncConnectorGateway } from '@/lib/connector-gateway';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await params;
  const body = await request.json();
  const connection = await prisma.appConnection.findFirst({ where: { id: connectionId, userId: user.id, store: { userId: user.id } } });
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  const agentIds: string[] = Array.isArray(body.agentIds) ? [...new Set<string>(body.agentIds.map(String))] : [];
  const validAgents = await prisma.agent.findMany({ where: { id: { in: agentIds }, storeId: connection.storeId }, select: { id: true } });
  if (validAgents.length !== agentIds.length) return NextResponse.json({ error: 'Invalid agent assignment' }, { status: 400 });
  await prisma.$transaction([
    prisma.agentConnectionGrant.deleteMany({ where: { connectionId } }),
    ...validAgents.map((agent) => prisma.agentConnectionGrant.create({ data: { connectionId, agentId: agent.id } })),
    prisma.connectorAuditEvent.create({ data: { storeId: connection.storeId, connectionId, eventType: 'agent_assignments_changed', status: 'completed', summary: { agentIds } } }),
  ]);
  await syncConnectorGateway().catch(() => null);
  return NextResponse.json({ ok: true, agentIds });
}
