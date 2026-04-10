import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

// GET /api/livrables/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const livrable = await prisma.livrable.findUnique({
      where: { id },
      include: { agent: { select: { id: true } } },
    });

    if (!livrable) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Verify user owns the store this livrable belongs to
    const store = await prisma.store.findFirst({
      where: { id: livrable.storeId, userId: user.id },
    });
    if (!store) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({ livrable });
  } catch (error) {
    console.error('Error fetching livrable:', error);
    return NextResponse.json({ error: 'Failed to fetch livrable' }, { status: 500 });
  }
}

// PATCH /api/livrables/[id] — mark as read
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const livrable = await prisma.livrable.findUnique({ where: { id } });
    if (!livrable) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const store = await prisma.store.findFirst({
      where: { id: livrable.storeId, userId: user.id },
    });
    if (!store) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await prisma.livrable.update({
      where: { id },
      data: { isRead: true },
    });

    return NextResponse.json({ livrable: updated });
  } catch (error) {
    console.error('Error updating livrable:', error);
    return NextResponse.json({ error: 'Failed to update livrable' }, { status: 500 });
  }
}
