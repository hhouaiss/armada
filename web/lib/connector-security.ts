import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivate(address: string) {
  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mappedIpv4) return isPrivate(mappedIpv4);
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const value = address.toLowerCase();
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd')
    || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea')
    || value.startsWith('feb') || value.startsWith('ff');
}

export async function validateCustomMcpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('URL HTTPS publique requise, sans identifiants intégrés.');
  const resolved = await dns.lookup(url.hostname, { all: true });
  if (!resolved.length || resolved.some((entry) => isPrivate(entry.address))) throw new Error('Les adresses privées ou locales sont interdites.');
  return url.toString();
}

export function encryptedConnectionConfig(credentials: Record<string, string>, fields: any[]) {
  const headers: Record<string, string> = {};
  for (const field of fields || []) {
    const value = credentials[field.key]?.trim();
    if (!value) continue;
    if (field.bearer) headers.Authorization = `Bearer ${value}`;
    else if (field.header) headers[field.header] = value;
  }
  return { headers };
}

export function isCentrallyBlockedToolName(toolName: string) {
  return /(?:credential|password|secret|api[_-]?key|bank|wire[_-]?transfer|funds?[_-]?transfer|refund)/i.test(toolName);
}
