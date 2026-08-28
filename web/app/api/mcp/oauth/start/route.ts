import { NextRequest, NextResponse } from 'next/server';
import {
  discoverOAuthServerInfo,
  registerClient,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ensureCuratedConnectors } from '@/lib/connector-catalog';
import { MCP_OAUTH_COOKIE, signPending } from '@/lib/mcp-oauth-state';
import crypto from 'node:crypto';

/**
 * Step 1 of the "connect an app in one click" flow, for any remote MCP server
 * that speaks OAuth 2.1 — the Claude-Cowork-style path, where the user types no
 * secret at all.
 *
 * RFC 9728 discovery finds the authorization server behind the MCP endpoint,
 * RFC 7591 Dynamic Client Registration mints a client on the fly (so a new app
 * needs no manual credential setup), and PKCE protects the code exchange.
 *
 * GET /api/mcp/oauth/start?slug=notion
 *   — or ?slug=<custom>&url=<mcp endpoint> for a server outside the catalog.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const back = (params: string) => NextResponse.redirect(`${origin}/integrations?${params}`);

  const user = await getCurrentUser(request);
  if (!user?.id) {
    return NextResponse.redirect(
      `${origin}/login?next=${encodeURIComponent('/integrations')}`
    );
  }

  await ensureCuratedConnectors(prisma);

  // Reconnect path: the connection itself decides connector, store and label, so
  // a re-authorization refreshes the existing account instead of duplicating it.
  const reconnectId = request.nextUrl.searchParams.get('connectionId');
  const existing = reconnectId
    ? await prisma.appConnection.findFirst({ where: { id: reconnectId, userId: user.id, store: { userId: user.id } }, include: { connector: true } })
    : null;
  if (reconnectId && !existing) return back('mcp=error&reason=connection_not_found');

  const slug = existing?.connector.slug ?? request.nextUrl.searchParams.get('slug');
  const storeId = existing?.storeId ?? (request.nextUrl.searchParams.get('storeId') || '');
  if (!slug) return back('mcp=error&reason=missing_slug');
  const store = await prisma.store.findFirst({ where: { id: storeId, userId: user.id }, select: { id: true } });
  const definition = existing?.connector ?? await prisma.connectorDefinition.findFirst({ where: { slug, isActive: true } });
  if (!store || !definition) return back('mcp=error&reason=invalid_connector_or_store');
  const serverUrl = definition.endpoint ?? request.nextUrl.searchParams.get('url') ?? undefined;
  if (!serverUrl) return back(`mcp=error&reason=unknown_server&slug=${slug}`);

  const redirectUri = `${origin}/api/mcp/oauth/callback`;

  try {
    const info = await discoverOAuthServerInfo(serverUrl);

    // Scope selection: prefer what the resource advertises, else the catalog hint.
    const scope =
      info.resourceMetadata?.scopes_supported?.join(' ') ?? undefined;

    const clientMetadata: OAuthClientMetadata = {
      client_name: 'Armada',
      client_uri: origin,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope,
    };

    const clientInformation = await registerClient(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientMetadata,
      scope,
    });

    // RFC 8707: bind the token to this specific MCP server.
    const resource = info.resourceMetadata?.resource
      ? new URL(info.resourceMetadata.resource)
      : new URL(serverUrl);

    const { authorizationUrl, codeVerifier } = await startAuthorization(
      info.authorizationServerUrl,
      { metadata: info.authorizationServerMetadata, clientInformation, redirectUrl: redirectUri, scope, resource }
    );

    const nonce = crypto.randomBytes(32).toString('base64url');
    const requestedAgentIds = (request.nextUrl.searchParams.get('agentIds') || '').split(',').filter(Boolean);
    const validAgents = await prisma.agent.findMany({ where: { id: { in: requestedAgentIds }, storeId }, select: { id: true } });
    const oauthState = await prisma.connectorOAuthState.create({ data: {
      nonceHash: crypto.createHash('sha256').update(nonce).digest('hex'), userId: user.id,
      storeId, connectorSlug: slug, connectionId: existing?.id ?? null,
      label: (existing?.label || request.nextUrl.searchParams.get('label') || definition.name).slice(0, 80),
      scopes: scope ? scope.split(' ') : [], agentIds: validAgents.map((agent) => agent.id),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    } });
    const response = NextResponse.redirect(authorizationUrl.toString());
    response.cookies.set(
      MCP_OAUTH_COOKIE,
      signPending({
        slug,
        serverUrl,
        authServerUrl: info.authorizationServerUrl,
        clientInformation,
        codeVerifier,
        redirectUri,
        resource: resource.href,
        scope,
        category: definition.category,
        userId: user.id,
        storeId,
        label: oauthState.label,
        connectionId: existing?.id,
        stateId: oauthState.id,
        nonce,
        ts: Date.now(),
      }),
      { httpOnly: true, secure: origin.startsWith('https'), sameSite: 'lax', path: '/', maxAge: 900 }
    );
    return response;
  } catch (err: any) {
    console.error('[MCP OAuth] start failed:', slug, err);
    return back(
      `mcp=error&slug=${slug}&reason=${encodeURIComponent(err?.message ?? 'discovery_failed')}`
    );
  }
}
