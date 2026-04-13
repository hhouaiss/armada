import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    // Fetch meta records in one query
    const metaRecords = await prisma.agentMemory.findMany({
      where: {
        storeId,
        type: 'meta',
        key: { in: ['kairos_last_tick', 'kairos_enabled', 'dream_last_run'] },
      },
    });

    // Fetch last 5 dream logs
    const dreamLogs = await prisma.agentMemory.findMany({
      where: {
        storeId,
        type: 'topic',
        key: { startsWith: 'dream_log/' },
      },
      orderBy: { key: 'desc' },
      take: 5,
      select: { key: true, content: true, updatedAt: true },
    });

    const get = (key: string) => metaRecords.find(r => r.key === key)?.content ?? null;

    // Parse dream logs — extract counts + summary from markdown
    const parsedLogs = dreamLogs.map((log) => {
      const date = log.key.replace('dream_log/', '');
      const decisionsMatch = log.content.match(/## Décisions ajoutées \((\d+)\)/);
      const factsMatch     = log.content.match(/## Faits ajoutés \((\d+)\)/);
      const summaryMatch   = log.content.match(/## Résumé\s*\n([^\n#]+)/);
      const contradMatch   = log.content.match(/## Contradictions détectées/);

      return {
        date,
        decisionsCount:    parseInt(decisionsMatch?.[1] ?? '0', 10),
        factsCount:        parseInt(factsMatch?.[1] ?? '0', 10),
        hasContradictions: !!contradMatch,
        summary:           summaryMatch?.[1]?.trim() ?? null,
        ranAt:             log.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      kairos: {
        enabled:  get('kairos_enabled') !== 'false',   // defaults to true if not set
        lastTick: get('kairos_last_tick'),
      },
      autoDream: {
        lastRun:    get('dream_last_run'),
        recentLogs: parsedLogs,
      },
    });
  } catch (error) {
    console.error('Error fetching workers data:', error);
    return NextResponse.json({ error: 'Failed to fetch workers data' }, { status: 500 });
  }
}
