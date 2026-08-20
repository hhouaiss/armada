import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    const agents = await prisma.agent.findMany({
      where: {
        ...(storeId && { storeId }),
        store: { userId: user.id },
        isActive: true,
      },
      include: {
        _count: { select: { operations: true } },
        operations: {
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: {
            action: true,
            status: true,
            duration: true,
            startedAt: true,
          },
        },
      },
    });

    // Check gateway for live status
    // GATEWAY_HTTP_URL: https://armada-production-221a.up.railway.app (prod)
    //                   http://localhost:18790 (local dev — same port as WS now)
    let gatewayAgents: any[] = [];
    const gatewayUrl = process.env.GATEWAY_HTTP_URL || 'http://localhost:18790';
    try {
      const res = await fetch(`${gatewayUrl}/api/agents`, { next: { revalidate: 0 } });
      const data = await res.json();
      gatewayAgents = data.agents || [];
    } catch (err) {
      console.warn('Could not fetch gateway agent status:', err);
    }

    // Merge DB data with live status
    const enriched = agents.map((a) => ({
      ...a,
      isOnline: gatewayAgents.some((ga) => ga.id === a.id),
    }));

    return NextResponse.json({ agents: enriched });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
