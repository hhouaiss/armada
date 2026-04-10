import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

// GET /api/livrables?storeId=xxx
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    // Verify user owns this store
    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: user.id },
    });
    if (!store) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const livrables = await prisma.livrable.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        agentName: true,
        agentType: true,
        isRead: true,
        createdAt: true,
        // Return first 200 chars as preview, full content fetched on detail
        content: true,
      },
    });

    const unreadCount = livrables.filter((l) => !l.isRead).length;

    return NextResponse.json({ livrables, unreadCount });
  } catch (error) {
    console.error('Error fetching livrables:', error);
    return NextResponse.json({ error: 'Failed to fetch livrables' }, { status: 500 });
  }
}
