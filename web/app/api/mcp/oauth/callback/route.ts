import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/shopify';
import { MCP_OAUTH_COOKIE, verifyPending } from '@/lib/mcp-oauth-state';
import { parseGrantedScopes } from '@/lib/oauth-scopes';
import crypto from 'node:crypto';
import { syncConnectorGateway } from '@/lib/connector-gateway';

/**
 * Step 2: exchange the authorization code and store the connection.
 *
 * The resulting Integration row is the same `mcp:<slug>` shape the gateway
 * already consumes — only the auth material differs: an `oauth` block instead of
 * a static Authorization header. The gateway refreshes those tokens on its own
 * from here on (see gateway/src/lib/mcp-oauth.ts).
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const back = (params: string) => {
    const res = NextResponse.redirect(`${origin}/integrations?${params}`);
    res.cookies.delete(MCP_OAUTH_COOKIE);
    return res;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const oauthError = params.get('error');

  const pending = verifyPending(request.cookies.get(MCP_OAUTH_COOKIE)?.value);
  if (!pending) return back('mcp=error&reason=state_expired');

  if (oauthError) return back(`mcp=denied&slug=${pending.slug}`);
  if (!code) return back(`mcp=error&slug=${pending.slug}&reason=missing_code`);

  const claimed = await prisma.connectorOAuthState.updateMany({
    where: {
      id: pending.stateId, userId: pending.userId, storeId: pending.storeId,
      nonceHash: crypto.createHash('sha256').update(pending.nonce).digest('hex'),
      consumedAt: null, expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) return back(`mcp=error&slug=${pending.slug}&reason=expired_or_replayed_state`);

  try {
    const tokens = await exchangeAuthorization(pending.authServerUrl, {
      clientInformation: pending.clientInformation,
      authorizationCode: code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
      resource: pending.resource ? new URL(pending.resource) : undefined,
    });

    const config = {
      oauth: {
        authServerUrl: pending.authServerUrl,
        clientInformation: pending.clientInformation,
        resource: pending.resource,
        scope: pending.scope,
        // Needed by the gateway's refresh: the SDK skips the refresh_token grant
        // when the provider exposes no redirect URI.
        redirectUri: pending.redirectUri,
        tokens,
      },
    };

    const credentials = { encrypted: encryptToken(JSON.stringify(config)) };
    // pending.scope is what we asked for; (tokens as any).scope is what the
    // authorization server actually issued.
    const requestedScopes = pending.scope?.split(' ').filter(Boolean) || [];
    const { granted: grantedScopes, missing: missingScopes } = parseGrantedScopes(
      (tokens as any)?.scope,
      requestedScopes
    );
    const definition = await prisma.connectorDefinition.findUnique({ where: { slug: pending.slug } });
    const store = await prisma.store.findFirst({ where: { id: pending.storeId, userId: pending.userId } });
    if (!definition || !store) return back(`mcp=error&slug=${pending.slug}&reason=ownership`);
    let label = pending.label;
    const duplicate = await prisma.appConnection.count({ where: { storeId: pending.storeId, connectorDefinitionId: definition.id, label } });
    if (duplicate) label = `${label} ${duplicate + 1}`;
    const connection = await prisma.appConnection.create({ data: {
      userId: pending.userId, storeId: pending.storeId, connectorDefinitionId: definition.id,
      label, credentials, grantedScopes, status: 'active', lastConnectedAt: new Date(),
    } });
    const oauthState = await prisma.connectorOAuthState.findUnique({ where: { id: pending.stateId } });
    const agentIds = Array.isArray(oauthState?.agentIds) ? oauthState.agentIds.map(String) : [];
    if (agentIds.length) {
      await prisma.agentConnectionGrant.createMany({ data: agentIds.map((agentId) => ({ agentId, connectionId: connection.id })), skipDuplicates: true });
    }
    await prisma.connectorAuditEvent.create({ data: { storeId: pending.storeId, connectionId: connection.id, eventType: 'oauth_connected', status: 'completed', summary: { connector: pending.slug, scopes: grantedScopes, requestedScopes, missingScopes } } });
    await syncConnectorGateway().catch(() => null);

    // `mcp=connected` makes the Apps page trigger a gateway sync on load, so the
    // tools reach the agents without waiting for a restart.
    return back(`mcp=connected&slug=${pending.slug}&connectionId=${connection.id}`);
  } catch (err: any) {
    console.error('[MCP OAuth] callback failed:', pending.slug, err);
    return back(
      `mcp=error&slug=${pending.slug}&reason=${encodeURIComponent(err?.message ?? 'token_exchange_failed')}`
    );
  }
}
