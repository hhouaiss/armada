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
  const confidences = answered.map(c => c.confidence).filter((v): v is number => v != null);
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
    const ACTIONS = new Set(['name_resolved', 'mode_upgraded', 'misroute_flagged', 'risk_raised']);
    for (const c of calls) {
      const day = daily.get(c.createdAt.toISOString().slice(0, 10));
      if (!day) continue;
      day.calls++;
      if (c.status !== 'ok') day.errors++;
      if (c.outcomes.some(o => ACTIONS.has(o))) day.actions++;
      if (c.status === 'ok') { day.answered++; day.latencySum += c.latencyMs; }
      day.cost += cost(c);
    }

    return NextResponse.json({
      days,
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
