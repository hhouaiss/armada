/**
 * POST /api/objectives/[id]/dispatch
 *
 * Confirms a plan and dispatches tasks to agent inboxes.
 * 1. Creates Project records in DB (one per task)
 * 2. Pushes tasks to agent inboxes via gateway /api/inbox/dispatch
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const GATEWAY_HTTP_URL = process.env.GATEWAY_HTTP_URL || 'http://localhost:18790';

interface PlanTask {
  agentType: string;
  agentName: string;
  task: string;
  rationale?: string;
  priority?: string;
  estimatedDays?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { storeId, tasks } = (await request.json()) as { storeId: string; tasks: PlanTask[] };

  if (!storeId || !id || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: 'storeId and tasks[] are required' }, { status: 400 });
  }

  // Verify objective belongs to this store
  const objective = await prisma.objective.findUnique({
    where: { id },
    select: { id: true, storeId: true, title: true, status: true },
  });

  if (!objective || objective.storeId !== storeId) {
    return NextResponse.json({ error: 'Objective not found' }, { status: 404 });
  }

  // 1. Find agent IDs for each task
  const agentTypes = tasks.map((t) => t.agentType);
  const agents = await prisma.agent.findMany({
    where: { storeId, type: { in: agentTypes }, isActive: true },
    select: { id: true, type: true, name: true },
  });

  const agentByType = new Map(agents.map((a) => [a.type, a]));

  // 2. Create Project records
  const projects = await Promise.all(
    tasks.map(async (t) => {
      const agent = agentByType.get(t.agentType);
      return prisma.project.create({
        data: {
          objectiveId: id,
          storeId,
          title: `${t.agentName} — ${objective.title}`.slice(0, 120),
          description: t.task,
          status: 'active',
          ownerAgentId: agent?.id ?? null,
        },
      });
    })
  );

  // 3. Update objective status to 'active' if it was in backlog
  if (objective.status === 'backlog') {
    await prisma.objective.update({
      where: { id },
      data: { status: 'active' },
    });
  }

  // 4. Dispatch to agent inboxes via gateway
  let dispatched = 0;
  try {
    const inboxRes = await fetch(`${GATEWAY_HTTP_URL}/api/inbox/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        tasks: tasks.map((t) => ({
          agentType: t.agentType,
          task: `[Objectif: ${objective.title}]\n\n${t.task}`,
          from: 'Mission Control',
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (inboxRes.ok) {
      const inboxData = await inboxRes.json();
      dispatched = inboxData.dispatched ?? tasks.length;
    }
  } catch (error) {
    console.error('Inbox dispatch warning (non-fatal):', error);
    // Non-fatal — projects are created, tasks go to inbox when gateway is reachable
    dispatched = 0;
  }

  return NextResponse.json({
    success: true,
    projectsCreated: projects.length,
    dispatched,
    objectiveActivated: objective.status === 'backlog',
  });
}
