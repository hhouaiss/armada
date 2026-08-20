import net from 'node:net';
import crypto from 'node:crypto';

export function isPrivateNetworkAddress(address: string): boolean {
  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mappedIpv4) return isPrivateNetworkAddress(mappedIpv4);
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc')
    || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9')
    || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff');
}

export function exposedMcpToolName(slug: string, toolName: string): string {
  const normalized = `${slug}__${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (normalized.length <= 64) return normalized;
  const suffix = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 10);
  return `${normalized.slice(0, 53)}_${suffix}`;
}

export function defaultMcpPolicy(tool: { name: string; readOnly: boolean; destructive: boolean }) {
  if (/(?:credential|password|secret|api[_-]?key|bank|wire[_-]?transfer|funds?[_-]?transfer|refund)/i.test(tool.name)) return 'blocked' as const;
  return tool.readOnly && !tool.destructive ? 'automatic' as const : 'approval' as const;
}

export function selectAccount<T extends { label: string }>(candidates: T[], requested?: string | null): T | null {
  if (requested) return candidates.find((candidate) => candidate.label === requested) ?? null;
  return candidates.length === 1 ? candidates[0] : null;
}
