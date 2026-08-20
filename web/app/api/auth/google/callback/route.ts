import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/shopify';
import { ensureCuratedConnectors } from '@/lib/connector-catalog';
import { syncConnectorGateway } from '@/lib/connector-gateway';

function verify(state: string): { id: string; nonce: string } | null {
  try {
    const [encoded, signature] = state.split('.');
    const expected = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY!).update(encoded).digest('base64url');
    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const [id, nonce] = Buffer.from(encoded, 'base64url').toString().split(':');
    return id && nonce ? { id, nonce } : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const back = (query: string) => NextResponse.redirect(new URL(`/integrations?${query}`, request.url));
  if (request.nextUrl.searchParams.get('error')) return back('mcp=denied');
  const code = request.nextUrl.searchParams.get('code');
  const signedState = verify(request.nextUrl.searchParams.get('state') || '');
  if (!code || !signedState) return back('mcp=error&reason=invalid_state');
  const nonceHash = crypto.createHash('sha256').update(signedState.nonce).digest('hex');
  const claimed = await prisma.connectorOAuthState.updateMany({
    where: { id: signedState.id, nonceHash, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) return back('mcp=error&reason=expired_or_replayed_state');
  const state = await prisma.connectorOAuthState.findUnique({ where: { id: signedState.id } });
  if (!state) return back('mcp=error&reason=invalid_state');
  const store = await prisma.store.findFirst({ where: { id: state.storeId, userId: state.userId }, select: { id: true } });
  if (!store) return back('mcp=error&reason=store_not_found');

  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code, grant_type: 'authorization_code', redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) return back('mcp=error&reason=token_exchange');
  const tokens: any = await tokenResponse.json();
  const identityResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const identity: any = identityResponse.ok ? await identityResponse.json() : {};
  if (!tokens.refresh_token) return back('mcp=error&reason=no_refresh_token');

  await ensureCuratedConnectors(prisma);
  const definition = await prisma.connectorDefinition.findUnique({ where: { slug: state.connectorSlug } });
  if (!definition) return back('mcp=error&reason=connector_not_found');
  let label = state.label || identity.email || definition.name;
  const duplicate = await prisma.appConnection.count({ where: { storeId: state.storeId, connectorDefinitionId: definition.id, label } });
  if (duplicate) label = `${label} ${duplicate + 1}`;
  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || 'Bearer',
    expiry_date: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
  };
  const grantedScopes = Array.isArray(state.scopes) ? state.scopes.map(String) : [];
  const connection = await prisma.appConnection.create({ data: {
    userId: state.userId, storeId: state.storeId, connectorDefinitionId: definition.id,
    label: String(label).slice(0, 80), accountEmail: identity.email || null,
    credentials: { encrypted: encryptToken(JSON.stringify(credentials)) }, grantedScopes,
    status: 'active', lastConnectedAt: new Date(),
  } });
  const agentIds = Array.isArray(state.agentIds) ? state.agentIds.map(String) : [];
  if (agentIds.length) {
    await prisma.agentConnectionGrant.createMany({ data: agentIds.map((agentId) => ({ agentId, connectionId: connection.id })), skipDuplicates: true });
  }
  await prisma.connectorAuditEvent.create({ data: { storeId: state.storeId, connectionId: connection.id, eventType: 'oauth_connected', status: 'completed', summary: { connector: state.connectorSlug, scopes: grantedScopes } } });
  await syncConnectorGateway().catch(() => null);
  return back(`mcp=connected&slug=${encodeURIComponent(state.connectorSlug)}&connectionId=${connection.id}`);
}
