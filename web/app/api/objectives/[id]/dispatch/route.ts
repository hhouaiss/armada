/**
 * POST /api/objectives/[id]/dispatch
 *
 * Confirms a plan and immediately triggers agent execution.
 * 1. Creates Project records in DB (one per task)
 * 2. Activates the objective (backlog → active)
 * 3. Triggers gateway to execute each agent's task NOW (saves results to ChatMessage)
 * 4. Also writes to agent inboxes for future reference
 *
 * Returns which agents were triggered so the UI can link to their chats.
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

  // 1. Find agent DB records (for project ownerAgentId)
  const agentTypes = tasks.map((t) => t.agentType);
  const agents = await prisma.agent.findMany({
    where: { storeId, type: { in: agentTypes }, isActive: true },
    select: { id: true, type: true, name: true },
  });
  const agentByType = new Map(agents.map((a) => [a.type, a]));

  // 2. Create Project records (one per task)
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

  // 3. Activate objective if it was in backlog
  if (objective.status === 'backlog') {
    await prisma.objective.update({
      where: { id },
      data: { status: 'active' },
    });
  }

  // 4. Trigger actual agent execution in the gateway (fire & forget — 202)
  //    Each agent will chat(), use tools, and save results to ChatMessage table.
  let executionTriggered = false;
  try {
    const execRes = await fetch(`${GATEWAY_HTTP_URL}/api/objectives/execute-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        objectiveId: id,
        objectiveTitle: objective.title,
        tasks: tasks.map((t) => ({
          agentType: t.agentType,
          agentName: t.agentName,
          task: t.task,
        })),
      }),
      signal: AbortSignal.timeout(8_000), // just checking the 202 arrives
    });
    executionTriggered = execRes.status === 202 || execRes.ok;
  } catch (error) {
    // Gateway offline — tasks will execute next time agents chat or at AutoDream
    console.warn('Gateway offline — execution deferred:', error);
    executionTriggered = false;
  }

  // 5. Also write to inboxes for future reference / sessions
  try {
    await fetch(`${GATEWAY_HTTP_URL}/api/inbox/dispatch`, {
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
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Non-fatal
  }

  // Return agent chat links so the UI can surface them
  const agentLinks = tasks.map((t) => {
    const agent = agentByType.get(t.agentType);
    return {
      agentId: agent?.id ?? null,
      agentName: t.agentName,
      agentType: t.agentType,
    };
  }).filter((a) => a.agentId !== null);

  return NextResponse.json({
    success: true,
    projectsCreated: projects.length,
    executionTriggered,
    objectiveActivated: objective.status === 'backlog',
    agents: agentLinks,
  });
}
