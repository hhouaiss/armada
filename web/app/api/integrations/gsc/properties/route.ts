import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '@/lib/prisma';
import { encryptToken, decryptToken } from '@/lib/shopify';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

async function getAuthenticatedUser(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return prisma.user.findFirst({ where: { supabase_auth_id: user.id } });
}

async function getCredentials(userId: string) {
  const integration = await prisma.integration.findUnique({
    where: { userId_platform: { userId, platform: 'google-search-console' } },
  });
  if (!integration?.isActive) return null;

  const encrypted = (integration.credentials as any)?.encrypted;
  if (!encrypted) return null;

  return JSON.parse(decryptToken(encrypted));
}

async function getValidCredentials(userId: string) {
  let creds = await getCredentials(userId);
  if (!creds) return null;

  const isExpired = creds.expiry_date && Date.now() >= creds.expiry_date - 60000;
  if (!isExpired) return creds;

  if (!creds.refresh_token) throw new Error('No refresh token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) throw new Error('Token refresh failed');

  const tokens = await res.json();
  creds = { ...creds, access_token: tokens.access_token, expiry_date: Date.now() + tokens.expires_in * 1000 };

  await prisma.integration.update({
    where: { userId_platform: { userId, platform: 'google-search-console' } },
    data: { credentials: { encrypted: encryptToken(JSON.stringify(creds)) }, lastUsed: new Date() },
  });

  return creds;
}

// GET /api/integrations/gsc/properties — list available GSC properties
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const creds = await getValidCredentials(user.id);
    if (!creds) return NextResponse.json({ error: 'Google Search Console not connected' }, { status: 401 });

    const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${creds.access_token}` },
    });

    if (!res.ok) {
      console.error('GSC sites API error:', await res.text());
      return NextResponse.json({ error: 'Failed to fetch GSC properties' }, { status: 502 });
    }

    const data = await res.json();
    const sites = (data.siteEntry || []).map((site: any) => ({
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel,
    }));

    return NextResponse.json({ sites, selectedProperty: creds.selected_property ?? null });
  } catch (err) {
    console.error('GSC properties fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/integrations/gsc/properties — save selected property
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { siteUrl } = await request.json();
    if (!siteUrl) return NextResponse.json({ error: 'siteUrl is required' }, { status: 400 });

    const creds = await getCredentials(user.id);
    if (!creds) return NextResponse.json({ error: 'Google Search Console not connected' }, { status: 401 });

    const updated = { ...creds, selected_property: siteUrl };
    await prisma.integration.update({
      where: { userId_platform: { userId: user.id, platform: 'google-search-console' } },
      data: { credentials: { encrypted: encryptToken(JSON.stringify(updated)) }, lastUsed: new Date() },
    });

    return NextResponse.json({ ok: true, selected_property: siteUrl });
  } catch (err) {
    console.error('GSC property save error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
