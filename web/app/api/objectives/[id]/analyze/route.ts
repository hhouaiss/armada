/**
 * POST /api/objectives/[id]/analyze
 *
 * Asks The Major to create a task plan for an objective.
 * Proxies to the gateway's /api/objectives/analyze endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const GATEWAY_HTTP_URL = process.env.GATEWAY_HTTP_URL || 'http://localhost:18790';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { storeId } = await request.json();

  if (!storeId || !id) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Verify objective belongs to this store
  const objective = await prisma.objective.findUnique({
    where: { id },
    select: { id: true, storeId: true, title: true },
  });

  if (!objective || objective.storeId !== storeId) {
    return NextResponse.json({ error: 'Objective not found' }, { status: 404 });
  }

  try {
    const res = await fetch(`${GATEWAY_HTTP_URL}/api/objectives/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, objectiveId: id }),
      signal: AbortSignal.timeout(60_000), // LLM can take a moment
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.error ?? 'Gateway error' }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Objective analyze error:', error);
    return NextResponse.json(
      { error: error.message ?? 'Failed to analyze objective' },
      { status: 500 }
    );
  }
}
