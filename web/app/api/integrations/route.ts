import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken, decryptToken } from '@/lib/shopify';

async function getDefaultUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({ where: { email: 'demo@storeteam.ai' } });
  return user?.id ?? null;
}

export async function GET() {
  try {
    const userId = await getDefaultUserId();
    if (!userId) {
      return NextResponse.json({ integrations: [] });
    }

    const integrations = await prisma.integration.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        isActive: true,
        lastUsed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ integrations });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { platform, credentials } = await request.json();

    if (!platform || !credentials) {
      return NextResponse.json(
        { error: 'platform and credentials are required' },
        { status: 400 }
      );
    }

    // Encrypt credentials before storing
    const encryptedCredentials = encryptToken(JSON.stringify(credentials));

    const userId = await getDefaultUserId();
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 500 });
    }

    // Upsert integration
    const integration = await prisma.integration.upsert({
      where: {
        userId_platform: { userId, platform },
      },
      create: {
        userId,
        platform,
        credentials: { encrypted: encryptedCredentials },
        isActive: true,
      },
      update: {
        credentials: { encrypted: encryptedCredentials },
        isActive: true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ integration });
  } catch (error) {
    console.error('Error saving integration:', error);
    return NextResponse.json(
      { error: 'Failed to save integration' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');

    if (!platform) {
      return NextResponse.json(
        { error: 'platform is required' },
        { status: 400 }
      );
    }

    const userId = await getDefaultUserId();
    if (userId) {
      await prisma.integration.deleteMany({
        where: { userId, platform },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting integration:', error);
    return NextResponse.json(
      { error: 'Failed to delete integration' },
      { status: 500 }
    );
  }
}
