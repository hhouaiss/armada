import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export async function GET(request: NextRequest) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID is not configured in .env.local' },
      { status: 500 }
    );
  }

  // Derive redirect URI from the actual incoming request — this is always correct
  const origin = new URL(request.url).origin;
  const REDIRECT_URI = `${origin}/api/auth/google/callback`;

  console.log('[GSC OAuth] ─────────────────────────────────────');
  console.log('[GSC OAuth] Initiating OAuth flow');
  console.log('[GSC OAuth] redirect_uri:', REDIRECT_URI);
  console.log('[GSC OAuth] ↑ This URL must be registered in Google Cloud Console');
  console.log('[GSC OAuth] ─────────────────────────────────────');

  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
