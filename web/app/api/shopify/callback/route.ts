import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, verifyHmac, encryptToken } from '@/lib/shopify';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');

  // Verify state (CSRF protection)
  const storedState = request.cookies.get('shopify_oauth_state')?.value;
  if (!state || state !== storedState) {
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
  }

  if (!code || !shop || !hmac) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  // Verify HMAC
  const query: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    query[key] = value;
  });

  if (!verifyHmac(query, process.env.SHOPIFY_API_SECRET!)) {
    return NextResponse.json({ error: 'HMAC verification failed' }, { status: 403 });
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(
      {
        apiKey: process.env.SHOPIFY_API_KEY!,
        apiSecret: process.env.SHOPIFY_API_SECRET!,
        scopes: process.env.SHOPIFY_SCOPES!.split(','),
        hostName: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      },
      shop,
      code
    );

    // Encrypt token
    const encryptedToken = encryptToken(accessToken);

    // Create demo user if not exists (for MVP)
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'demo@storeteam.ai',
          name: 'Demo User',
        },
      });
    }

    // Store in database
    const store = await prisma.store.upsert({
      where: { shopifyDomain: shop },
      update: {
        accessToken: encryptedToken,
        lastSyncAt: new Date(),
        isActive: true,
      },
      create: {
        shopifyDomain: shop,
        storeName: shop.replace('.myshopify.com', ''),
        accessToken: encryptedToken,
        scope: process.env.SHOPIFY_SCOPES!,
        userId: user.id,
      },
    });

    // Create default agents for this store
    const agentTypes = [
      { type: 'product', name: 'Product Agent' },
      { type: 'inventory', name: 'Inventory Agent' },
      { type: 'support', name: 'Support Agent' },
    ];

    for (const agentType of agentTypes) {
      await prisma.agent.upsert({
        where: {
          storeId_type: {
            storeId: store.id,
            type: agentType.type,
          },
        },
        update: {},
        create: {
          agentId: `${store.id}:${agentType.type}-agent`,
          name: agentType.name,
          type: agentType.type,
          personality: `You are the ${agentType.name} for this Shopify store.`,
          storeId: store.id,
        },
      });
    }

    console.log('✓ Shopify store connected:', shop);

    // Notify gateway to load agents for this store
    try {
      const gatewayPort = parseInt(process.env.GATEWAY_WS_URL?.split(':')[2] || '18790');
      const gatewayHttpPort = gatewayPort + 1;

      await fetch(`http://localhost:${gatewayHttpPort}/api/stores/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id }),
      });

      console.log('✓ Notified gateway of new store');
    } catch (err) {
      console.warn('⚠️  Could not notify gateway of new store:', err);
    }

    // Redirect: resume onboarding if the connect was initiated there, else HQ.
    const origin = request.cookies.get('shopify_connect_origin')?.value;
    const destination =
      origin === 'onboarding' ? `/onboarding?connected=${store.id}` : '/hq';
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.delete('shopify_oauth_state');
    response.cookies.delete('shopify_connect_origin');

    return response;
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.json(
      { error: 'Failed to complete OAuth flow' },
      { status: 500 }
    );
  }
}
