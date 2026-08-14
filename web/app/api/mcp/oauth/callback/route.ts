import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/shopify';
import { CATALOG } from '@/lib/mcp-catalog';
import { MCP_OAUTH_COOKIE, verifyPending } from '@/lib/mcp-oauth-state';

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

  try {
    const tokens = await exchangeAuthorization(pending.authServerUrl, {
      clientInformation: pending.clientInformation,
      authorizationCode: code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
      resource: pending.resource ? new URL(pending.resource) : undefined,
    });

    const app = CATALOG.find((a) => a.slug === pending.slug);
    const config = {
      url: pending.serverUrl,
      category: pending.category ?? 'mcp',
      ...(app?.mcp?.allowedTools ? { allowedTools: app.mcp.allowedTools } : {}),
      oauth: {
        authServerUrl: pending.authServerUrl,
        clientInformation: pending.clientInformation,
        resource: pending.resource,
        scope: pending.scope,
        tokens,
      },
    };

    const platform = `mcp:${pending.slug}`;
    const credentials = { encrypted: encryptToken(JSON.stringify(config)) };

    await prisma.integration.upsert({
      where: { userId_platform: { userId: pending.userId, platform } },
      create: { userId: pending.userId, platform, credentials, isActive: true },
      update: { credentials, isActive: true, updatedAt: new Date() },
    });

    // `mcp=connected` makes the Apps page trigger a gateway sync on load, so the
    // tools reach the agents without waiting for a restart.
    return back(`mcp=connected&slug=${pending.slug}`);
  } catch (err: any) {
    console.error('[MCP OAuth] callback failed:', pending.slug, err);
    return back(
      `mcp=error&slug=${pending.slug}&reason=${encodeURIComponent(err?.message ?? 'token_exchange_failed')}`
    );
  }
}
