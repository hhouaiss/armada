import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List all skills for the user
export async function GET(request: NextRequest) {
  try {
    // Get demo user (no auth for now)
    const user = await prisma.user.findFirst();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const category = searchParams.get('category');

    const skills = await prisma.skill.findMany({
      where: {
        userId: user.id,
        ...(type && { type }),
        ...(category && { category }),
        isActive: true,
      },
      include: {
        _count: {
          select: { agents: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
  }
}

// POST - Create a new skill
export async function POST(request: NextRequest) {
  try {
    // Get demo user (no auth for now)
    const user = await prisma.user.findFirst();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, content, type, category, icon } = body;

    // Validate required fields
    if (!name || !description || !content) {
      return NextResponse.json(
        { error: 'Name, description, and content are required' },
        { status: 400 }
      );
    }

    // Validate name format (lowercase, alphanumeric, hyphens only)
    const nameRegex = /^[a-z0-9-]+$/;
    if (!nameRegex.test(name)) {
      return NextResponse.json(
        { error: 'Skill name must contain only lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    // Check for duplicate names
    const existing = await prisma.skill.findFirst({
      where: {
        userId: user.id,
        name,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A skill with this name already exists' },
        { status: 400 }
      );
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        description,
        content,
        type: type || 'knowledge',
        category,
        icon,
        userId: user.id,
      },
      include: {
        _count: {
          select: { agents: true },
        },
      },
    });

    return NextResponse.json({ skill }, { status: 201 });
  } catch (error) {
    console.error('Error creating skill:', error);
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 });
  }
}
