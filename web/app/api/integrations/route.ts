import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken, decryptToken } from '@/lib/shopify';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const userId = user?.id;
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
    const user = await getCurrentUser(request);
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { platform, credentials } = await request.json();

    if (!platform || !credentials) {
      return NextResponse.json(
        { error: 'platform and credentials are required' },
        { status: 400 }
      );
    }

    // Encrypt credentials before storing
    const encryptedCredentials = encryptToken(JSON.stringify(credentials));

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
    const user = await getCurrentUser(request);
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');

    if (!platform) {
      return NextResponse.json(
        { error: 'platform is required' },
        { status: 400 }
      );
    }

    await prisma.integration.deleteMany({
      where: { userId, platform },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting integration:', error);
    return NextResponse.json(
      { error: 'Failed to delete integration' },
      { status: 500 }
    );
  }
}
