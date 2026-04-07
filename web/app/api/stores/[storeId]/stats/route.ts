import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ShopifyClient, decryptToken } from '@/lib/shopify';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const accessToken = decryptToken(store.accessToken);
    const client = new ShopifyClient(store.shopifyDomain, accessToken);

    const [productCount, customerCount, orderCount] = await Promise.allSettled([
      client.getProductCount(),
      client.getCustomerCount(),
      client.getOrderCount(),
    ]);

    return NextResponse.json({
      stats: {
        products: productCount.status === 'fulfilled' ? productCount.value.count : 0,
        customers: customerCount.status === 'fulfilled' ? customerCount.value.count : 0,
        orders: orderCount.status === 'fulfilled' ? orderCount.value.count : 0,
        storeName: store.storeName,
        shopifyDomain: store.shopifyDomain,
      },
    });
  } catch (error) {
    console.error('Error fetching store stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch store stats' },
      { status: 500 }
    );
  }
}
