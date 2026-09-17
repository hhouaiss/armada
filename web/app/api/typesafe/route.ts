import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { TypeSafeCall } from '@prisma/client';

// TypeSafe publishes no public price list; set your contract rates (USD per 1M tokens) to get cost figures.
const INPUT_RATE = Number(process.env.TYPESAFE_COST_PER_MTOK_INPUT ?? 0);
const OUTPUT_RATE = Number(process.env.TYPESAFE_COST_PER_MTOK_OUTPUT ?? 0);
const MAX_ROWS = 5000;

const cost = (c: Pick<TypeSafeCall, 'inputTokens' | 'outputTokens'>) =>
  (c.inputTokens * INPUT_RATE + c.outputTokens * OUTPUT_RATE) / 1_000_000;

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(calls: TypeSafeCall[]) {
  const answered = calls.filter(c => c.status === 'ok');
  const latencies = answered.map(c => c.latencyMs).sort((a, b) => a - b);
  const inputTokens = calls.reduce((s, c) => s + c.inputTokens, 0);
  const outputTokens = calls.reduce((s, c) => s + c.outputTokens, 0);
  // output_review stores a quality score in `confidence`; keep it out of the Jev confidence average.
  const confidences = answered
    .filter(c => c.feature !== 'output_review')
    .map(c => c.confidence)
    .filter((v): v is number => v != null);
  const byStatus: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  for (const c of calls) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    for (const o of c.outcomes) byOutcome[o] = (byOutcome[o] ?? 0) + 1;
  }
  const totalCost = calls.reduce((s, c) => s + cost(c), 0);
  return {
    calls: calls.length,
    answered: answered.length,
    errorRate: calls.length ? (calls.length - answered.length) / calls.length : 0,
    latencyAvg: latencies.length ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : 0,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    inputTokens,
    outputTokens,
    cost: totalCost,
    avgConfidence: confidences.length ? confidences.reduce((s, v) => s + v, 0) / confidences.length : null,
    byStatus,
    byOutcome,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const feature = searchParams.get('feature');
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? 7), 1), 90);
  if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const all = await prisma.typeSafeCall.findMany({
      where: { storeId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const calls = feature ? all.filter(c => c.feature === feature) : all;

    const byFeature: Record<string, ReturnType<typeof summarize>> = {};
    for (const f of new Set(all.map(c => c.feature))) byFeature[f] = summarize(all.filter(c => c.feature === f));

    const daily = new Map<string, { date: string; calls: number; errors: number; actions: number; latencySum: number; answered: number; cost: number }>();
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
      daily.set(date, { date, calls: 0, errors: 0, actions: 0, latencySum: 0, answered: 0, cost: 0 });
    }
    const ACTIONS = new Set(['name_resolved', 'mode_upgraded', 'misroute_flagged', 'risk_raised', 'rating:poor', 'correction_requested']);
    for (const c of calls) {
      const day = daily.get(c.createdAt.toISOString().slice(0, 10));
      if (!day) continue;
      day.calls++;
      if (c.status !== 'ok') day.errors++;
      if (c.outcomes.some(o => ACTIONS.has(o) || o.startsWith('lesson_'))) day.actions++;
      if (c.status === 'ok') { day.answered++; day.latencySum += c.latencyMs; }
      day.cost += cost(c);
    }

    const reviews = all.filter(c => c.feature === 'output_review' && c.status === 'ok' && c.confidence != null);
    const agentIds = [...new Set(reviews.map(r => r.agentId).filter((v): v is string => !!v))];
    const [coachingRows, agentRows] = await Promise.all([
      prisma.agentMemory.findMany({ where: { storeId, type: 'coaching' } }),
      prisma.agent.findMany({ where: { storeId }, select: { id: true, name: true, type: true } }),
    ]);
    const agentInfo = new Map(agentRows.map(a => [a.id, a]));
    const lessonsByAgent = new Map<string, any[]>();
    const evaluationsByAgent = new Map<string, any[]>();
    for (const row of coachingRows) {
      try {
        const parsed = JSON.parse(row.content);
        lessonsByAgent.set(row.key, Array.isArray(parsed) ? parsed : parsed.lessons ?? []);
        evaluationsByAgent.set(row.key, Array.isArray(parsed) ? [] : parsed.evaluations ?? []);
      } catch {}
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const agents = [...new Set([...agentIds, ...lessonsByAgent.keys()])].map(id => {
      const mine = reviews.filter(r => r.agentId === id).reverse(); // oldest first
      const half = Math.floor(mine.length / 2);
      const weaknesses: Record<string, number> = {};
      const ratings: Record<string, number> = { good: 0, weak: 0, poor: 0 };
      for (const r of mine) {
        for (const o of r.outcomes) {
          if (o.startsWith('weakness:')) weaknesses[o.slice(9)] = (weaknesses[o.slice(9)] ?? 0) + 1;
          if (o.startsWith('rating:')) ratings[o.slice(7)] = (ratings[o.slice(7)] ?? 0) + 1;
        }
      }
      return {
        agentId: id,
        name: agentInfo.get(id)?.name ?? mine[mine.length - 1]?.agentName ?? id,
        type: agentInfo.get(id)?.type ?? null,
        reviews: mine.length,
        avgQuality: avg(mine.map(r => r.confidence!)),
        earlierQuality: mine.length >= 4 ? avg(mine.slice(0, half).map(r => r.confidence!)) : null,
        recentQuality: mine.length >= 4 ? avg(mine.slice(half).map(r => r.confidence!)) : null,
        ratings,
        weaknesses,
        qualitySeries: mine.slice(-30).map(r => ({ at: r.createdAt, quality: r.confidence })),
        lessons: lessonsByAgent.get(id) ?? [],
        evaluations: (evaluationsByAgent.get(id) ?? []).slice(0, 5),
        livrablesReviewed: mine.filter(r => Array.isArray(r.evidence) && r.evidence.length > 0).length,
      };
    }).sort((a, b) => b.reviews - a.reviews);

    return NextResponse.json({
      days,
      agents,
      truncated: all.length === MAX_ROWS,
      pricingConfigured: INPUT_RATE > 0 || OUTPUT_RATE > 0,
      summary: summarize(calls),
      byFeature,
      daily: [...daily.values()].map(({ latencySum, answered, ...d }) => ({
        ...d,
        latencyAvg: answered ? Math.round(latencySum / answered) : 0,
      })),
      recent: calls.slice(0, 100).map(c => ({ ...c, cost: cost(c) })),
    });
  } catch (error) {
    console.error('Error fetching TypeSafe metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch TypeSafe metrics' }, { status: 500 });
  }
}
