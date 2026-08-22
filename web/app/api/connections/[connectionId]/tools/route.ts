import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncConnectorGateway } from '@/lib/connector-gateway';

/**
 * Enable or disable individual tools of a connection, for every agent at once.
 * Disabled tools stay discoverable in the dashboard but are filtered out by the
 * connector runner, so they never enter an agent's tool registry.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await params;
  const body = await request.json();

  const connection = await prisma.appConnection.findFirst({
    where: { id: connectionId, userId: user.id, store: { userId: user.id } },
  });
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  if (!Array.isArray(body.disabledTools)) {
    return NextResponse.json({ error: 'disabledTools must be an array' }, { status: 400 });
  }
  const disabledTools: string[] = [...new Set<string>(body.disabledTools.map((name: unknown) => String(name)))];

  const availableTools = new Set(Array.isArray(connection.discoveredTools)
    ? (connection.discoveredTools as any[]).map((tool) => String(tool.name))
    : []);
  const unknown = disabledTools.filter((name) => !availableTools.has(name));
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown tools: ${unknown.slice(0, 5).join(', ')}` }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.appConnection.update({ where: { id: connectionId }, data: { disabledTools } }),
    prisma.connectorAuditEvent.create({
      data: {
        storeId: connection.storeId,
        connectionId,
        eventType: 'connection_tools_changed',
        status: 'completed',
        summary: { disabledCount: disabledTools.length, enabledCount: availableTools.size - disabledTools.length },
      },
    }),
  ]);
  await syncConnectorGateway().catch(() => null);
  return NextResponse.json({ ok: true, disabledTools });
}
