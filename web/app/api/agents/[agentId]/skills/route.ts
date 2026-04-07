import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List skills assigned to an agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    const agentSkills = await prisma.agentSkill.findMany({
      where: { agentId },
      include: {
        skill: true,
      },
      orderBy: { priority: 'desc' },
    });

    return NextResponse.json({ skills: agentSkills });
  } catch (error) {
    console.error('Error fetching agent skills:', error);
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
  }
}

// POST - Assign a skill to an agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body = await request.json();
    const { skillId, priority } = body;

    if (!skillId) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    // Check if already assigned
    const existing = await prisma.agentSkill.findUnique({
      where: {
        agentId_skillId: {
          agentId,
          skillId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Skill already assigned to this agent' }, { status: 400 });
    }

    // Assign skill
    const agentSkill = await prisma.agentSkill.create({
      data: {
        agentId,
        skillId,
        priority: priority || 0,
      },
      include: {
        skill: true,
      },
    });

    // Notify gateway to reload agent with new skills
    try {
      const gatewayPort = parseInt(process.env.GATEWAY_WS_URL?.split(':')[2] || '18790');
      const gatewayHttpPort = gatewayPort + 1;

      await fetch(`http://localhost:${gatewayHttpPort}/api/agents/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
    } catch (err) {
      console.warn('⚠️  Could not notify gateway of skill assignment:', err);
    }

    return NextResponse.json({ agentSkill }, { status: 201 });
  } catch (error) {
    console.error('Error assigning skill:', error);
    return NextResponse.json({ error: 'Failed to assign skill' }, { status: 500 });
  }
}

// DELETE - Remove a skill from an agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skillId');

    if (!skillId) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    await prisma.agentSkill.delete({
      where: {
        agentId_skillId: {
          agentId,
          skillId,
        },
      },
    });

    // Notify gateway to reload agent
    try {
      const gatewayPort = parseInt(process.env.GATEWAY_WS_URL?.split(':')[2] || '18790');
      const gatewayHttpPort = gatewayPort + 1;

      await fetch(`http://localhost:${gatewayHttpPort}/api/agents/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
    } catch (err) {
      console.warn('⚠️  Could not notify gateway of skill removal:', err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing skill:', error);
    return NextResponse.json({ error: 'Failed to remove skill' }, { status: 500 });
  }
}
