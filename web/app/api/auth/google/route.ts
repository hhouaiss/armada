import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerClient } from '@supabase/ssr';

import { CATALOG } from '@/lib/mcp-catalog';

const BASE_SCOPES = ['https://www.googleapis.com/auth/userinfo.email'];

/**
 * Scopes par app. Google Search Console reste servi par les tools natifs du
 * gateway ; les autres apps Google déclarent leurs scopes dans le catalogue.
 */
function scopesFor(slug: string): string[] | null {
  if (slug === 'google-search-console') {
    return ['https://www.googleapis.com/auth/webmasters.readonly'];
  }
  const app = CATALOG.find((a) => a.slug === slug);
  return app?.mcp?.googleScopes ?? null;
}

function createSignedState(userId: string, slug: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now().toString();
  const payload = `${userId}|${nonce}|${ts}|${slug}`;
  const sig = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY!)
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

export async function GET(request: NextRequest) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 });
  }

  // Require an authenticated Supabase session
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
  if (!user) {
    return NextResponse.redirect(
      new URL('/login?next=' + encodeURIComponent('/integrations'), request.url)
    );
  }

  const origin = new URL(request.url).origin;
  const REDIRECT_URI = `${origin}/api/auth/google/callback`;

  // Défaut rétrocompatible : sans `slug`, c'est l'ancien flow Search Console.
  const slug = request.nextUrl.searchParams.get('slug') || 'google-search-console';
  const scopes = scopesFor(slug);
  if (!scopes) {
    return NextResponse.redirect(`${origin}/integrations?mcp=error&slug=${slug}&reason=unknown_google_app`);
  }

  const state = createSignedState(user.id, slug);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', [...scopes, ...BASE_SCOPES].join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'select_account consent');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
