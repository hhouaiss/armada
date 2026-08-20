import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncConnectorGateway } from '@/lib/connector-gateway';
import { isCentrallyBlockedToolName } from '@/lib/connector-security';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await params;
  const body = await request.json();
  const connection = await prisma.appConnection.findFirst({ where: { id: connectionId, userId: user.id, store: { userId: user.id } } });
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  const agent = await prisma.agent.findFirst({ where: { id: String(body.agentId || ''), storeId: connection.storeId, connectionGrants: { some: { connectionId } } } });
  if (!agent) return NextResponse.json({ error: 'Agent is not assigned' }, { status: 400 });
  const policies = Array.isArray(body.policies) ? body.policies : [];
  if (policies.some((policy: any) => !policy.toolName || !['blocked', 'automatic', 'approval'].includes(policy.mode))) return NextResponse.json({ error: 'Invalid policies' }, { status: 400 });
  if (new Set(policies.map((policy: any) => String(policy.toolName))).size !== policies.length) {
    return NextResponse.json({ error: 'Duplicate tool policies are not allowed' }, { status: 400 });
  }
  const availableTools = new Set(Array.isArray(connection.discoveredTools)
    ? (connection.discoveredTools as any[]).map((tool) => String(tool.name))
    : []);
  if (policies.some((policy: any) => !availableTools.has(String(policy.toolName)))) {
    return NextResponse.json({ error: 'A policy references a tool not exposed by this connection' }, { status: 400 });
  }
  if (policies.some((policy: any) => policy.mode !== 'blocked' && isCentrallyBlockedToolName(String(policy.toolName)))) {
    return NextResponse.json({ error: 'This tool is centrally blocked and cannot be overridden' }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.agentToolPolicy.deleteMany({ where: { connectionId, agentId: agent.id } }),
    ...policies.map((policy: any) => prisma.agentToolPolicy.create({ data: { connectionId, agentId: agent.id, toolName: String(policy.toolName), mode: policy.mode } })),
    prisma.connectorAuditEvent.create({ data: { storeId: connection.storeId, connectionId, agentId: agent.id, eventType: 'tool_policies_changed', status: 'completed', summary: { policyCount: policies.length } } }),
  ]);
  await syncConnectorGateway().catch(() => null);
  return NextResponse.json({ ok: true });
}
