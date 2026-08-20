import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const GATEWAY_HTTP_URL = process.env.GATEWAY_HTTP_URL || 'http://localhost:18790';
const authHeaders = () => process.env.CONNECTOR_RUNNER_TOKEN
  ? { Authorization: `Bearer ${process.env.CONNECTOR_RUNNER_TOKEN}` }
  : undefined;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const stores = await prisma.store.findMany({ where: { userId: user.id }, select: { id: true } });
    const storeIds = new Set(stores.map((store) => store.id));
    const response = await fetch(`${GATEWAY_HTTP_URL}/api/mcp/sync`, { method: 'POST', headers: authHeaders() });
    const data: any = await response.json();
    return NextResponse.json({ ...data, servers: (data.servers || []).filter((server: any) => storeIds.has(server.storeId)) }, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Gateway injoignable — vérifiez le gateway et le connector runner.', servers: [] }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const stores = await prisma.store.findMany({ where: { userId: user.id }, select: { id: true } });
    const storeIds = new Set(stores.map((store) => store.id));
    const response = await fetch(`${GATEWAY_HTTP_URL}/api/mcp/status`, { cache: 'no-store', headers: authHeaders() });
    const data: any = await response.json();
    return NextResponse.json({ ...data, servers: (data.servers || []).filter((server: any) => storeIds.has(server.storeId)) }, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Gateway injoignable', servers: [] }, { status: 502 });
  }
}
