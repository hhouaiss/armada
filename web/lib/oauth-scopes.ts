/**
 * OAuth consent screens let the user approve a subset of what was requested
 * (Google shows a checkbox per scope). Recording the *requested* scopes as
 * `grantedScopes` therefore makes the DB claim access the token does not have,
 * which surfaces later as an opaque `The caller does not have permission` from
 * the provider with nothing in our own data to explain it.
 *
 * Always derive granted scopes from the token response.
 */

/** Scopes the provider actually granted, parsed from a token response. */
export function parseGrantedScopes(
  tokenScope: unknown,
  requestedScopes: string[]
): { granted: string[]; missing: string[]; partial: boolean } {
  // RFC 6749: `scope` is space-delimited. Absent means "identical to requested".
  const granted =
    typeof tokenScope === 'string' && tokenScope.trim()
      ? tokenScope.trim().split(/\s+/)
      : [...requestedScopes];

  const grantedSet = new Set(granted);
  const missing = requestedScopes.filter((scope) => !grantedSet.has(scope));

  return { granted, missing, partial: missing.length > 0 };
}

/**
 * Scopes a connector declares that its live connection did not receive.
 *
 * Returns [] when we have nothing to compare against — a connection with no
 * recorded scopes (secret-auth connectors, or rows created before scopes were
 * tracked) must not be reported as missing everything.
 */
export function missingConnectionScopes(
  declaredScopes: string[] | undefined,
  grantedScopes: string[] | undefined
): string[] {
  if (!declaredScopes?.length || !grantedScopes?.length) return [];
  const grantedSet = new Set(grantedScopes);
  return declaredScopes.filter((scope) => !grantedSet.has(scope));
}

/** `https://www.googleapis.com/auth/gmail.compose` → `gmail.compose` */
export function shortScopeLabel(scope: string): string {
  return scope.replace(/^https?:\/\/[^/]+\/auth\//, '').replace(/^https?:\/\//, '');
}
