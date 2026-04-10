import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET single agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        store: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}

// PATCH - Update agent configuration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body = await request.json();
    const { modelProvider, modelName, routingMode, autoSimpleModel, autoComplexModel } = body;

    // Validate provider and model
    const validProviders = ['anthropic', 'openai', 'openrouter', 'ollama'];
    if (modelProvider && !validProviders.includes(modelProvider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const validRoutingModes = ['fixed', 'auto'];
    if (routingMode && !validRoutingModes.includes(routingMode)) {
      return NextResponse.json({ error: 'Invalid routing mode' }, { status: 400 });
    }

    // Update agent
    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: {
        modelProvider: modelProvider || undefined,
        modelName: modelName || undefined,
        ...(routingMode !== undefined && { routingMode }),
        ...(autoSimpleModel !== undefined && { autoSimpleModel }),
        ...(autoComplexModel !== undefined && { autoComplexModel }),
        updatedAt: new Date(),
      },
    });

    // Notify gateway to reload this agent (optional - gateway will pick up changes on next request)
    try {
      const gatewayPort = parseInt(process.env.GATEWAY_WS_URL?.split(':')[2] || '18790');
      const gatewayHttpPort = gatewayPort + 1;

      await fetch(`http://localhost:${gatewayHttpPort}/api/agents/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id }),
      });
    } catch (err) {
      console.warn('⚠️  Could not notify gateway of agent update:', err);
    }

    return NextResponse.json({ success: true, agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}
