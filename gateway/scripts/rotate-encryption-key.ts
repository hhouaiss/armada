/**
 * Incident response for the Railway env-var leak (2026-10-22).
 *
 * Every secret encrypted with ENCRYPTION_KEY lives in five places:
 *   stores.accessToken                    Shopify offline token
 *   llm_api_keys.apiKey                   users' own LLM keys
 *   integrations.credentials.encrypted    legacy integrations (Google, Notion, Telegram, ...)
 *   app_connections.credentials.encrypted MCP connector credentials / OAuth tokens
 *   approval_requests.payload.encryptedCall  pending tool calls
 *
 * Modes (dry run unless --apply is passed):
 *   purge      Drop every encrypted secret. Stores, integrations and connections are
 *              deactivated and must be reconnected; LLM keys are deleted; pending
 *              approvals are expired. Use when the leaked secrets are revoked anyway.
 *   reencrypt  Decrypt with OLD_ENCRYPTION_KEY and re-encrypt with NEW_ENCRYPTION_KEY.
 *              Only useful for secrets that were NOT compromised upstream.
 *
 *   DATABASE_URL=... npx tsx scripts/rotate-encryption-key.ts purge [--apply]
 *   DATABASE_URL=... OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... \
 *     npx tsx scripts/rotate-encryption-key.ts reencrypt [--apply]
 */
import crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';

const mode = process.argv[2];
const apply = process.argv.includes('--apply');
if (mode !== 'purge' && mode !== 'reencrypt') {
  console.error('Usage: rotate-encryption-key.ts <purge|reencrypt> [--apply]');
  process.exit(1);
}

function keyFrom(name: string): Buffer {
  const hex = process.env[name] ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error(`${name} must be 64 hex characters (openssl rand -hex 32)`);
    process.exit(1);
  }
  return Buffer.from(hex, 'hex');
}

// Same format as gateway/src/lib/encryption.ts and web/lib/shopify.ts: "<iv hex>:<ciphertext hex>".
function decryptWith(key: Buffer, text: string): string {
  const [ivHex, ...rest] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return decipher.update(rest.join(':'), 'hex', 'utf8') + decipher.final('utf8');
}

function encryptWith(key: Buffer, text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

const prisma = new PrismaClient();

async function purge() {
  const counts = {
    stores: await prisma.store.count({ where: { accessToken: { not: '' } } }),
    llmApiKeys: await prisma.lLMApiKey.count(),
    integrations: await prisma.integration.count(),
    appConnections: await prisma.appConnection.count(),
    pendingApprovals: await prisma.approvalRequest.count({ where: { status: 'pending' } }),
  };
  console.log('Secrets to purge:', counts);
  if (!apply) return;

  const revokedAt = new Date().toISOString();
  await prisma.$transaction([
    prisma.store.updateMany({ data: { accessToken: '', isActive: false } }),
    prisma.lLMApiKey.deleteMany({}),
    prisma.integration.updateMany({ data: { credentials: {}, isActive: false } }),
    prisma.appConnection.updateMany({
      data: { credentials: {}, status: 'error', lastError: `Credentials revoked after security incident (${revokedAt}). Reconnect required.` },
    }),
    prisma.approvalRequest.updateMany({ where: { status: 'pending' }, data: { status: 'expired', payload: {} } }),
  ]);
  console.log('Purged.');
}

async function reencrypt() {
  const oldKey = keyFrom('OLD_ENCRYPTION_KEY');
  const newKey = keyFrom('NEW_ENCRYPTION_KEY');
  const rotate = (text: string) => encryptWith(newKey, decryptWith(oldKey, text));
  const failures: string[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const s of await prisma.store.findMany({ select: { id: true, accessToken: true } })) {
    if (!s.accessToken) continue;
    try { updates.push(prisma.store.update({ where: { id: s.id }, data: { accessToken: rotate(s.accessToken) } })); }
    catch { failures.push(`stores/${s.id}`); }
  }
  for (const k of await prisma.lLMApiKey.findMany({ select: { id: true, apiKey: true } })) {
    try { updates.push(prisma.lLMApiKey.update({ where: { id: k.id }, data: { apiKey: rotate(k.apiKey) } })); }
    catch { failures.push(`llm_api_keys/${k.id}`); }
  }
  for (const i of await prisma.integration.findMany({ select: { id: true, credentials: true } })) {
    const enc = (i.credentials as any)?.encrypted;
    if (typeof enc !== 'string') continue;
    try { updates.push(prisma.integration.update({ where: { id: i.id }, data: { credentials: { encrypted: rotate(enc) } } })); }
    catch { failures.push(`integrations/${i.id}`); }
  }
  for (const c of await prisma.appConnection.findMany({ select: { id: true, credentials: true } })) {
    const enc = (c.credentials as any)?.encrypted;
    if (typeof enc !== 'string') continue;
    try { updates.push(prisma.appConnection.update({ where: { id: c.id }, data: { credentials: { encrypted: rotate(enc) } } })); }
    catch { failures.push(`app_connections/${c.id}`); }
  }
  for (const a of await prisma.approvalRequest.findMany({ where: { status: 'pending' }, select: { id: true, payload: true } })) {
    const payload = a.payload as any;
    if (typeof payload?.encryptedCall !== 'string') continue;
    try { updates.push(prisma.approvalRequest.update({ where: { id: a.id }, data: { payload: { ...payload, encryptedCall: rotate(payload.encryptedCall) } } })); }
    catch { failures.push(`approval_requests/${a.id}`); }
  }

  console.log(`${updates.length} values to re-encrypt, ${failures.length} not decryptable with OLD_ENCRYPTION_KEY`);
  if (failures.length) console.log(failures.join('\n'));
  if (!apply) return;
  if (failures.length) {
    console.error('Aborting: fix or purge the rows above first, nothing was written.');
    process.exit(1);
  }
  await prisma.$transaction(updates);
  console.log('Re-encrypted.');
}

(mode === 'purge' ? purge() : reencrypt())
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
