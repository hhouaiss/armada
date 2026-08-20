import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncConnectorGateway } from '@/lib/connector-gateway';

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await params;
  const connection = await prisma.appConnection.findFirst({ where: { id: connectionId, userId: user.id, store: { userId: user.id } } });
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  try {
    const result: any = await syncConnectorGateway();
    const status = (result.servers || []).find((server: any) => server.connectionId === connectionId);
    if (!status || status.status !== 'connected') return NextResponse.json({ ok: false, status: status || null }, { status: 502 });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
