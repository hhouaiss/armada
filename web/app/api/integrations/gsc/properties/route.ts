import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken, decryptToken } from '@/lib/shopify';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

async function getDefaultUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({ where: { email: 'demo@storeteam.ai' } });
  return user?.id ?? null;
}

async function getDecryptedCredentials() {
  const userId = await getDefaultUserId();
  if (!userId) return null;

  const integration = await prisma.integration.findUnique({
    where: {
      userId_platform: {
        userId,
        platform: 'google-search-console',
      },
    },
  });

  if (!integration || !integration.isActive) return null;

  const encrypted = (integration.credentials as any)?.encrypted;
  if (!encrypted) return null;

  const decrypted = decryptToken(encrypted);
  return JSON.parse(decrypted);
}

async function refreshAccessToken(credentials: any) {
  if (!credentials.refresh_token) {
    throw new Error('No refresh token available');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Google access token');
  }

  const tokens = await response.json();

  const updated = {
    ...credentials,
    access_token: tokens.access_token,
    expiry_date: Date.now() + (tokens.expires_in * 1000),
  };

  // Persist updated tokens
  const encryptedCredentials = encryptToken(JSON.stringify(updated));
  const userId = await getDefaultUserId();
  if (userId) {
    await prisma.integration.update({
      where: {
        userId_platform: { userId, platform: 'google-search-console' },
      },
      data: {
        credentials: { encrypted: encryptedCredentials },
        lastUsed: new Date(),
      },
    });
  }

  return updated;
}

async function getValidAccessToken(credentials: any) {
  const isExpired = credentials.expiry_date && Date.now() >= credentials.expiry_date - 60000;
  if (isExpired) {
    return refreshAccessToken(credentials);
  }
  return credentials;
}

// GET /api/integrations/gsc/properties - List available GSC properties
export async function GET() {
  try {
    let credentials = await getDecryptedCredentials();
    if (!credentials) {
      return NextResponse.json({ error: 'Google Search Console not connected' }, { status: 401 });
    }

    credentials = await getValidAccessToken(credentials);

    const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('GSC sites API error:', err);
      return NextResponse.json({ error: 'Failed to fetch GSC properties' }, { status: 502 });
    }

    const data = await response.json();
    const sites = (data.siteEntry || []).map((site: any) => ({
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel,
    }));

    return NextResponse.json({
      sites,
      selectedProperty: credentials.selected_property || null,
    });
  } catch (err) {
    console.error('GSC properties fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/integrations/gsc/properties - Save selected property
export async function POST(request: NextRequest) {
  try {
    const { siteUrl } = await request.json();
    if (!siteUrl) {
      return NextResponse.json({ error: 'siteUrl is required' }, { status: 400 });
    }

    let credentials = await getDecryptedCredentials();
    if (!credentials) {
      return NextResponse.json({ error: 'Google Search Console not connected' }, { status: 401 });
    }

    const updated = { ...credentials, selected_property: siteUrl };
    const encryptedCredentials = encryptToken(JSON.stringify(updated));
    const userId = await getDefaultUserId();
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 500 });
    }

    await prisma.integration.update({
      where: {
        userId_platform: { userId, platform: 'google-search-console' },
      },
      data: {
        credentials: { encrypted: encryptedCredentials },
        lastUsed: new Date(),
      },
    });

    return NextResponse.json({ ok: true, selected_property: siteUrl });
  } catch (err) {
    console.error('GSC property save error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
