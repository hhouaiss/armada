import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { encryptToken, decryptToken } from '@/lib/shopify';
import { CATALOG } from '@/lib/mcp-catalog';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

function verifyState(state: string): { userId: string; slug: string } | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString();
    const parts = decoded.split('|');
    if (parts.length !== 5) return null;

    const [userId, nonce, ts, slug, sig] = parts;
    const payload = `${userId}|${nonce}|${ts}|${slug}`;
    const expectedSig = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY!)
      .update(payload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return null;
    }

    // Expire after 15 minutes
    if (Date.now() - parseInt(ts) > 15 * 60 * 1000) return null;

    return { userId, slug };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const REDIRECT_URI = `${origin}/api/auth/google/callback`;
  const settings = `${origin}/integrations`;

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Ignore stray hits (no params — can happen from other OAuth flows)
  if (!code && !error && !state) {
    return NextResponse.redirect(settings);
  }

  if (error) {
    return NextResponse.redirect(`${settings}?gsc=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settings}?gsc=error&reason=invalid_request`);
  }

  // Verify HMAC-signed state — no cookie dependency
  const stateData = verifyState(state);
  if (!stateData) {
    console.error('[GSC OAuth] Invalid or expired state');
    return NextResponse.redirect(`${settings}?gsc=error&reason=state`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[GSC OAuth] Token exchange failed:', tokenRes.status, body);
      return NextResponse.redirect(`${settings}?gsc=error&reason=token`);
    }

    const tokens = await tokenRes.json();

    // Resolve the Prisma user from the Supabase auth ID embedded in state
    const user = await prisma.user.findFirst({
      where: { supabase_auth_id: stateData.userId },
    });
    if (!user) {
      console.error('[GSC OAuth] No Prisma user for supabase_auth_id:', stateData.userId);
      return NextResponse.redirect(`${settings}?gsc=error&reason=user_not_found`);
    }

    const { slug } = stateData;
    const app = CATALOG.find((a) => a.slug === slug);
    // Search Console garde ses tools natifs (platform brute) ; les autres apps
    // Google sont des serveurs MCP stdio (platform `mcp:<slug>`).
    const platform = slug === 'google-search-console' ? slug : `mcp:${slug}`;

    // Google n'émet un refresh_token qu'au premier consentement — on conserve
    // celui déjà stocké si cet échange n'en renvoie pas.
    const existing = await prisma.integration.findUnique({
      where: { userId_platform: { userId: user.id, platform } },
    });
    let existingCreds: any = {};
    if (existing) {
      try {
        existingCreds = JSON.parse(decryptToken((existing.credentials as { encrypted: string }).encrypted));
      } catch { /* start fresh */ }
    }

    const refreshToken =
      tokens.refresh_token
      ?? existingCreds.refresh_token
      ?? existingCreds.googleOAuth?.refresh_token
      ?? null;

    if (!refreshToken) {
      // Sans refresh token, le gateway ne pourra pas écrire d'ADC exploitable.
      return NextResponse.redirect(`${settings}?mcp=error&slug=${slug}&reason=no_refresh_token`);
    }

    const google = {
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_type: tokens.token_type,
      expiry_date: Date.now() + tokens.expires_in * 1000,
    };

    const config = slug === 'google-search-console'
      ? { ...google, selected_property: existingCreds.selected_property ?? null }
      : {
          command: app?.mcp?.command,
          args: app?.mcp?.args ?? [],
          category: app?.mcp?.category ?? 'mcp',
          ...(app?.mcp?.allowedTools ? { allowedTools: app.mcp.allowedTools } : {}),
          googleOAuth: google,
        };

    const credentials = { encrypted: encryptToken(JSON.stringify(config)) };

    await prisma.integration.upsert({
      where: { userId_platform: { userId: user.id, platform } },
      create: { userId: user.id, platform, credentials, isActive: true },
      update: { credentials, isActive: true, updatedAt: new Date() },
    });

    return slug === 'google-search-console'
      ? NextResponse.redirect(`${settings}?gsc=connected`)
      : NextResponse.redirect(`${settings}?mcp=connected&slug=${slug}`);
  } catch (err) {
    console.error('[GSC OAuth] Callback error:', err);
    return NextResponse.redirect(`${settings}?gsc=error&reason=server`);
  }
}
