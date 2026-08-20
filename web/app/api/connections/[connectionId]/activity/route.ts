import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await params;
  const connection = await prisma.appConnection.findFirst({ where: { id: connectionId, userId: user.id, store: { userId: user.id } } });
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  const events = await prisma.connectorAuditEvent.findMany({ where: { connectionId }, orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ events });
}
