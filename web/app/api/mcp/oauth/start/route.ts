import { NextRequest, NextResponse } from 'next/server';
import {
  discoverOAuthServerInfo,
  registerClient,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getCurrentUser } from '@/lib/auth';
import { CATALOG } from '@/lib/mcp-catalog';
import { MCP_OAUTH_COOKIE, signPending } from '@/lib/mcp-oauth-state';

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

  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) return back('mcp=error&reason=missing_slug');

  const app = CATALOG.find((a) => a.slug === slug);
  const serverUrl = app?.mcp?.url ?? request.nextUrl.searchParams.get('url') ?? undefined;
  if (!serverUrl) return back(`mcp=error&reason=unknown_server&slug=${slug}`);

  const redirectUri = `${origin}/api/mcp/oauth/callback`;

  try {
    const info = await discoverOAuthServerInfo(serverUrl);

    // Scope selection: prefer what the resource advertises, else the catalog hint.
    const scope =
      info.resourceMetadata?.scopes_supported?.join(' ') ?? app?.mcp?.scope ?? undefined;

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
        category: app?.mcp?.category,
        userId: user.id,
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
