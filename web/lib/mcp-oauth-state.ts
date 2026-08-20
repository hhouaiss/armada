import crypto from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * Short-lived state carried across the MCP OAuth redirect.
 *
 * The PKCE verifier and the freshly registered client credentials only exist
 * between /start and /callback, so they live in an HMAC-signed httpOnly cookie
 * rather than the database — nothing to clean up if the user abandons the flow.
 */

export const MCP_OAUTH_COOKIE = 'armada_mcp_oauth';
const MAX_AGE_MS = 15 * 60 * 1000;

export interface McpOAuthPending {
  slug: string;
  serverUrl: string;
  authServerUrl: string;
  clientInformation: OAuthClientInformationFull;
  codeVerifier: string;
  redirectUri: string;
  resource?: string;
  scope?: string;
  category?: string;
  /** Prisma user id — the row is written for this user on callback. */
  userId: string;
  storeId: string;
  label: string;
  stateId: string;
  nonce: string;
  ts: number;
}

function hmac(payload: string): string {
  return crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY!)
    .update(payload)
    .digest('hex');
}

export function signPending(pending: McpOAuthPending): string {
  const payload = Buffer.from(JSON.stringify(pending)).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function verifyPending(cookie: string | undefined): McpOAuthPending | null {
  if (!cookie) return null;
  const [payload, sig] = cookie.split('.');
  if (!payload || !sig) return null;

  const expected = hmac(payload);
  // Length check first: timingSafeEqual throws on mismatched buffer sizes.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const pending = JSON.parse(Buffer.from(payload, 'base64url').toString()) as McpOAuthPending;
    if (Date.now() - pending.ts > MAX_AGE_MS) return null;
    return pending;
  } catch {
    return null;
  }
}
