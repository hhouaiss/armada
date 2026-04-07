import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');

    const operations = await prisma.operation.findMany({
      where: {
        ...(storeId && { storeId }),
        ...(status && { status }),
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        agent: {
          select: { name: true, type: true },
        },
      },
    });

    return NextResponse.json({ operations });
  } catch (error) {
    console.error('Error fetching operations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch operations' },
      { status: 500 }
    );
  }
}
