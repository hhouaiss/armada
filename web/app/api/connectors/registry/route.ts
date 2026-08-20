import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const q = typeof body.q === 'string' ? body.q.slice(0, 100) : '';
  const url = new URL(REGISTRY);
  url.searchParams.set('version', 'latest');
  if (q) url.searchParams.set('search', q);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
  if (!response.ok) return NextResponse.json({ error: 'Registry unavailable' }, { status: 502 });
  const payload: any = await response.json();
  const cached = [];
  for (const entry of (payload.servers || []).slice(0, 25)) {
    const server = entry.server || entry;
    const remotes = server.remotes || server.remote || [];
    const remote = Array.isArray(remotes) ? remotes.find((item: any) => /^https:\/\//.test(item.url || '')) : null;
    if (!remote?.url || !server.name) continue;
    const slug = `registry-${Buffer.from(server.name).toString('base64url').slice(0, 32)}`;
    const definition = await prisma.connectorDefinition.upsert({
      where: { slug },
      create: {
        slug, name: server.title || server.name, description: server.description || 'Serveur MCP communautaire',
        publisher: server.name.split('/')[0], source: 'registry', registryName: server.name,
        version: server.version, transport: 'streamable-http', authMode: 'oauth-mcp',
        verificationTier: 'community', endpoint: remote.url, scopes: [], toolMetadata: [], riskOverrides: {},
      },
      update: { name: server.title || server.name, description: server.description || 'Serveur MCP communautaire', version: server.version, endpoint: remote.url },
    });
    cached.push(definition);
  }
  return NextResponse.json({ connectors: cached, nextCursor: payload.metadata?.nextCursor || payload.nextCursor || null });
}
