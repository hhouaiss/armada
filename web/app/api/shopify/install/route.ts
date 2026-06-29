import { NextRequest, NextResponse } from 'next/server';
import { generateAuthUrl } from '@/lib/shopify';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  // Where to return after OAuth — set to 'onboarding' so the callback resumes the flow.
  const origin = searchParams.get('from') === 'onboarding' ? 'onboarding' : 'hq';

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  // Generate random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Store state in session/cookie for verification
  const response = NextResponse.redirect(
    generateAuthUrl(
      {
        apiKey: process.env.SHOPIFY_API_KEY!,
        apiSecret: process.env.SHOPIFY_API_SECRET!,
        scopes: process.env.SHOPIFY_SCOPES!.split(','),
        hostName: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      },
      shop,
      state
    )
  );

  // Set state cookie for verification in callback
  response.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 minutes
    sameSite: 'lax',
  });

  // Remember where to return after OAuth (onboarding resume vs. dashboard).
  response.cookies.set('shopify_connect_origin', origin, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    sameSite: 'lax',
  });

  return response;
}
