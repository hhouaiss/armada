import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const status = searchParams.get('status') || 'pending';

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    // Auto-expire approvals older than 24h
    await prisma.approvalRequest.updateMany({
      where: {
        storeId,
        status: 'pending',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    });

    const approvals = await prisma.approvalRequest.findMany({
      where: {
        storeId,
        ...(status !== 'all' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ approvals });
  } catch (error) {
    console.error('Error fetching approvals:', error);
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, decision } = body; // decision: 'approved' | 'rejected'

    if (!id || !decision) {
      return NextResponse.json({ error: 'id and decision are required' }, { status: 400 });
    }

    // Only pending requests can be decided — prevents re-running an
    // already-executed action if the endpoint is called twice.
    const updated = await prisma.approvalRequest.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: decision,
        decidedAt: new Date(),
        decidedBy: 'human',
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'Approval already decided or expired' },
        { status: 409 }
      );
    }

    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    return NextResponse.json({ approval });
  } catch (error) {
    console.error('Error updating approval:', error);
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
  }
}
