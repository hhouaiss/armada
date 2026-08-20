import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const status = searchParams.get('status') || 'pending';

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    const store = await prisma.store.findFirst({ where: { id: storeId, userId: user.id }, select: { id: true } });
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

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

    return NextResponse.json({ approvals: approvals.map(({ payload: _payload, ...approval }) => approval) });
  } catch (error) {
    console.error('Error fetching approvals:', error);
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { id, decision } = body; // decision: 'approved' | 'rejected'

    if (!id || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'id and a valid decision are required' }, { status: 400 });
    }

    // Only pending requests can be decided — prevents re-running an
    // already-executed action if the endpoint is called twice.
    const updated = await prisma.approvalRequest.updateMany({
      where: { id, status: 'pending', expiresAt: { gt: new Date() }, store: { userId: user.id } },
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

    const approval = await prisma.approvalRequest.findFirst({ where: { id, store: { userId: user.id } } });
    if (!approval) return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    const { payload: _payload, ...safeApproval } = approval;
    return NextResponse.json({ approval: safeApproval });
  } catch (error) {
    console.error('Error updating approval:', error);
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
  }
}
