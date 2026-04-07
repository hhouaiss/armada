import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptToken } from '@/lib/shopify';

export async function GET() {
  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: {
        id: true,
        shopifyDomain: true,
        storeName: true,
        installedAt: true,
        lastSyncAt: true,
      },
    });

    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Error fetching stores:', error);
    return NextResponse.json({ error: 'Failed to fetch stores' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await request.json();

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        shopifyDomain: true,
        storeName: true,
        installedAt: true,
        lastSyncAt: true,
      },
    });

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // SECURITY: Never return decrypted token to client
    return NextResponse.json({ store });
  } catch (error) {
    console.error('Error fetching store:', error);
    return NextResponse.json({ error: 'Failed to fetch store' }, { status: 500 });
  }
}
