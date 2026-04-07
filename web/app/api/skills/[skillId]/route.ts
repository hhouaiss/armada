import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Fetch single skill
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;

    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
        _count: {
          select: { agents: true },
        },
      },
    });

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    return NextResponse.json({ skill });
  } catch (error) {
    console.error('Error fetching skill:', error);
    return NextResponse.json({ error: 'Failed to fetch skill' }, { status: 500 });
  }
}

// PATCH - Update skill
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const body = await request.json();
    const { name, description, content, type, category, icon, isActive } = body;

    // If updating name, validate format
    if (name) {
      const nameRegex = /^[a-z0-9-]+$/;
      if (!nameRegex.test(name)) {
        return NextResponse.json(
          { error: 'Skill name must contain only lowercase letters, numbers, and hyphens' },
          { status: 400 }
        );
      }
    }

    const skill = await prisma.skill.update({
      where: { id: skillId },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(content && { content }),
        ...(type && { type }),
        ...(category !== undefined && { category }),
        ...(icon !== undefined && { icon }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      },
      include: {
        _count: {
          select: { agents: true },
        },
      },
    });

    return NextResponse.json({ skill });
  } catch (error) {
    console.error('Error updating skill:', error);
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 });
  }
}

// DELETE - Remove skill
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;

    // Check if skill exists
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        _count: {
          select: { agents: true },
        },
      },
    });

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    // Delete skill (cascade will remove agent_skills)
    await prisma.skill.delete({
      where: { id: skillId },
    });

    return NextResponse.json({
      success: true,
      message: `Skill removed from ${skill._count.agents} agent(s)`,
    });
  } catch (error) {
    console.error('Error deleting skill:', error);
    return NextResponse.json({ error: 'Failed to delete skill' }, { status: 500 });
  }
}
