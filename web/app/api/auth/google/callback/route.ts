import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/shopify';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

async function getOrCreateDefaultUser() {
  let user = await prisma.user.findFirst({ where: { email: 'demo@storeteam.ai' } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: 'demo@storeteam.ai', name: 'Demo User' },
    });
  }
  return user;
}

export async function GET(request: NextRequest) {
  // Derive redirect URI from the actual request — must match what was sent to Google
  const origin = new URL(request.url).origin;
  const REDIRECT_URI = `${origin}/api/auth/google/callback`;

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('[GSC OAuth] Callback hit');
  console.log('[GSC OAuth] Origin:', origin);
  console.log('[GSC OAuth] Redirect URI:', REDIRECT_URI);
  console.log('[GSC OAuth] error param:', error);
  console.log('[GSC OAuth] state from Google:', state);
  console.log('[GSC OAuth] code present:', !!code);

  // Handle user denial
  if (error) {
    console.log('[GSC OAuth] User denied access:', error);
    return NextResponse.redirect(new URL('/config?gsc=denied', request.url));
  }

  // Verify CSRF state
  const storedState = request.cookies.get('google_oauth_state')?.value;
  console.log('[GSC OAuth] stored state cookie:', storedState ?? '(none)');
  console.log('[GSC OAuth] state match:', state === storedState);

  if (!state || state !== storedState) {
    console.error('[GSC OAuth] State mismatch — possible causes:');
    console.error('  1. Cookie was not stored before redirect to Google');
    console.error('  2. Browser blocked the cookie');
    console.error('  3. Different origin/port than when the flow started');
    console.error(`  Expected: ${state}, Got: ${storedState ?? '(empty)'}`);
    return NextResponse.redirect(new URL('/config?gsc=error&reason=state', request.url));
  }

  if (!code) {
    console.error('[GSC OAuth] No code in callback');
    return NextResponse.redirect(new URL('/config?gsc=error&reason=no_code', request.url));
  }

  try {
    console.log('[GSC OAuth] Exchanging code for tokens...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error('[GSC OAuth] Token exchange failed:', tokenResponse.status, err);
      return NextResponse.redirect(new URL('/config?gsc=error&reason=token', request.url));
    }

    const tokens = await tokenResponse.json();
    console.log('[GSC OAuth] Token exchange success. Has refresh_token:', !!tokens.refresh_token);

    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expiry_date: Date.now() + (tokens.expires_in * 1000),
      selected_property: null,
    };

    const encryptedCredentials = encryptToken(JSON.stringify(credentials));
    const user = await getOrCreateDefaultUser();
    console.log('[GSC OAuth] Saving for user:', user.email, '(id:', user.id + ')');

    await prisma.integration.upsert({
      where: {
        userId_platform: { userId: user.id, platform: 'google-search-console' },
      },
      create: {
        userId: user.id,
        platform: 'google-search-console',
        credentials: { encrypted: encryptedCredentials },
        isActive: true,
      },
      update: {
        credentials: { encrypted: encryptedCredentials },
        isActive: true,
        updatedAt: new Date(),
      },
    });

    console.log('[GSC OAuth] ✓ Integration saved. Redirecting to /config?gsc=connected');

    const response = NextResponse.redirect(new URL('/config?gsc=connected', request.url));
    response.cookies.delete('google_oauth_state');
    return response;
  } catch (err) {
    console.error('[GSC OAuth] Callback error:', err);
    return NextResponse.redirect(new URL('/config?gsc=error&reason=server', request.url));
  }
}
