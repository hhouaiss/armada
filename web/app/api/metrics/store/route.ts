import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ShopifyClient, decryptToken } from '@/lib/shopify';

/**
 * GET /api/metrics/store?storeId=...
 *
 * Ecommerce KPIs for the QG (Mission Control) header strip:
 * revenue, orders, AOV (7d + today), unfulfilled backlog, and inventory health.
 * Reuses the existing ShopifyClient — no gateway round-trip.
 *
 * Notes:
 * - Orders are pulled with status=any (limit 250) and windowed client-side,
 *   since the REST helper doesn't take created_at filters.
 * - Inventory health is derived from up to 250 products' variants — adequate
 *   for SMB catalogs (the primary user). Larger catalogs are capped, not wrong.
 */

const LOW_STOCK_THRESHOLD = 5;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const client = new ShopifyClient(store.shopifyDomain, decryptToken(store.accessToken));

    const [shopRes, ordersRes, productsRes, customerCountRes] = await Promise.allSettled([
      client.getShopInfo(),
      client.getOrders({ limit: 250, status: 'any' }),
      client.getProducts({ limit: 250, fields: 'id,variants' }),
      client.getCustomerCount(),
    ]);

    const currency =
      shopRes.status === 'fulfilled' ? shopRes.value?.shop?.currency ?? 'EUR' : 'EUR';

    // ── Orders → revenue / AOV / backlog ──
    const orders: any[] =
      ordersRes.status === 'fulfilled' ? ordersRes.value?.orders ?? [] : [];

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86_400_000;
    const oneDayAgo = now - 86_400_000;

    const sum = (list: any[]) =>
      list.reduce((acc, o) => acc + (parseFloat(o.total_price) || 0), 0);

    const orders7d = orders.filter(o => new Date(o.created_at).getTime() >= sevenDaysAgo);
    const ordersToday = orders.filter(o => new Date(o.created_at).getTime() >= oneDayAgo);

    const revenue7d = sum(orders7d);
    const revenueToday = sum(ordersToday);
    const aov7d = orders7d.length ? revenue7d / orders7d.length : 0;

    // Unfulfilled backlog (open orders not yet fulfilled, excluding cancelled).
    const unfulfilled = orders.filter(
      o => !o.cancelled_at && (o.fulfillment_status === null || o.fulfillment_status === 'partial'),
    ).length;

    // ── Inventory health ──
    const products: any[] =
      productsRes.status === 'fulfilled' ? productsRes.value?.products ?? [] : [];

    let lowStock = 0;
    let outOfStock = 0;
    for (const p of products) {
      for (const v of p.variants ?? []) {
        // Only count variants that actually track inventory.
        if (v.inventory_management == null) continue;
        const qty = typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null;
        if (qty === null) continue;
        if (qty <= 0) outOfStock++;
        else if (qty <= LOW_STOCK_THRESHOLD) lowStock++;
      }
    }

    const customers =
      customerCountRes.status === 'fulfilled' ? customerCountRes.value?.count ?? 0 : 0;

    return NextResponse.json({
      metrics: {
        currency,
        revenue7d,
        revenueToday,
        orders7d: orders7d.length,
        ordersToday: ordersToday.length,
        aov7d,
        unfulfilled,
        lowStock,
        outOfStock,
        products: products.length,
        customers,
        // partial = some Shopify calls failed (still return what we have)
        partial: [shopRes, ordersRes, productsRes, customerCountRes].some(r => r.status === 'rejected'),
      },
    });
  } catch (error) {
    console.error('Error fetching store metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch store metrics' }, { status: 500 });
  }
}
