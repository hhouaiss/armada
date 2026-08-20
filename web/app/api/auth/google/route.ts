import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CURATED_CONNECTORS } from '@/lib/connector-catalog';

function sign(payload: string) {
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY!).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.redirect(new URL('/login?next=/integrations', request.url));
  if (!process.env.GOOGLE_CLIENT_ID) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 });
  const slug = request.nextUrl.searchParams.get('slug') || '';
  const storeId = request.nextUrl.searchParams.get('storeId') || '';
  const connector = CURATED_CONNECTORS.find((item) => item.slug === slug && item.authMode === 'oauth-google');
  const store = await prisma.store.findFirst({ where: { id: storeId, userId: user.id }, select: { id: true } });
  if (!connector || !store) return NextResponse.redirect(new URL('/integrations?mcp=error&reason=invalid_connector_or_store', request.url));

  const requested = (request.nextUrl.searchParams.get('scopes') || '').split(',').filter(Boolean);
  const allowed = new Set(connector.scopes || []);
  const scopes = requested.length ? requested.filter((scope) => allowed.has(scope)) : [...allowed];
  if (!scopes.length) return NextResponse.redirect(new URL('/integrations?mcp=error&reason=no_scopes', request.url));
  const label = (request.nextUrl.searchParams.get('label') || connector.name).slice(0, 80);
  const requestedAgentIds = (request.nextUrl.searchParams.get('agentIds') || '').split(',').filter(Boolean);
  const validAgents = await prisma.agent.findMany({ where: { id: { in: requestedAgentIds }, storeId }, select: { id: true } });
  const origin = request.nextUrl.origin;
  const nonce = crypto.randomBytes(32).toString('base64url');
  const oauthState = await prisma.connectorOAuthState.create({ data: {
    nonceHash: crypto.createHash('sha256').update(nonce).digest('hex'), userId: user.id,
    storeId, connectorSlug: slug, label, scopes,
    agentIds: validAgents.map((agent) => agent.id),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  } });
  const state = sign(`${oauthState.id}:${nonce}`);
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  auth.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', [...new Set([...scopes, 'openid', 'email'])].join(' '));
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'select_account consent');
  auth.searchParams.set('include_granted_scopes', 'false');
  auth.searchParams.set('state', state);
  return NextResponse.redirect(auth);
}
