import { writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Materializes Google Application Default Credentials for stdio MCP servers.
 *
 * Python/Node Google clients (google-auth, google-auth-library) only read
 * credentials from a *file* pointed at by GOOGLE_APPLICATION_CREDENTIALS — they
 * take no access token from the environment. Since our OAuth flow yields a
 * refresh token rather than a service-account key, we write the ADC
 * "authorized_user" form, which those libraries accept and refresh on their own.
 *
 * That self-refresh matters: a stdio subprocess inherits its environment once at
 * spawn time, so an access token injected as an env var would go stale an hour
 * later with no way to update it. A refresh token in an ADC file does not.
 *
 * The file lands in a private per-slug directory under the OS temp dir, mode 0600,
 * and is rewritten on every connect.
 */

export interface GoogleOAuthCredentials {
  refresh_token?: string | null;
  access_token?: string;
  expiry_date?: number;
  /** Optional per-app override; falls back to the platform-wide client. */
  client_id?: string;
  client_secret?: string;
}

export function writeAuthorizedUserAdc(
  slug: string,
  credentials: GoogleOAuthCredentials
): string {
  const clientId = credentials.client_id ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = credentials.client_secret ?? process.env.GOOGLE_CLIENT_SECRET;

  if (!credentials.refresh_token) {
    throw new Error(
      `Google ${slug}: aucun refresh_token stocké — reconnectez l'app (le consentement Google doit être redonné avec access_type=offline).`
    );
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      `Google ${slug}: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans l'environnement du gateway.`
    );
  }

  const dir = join(tmpdir(), 'armada-google-adc');
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const path = join(dir, `${slug.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      type: 'authorized_user',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refresh_token,
    }),
    { mode: 0o600 }
  );
  chmodSync(path, 0o600);

  return path;
}
