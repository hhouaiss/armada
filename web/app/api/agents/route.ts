import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    const agents = await prisma.agent.findMany({
      where: {
        ...(storeId && { storeId }),
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
    let gatewayAgents: any[] = [];
    try {
      const res = await fetch('http://localhost:18791/api/agents');
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
