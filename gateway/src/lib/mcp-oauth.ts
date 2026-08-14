import type {
  OAuthClientProvider,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { prisma } from './database.js';
import { encrypt, decrypt } from './encryption.js';

/**
 * OAuth 2.1 client provider for remote MCP servers, backed by the Integration row.
 *
 * The interactive half of the flow (discovery, Dynamic Client Registration, PKCE,
 * consent screen) happens in the web app — see web/app/api/mcp/oauth/*. By the time
 * the gateway connects, the row already holds a client registration and a token set.
 *
 * What this provider adds is the *non-interactive* half: the SDK transport reads
 * `tokens()` on connect, refreshes via the stored refresh token when the access
 * token expires, and calls `saveTokens()` with the new set — which we persist back,
 * encrypted, so the refresh survives a gateway restart.
 *
 * `redirectToAuthorization()` cannot work here: the gateway has no browser and no
 * user. It throws `ReauthRequiredError`, which the bridge turns into a visible
 * "reconnect this app" status instead of a silent dead connection.
 */

export class ReauthRequiredError extends Error {
  constructor(public readonly slug: string) {
    super(`MCP ${slug}: autorisation expirée — reconnectez l'app depuis la page Apps.`);
    this.name = 'ReauthRequiredError';
  }
}

/** OAuth state persisted inside the Integration credentials JSON, under `oauth`. */
export interface McpOAuthState {
  /** Authorization server issuer — the base URL token/refresh requests go to. */
  authServerUrl: string;
  clientInformation: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  /** RFC 8707 resource indicator, pinned at authorization time. */
  resource?: string;
  scope?: string;
}

const CLIENT_METADATA: OAuthClientMetadata = {
  client_name: 'Armada',
  redirect_uris: [],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_post',
};

export class IntegrationOAuthProvider implements OAuthClientProvider {
  private tokenState?: OAuthTokens;

  constructor(
    private readonly slug: string,
    /** Integration row id — updates are keyed by id, never by platform. */
    private readonly integrationId: string,
    private readonly oauthState: McpOAuthState
  ) {
    this.tokenState = oauthState.tokens;
  }

  get redirectUrl(): string | undefined {
    // Set at authorization time by the web app; unused for refresh.
    return undefined;
  }

  get clientMetadata(): OAuthClientMetadata {
    return CLIENT_METADATA;
  }

  clientInformation(): OAuthClientInformationMixed {
    return this.oauthState.clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this.tokenState;
  }

  /** Persist refreshed tokens back into the encrypted Integration credentials. */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.tokenState = tokens;
    this.oauthState.tokens = tokens;

    const row = await prisma.integration.findUnique({
      where: { id: this.integrationId },
      select: { credentials: true },
    });
    if (!row) return;

    const encrypted = (row.credentials as any)?.encrypted;
    if (!encrypted) return;

    const config = JSON.parse(decrypt(encrypted));
    config.oauth = { ...(config.oauth ?? {}), tokens };

    await prisma.integration.update({
      where: { id: this.integrationId },
      data: { credentials: { encrypted: encrypt(JSON.stringify(config)) } },
    });
  }

  redirectToAuthorization(): never {
    throw new ReauthRequiredError(this.slug);
  }

  saveCodeVerifier(): void {
    // Authorization-code exchange happens in the web app, never here.
    throw new ReauthRequiredError(this.slug);
  }

  codeVerifier(): never {
    throw new ReauthRequiredError(this.slug);
  }

  /** Called when the server rejects our credentials — drop them so the UI re-prompts. */
  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope !== 'tokens' && scope !== 'all') return;
    this.tokenState = undefined;
    this.oauthState.tokens = undefined;
  }
}
