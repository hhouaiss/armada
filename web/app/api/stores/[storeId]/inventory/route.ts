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

    const data = await client.getProducts({ limit: 50 });
    const products = data.products || [];

    const inventoryItems = products.flatMap((product: any) =>
      (product.variants || []).map((variant: any) => ({
        productId: product.id,
        productTitle: product.title,
        variantTitle: variant.title,
        sku: variant.sku || '',
        inventoryItemId: variant.inventory_item_id,
        inventoryQuantity: variant.inventory_quantity ?? 0,
        price: variant.price,
      }))
    );

    const lowStock = inventoryItems.filter(
      (item: any) => item.inventoryQuantity <= 10 && item.inventoryQuantity > 0
    );
    const outOfStock = inventoryItems.filter(
      (item: any) => item.inventoryQuantity <= 0
    );

    return NextResponse.json({
      inventory: inventoryItems,
      lowStock,
      outOfStock,
      stats: {
        totalItems: inventoryItems.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
      },
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory' },
      { status: 500 }
    );
  }
}
