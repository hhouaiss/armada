import { PrismaClient } from '@prisma/client';

// Singleton Prisma client for Gateway
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Helper to get store credentials
export async function getStoreCredentials(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      shopifyDomain: true,
      accessToken: true,
      isActive: true,
    },
  });

  if (!store) {
    throw new Error(`Store not found: ${storeId}`);
  }

  if (!store.isActive) {
    throw new Error(`Store is not active: ${storeId}`);
  }

  return store;
}

// Helper to save operation to database
export async function saveOperation(operation: {
  operationId: string;
  storeId: string;
  agentId?: string;
  action: string;
  params: any;
  result?: any;
  status: string;
  error?: string;
  duration?: number;
}) {
  return prisma.operation.upsert({
    where: { operationId: operation.operationId },
    create: {
      operationId: operation.operationId,
      storeId: operation.storeId,
      agentId: operation.agentId,
      action: operation.action,
      params: operation.params,
      result: operation.result,
      status: operation.status,
      error: operation.error,
      duration: operation.duration,
    },
    update: {
      status: operation.status,
      startedAt: new Date(),
    },
  });
}

// Helper to update operation status
export async function updateOperation(
  operationId: string,
  updates: {
    status?: string;
    result?: any;
    error?: string;
    duration?: number;
  }
) {
  return prisma.operation.updateMany({
    where: { operationId },
    data: {
      ...updates,
      completedAt: new Date(),
    },
  });
}

// Helper to save chat message
export async function saveChatMessage(message: {
  storeId: string;
  agentId: string;
  sender: 'user' | 'agent';
  content: string;
  metadata?: any;
}) {
  return prisma.chatMessage.create({
    data: {
      storeId: message.storeId,
      agentId: message.agentId,
      sender: message.sender,
      content: message.content,
      metadata: message.metadata || {},
    },
  });
}

// Helper to get integration credentials
export async function getIntegrationCredentials(platform: string) {
  const integration = await prisma.integration.findFirst({
    where: {
      platform,
      isActive: true,
    },
    select: {
      credentials: true,
    },
  });

  if (!integration || !integration.credentials) {
    return null;
  }

  // The credentials are stored as { encrypted: "..." }
  const encrypted = (integration.credentials as any).encrypted;
  if (!encrypted) {
    return null;
  }

  return encrypted;
}

// Helper to save conversation session (OpenClaw persistent sessions pattern)
export async function saveConversationSession(session: {
  conversationId: string;
  agentId: string;
  storeId: string;
  history: any[]; // Anthropic MessageParam[]
}) {
  return prisma.conversationSession.upsert({
    where: {
      conversationId_agentId: {
        conversationId: session.conversationId,
        agentId: session.agentId,
      },
    },
    create: {
      conversationId: session.conversationId,
      agentId: session.agentId,
      storeId: session.storeId,
      history: session.history,
    },
    update: {
      history: session.history,
      lastMessageAt: new Date(),
    },
  });
}

// Helper to load conversation session
export async function loadConversationSession(
  conversationId: string,
  agentId: string
): Promise<any[] | null> {
  const session = await prisma.conversationSession.findUnique({
    where: {
      conversationId_agentId: {
        conversationId,
        agentId,
      },
    },
    select: {
      history: true,
    },
  });

  if (!session) {
    return null;
  }

  return session.history as any[];
}

// Helper to load all active sessions for an agent (for gateway restart recovery)
export async function loadAgentSessions(agentId: string) {
  const sessions = await prisma.conversationSession.findMany({
    where: {
      agentId,
    },
    select: {
      conversationId: true,
      history: true,
      lastMessageAt: true,
    },
    orderBy: {
      lastMessageAt: 'desc',
    },
    take: 50, // Limit to 50 most recent
  });

  return sessions.map((s) => ({
    conversationId: s.conversationId,
    history: s.history as any[],
    lastMessageAt: s.lastMessageAt,
  }));
}

// Load all agents' sessions for a given conversationId (for The Major's cross-agent context)
export async function loadSessionsForConversation(
  conversationId: string,
  excludeAgentId: string
) {
  return prisma.conversationSession.findMany({
    where: { conversationId, NOT: { agentId: excludeAgentId } },
    include: { agent: { select: { name: true, type: true } } },
    orderBy: { lastMessageAt: 'desc' },
  });
}

// Helper to save a livrable generated by an agent
export async function saveLivrable(livrable: {
  slug: string;
  title: string;
  content: string;
  agentName: string;
  agentType: string;
  storeId: string;
  agentId?: string;
}) {
  return prisma.livrable.create({
    data: {
      slug: livrable.slug,
      title: livrable.title,
      content: livrable.content,
      agentName: livrable.agentName,
      agentType: livrable.agentType,
      storeId: livrable.storeId,
      agentId: livrable.agentId ?? null,
    },
  });
}

// Load all conversation sessions for a store across all agents (for AutoDream)
export async function loadAllStoreSessionsForDream(
  storeId: string,
  daysBack: number = 7
): Promise<Array<{ agentId: string; conversationId: string; history: any[] }>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const sessions = await prisma.conversationSession.findMany({
    where: {
      storeId,
      lastMessageAt: { gte: cutoff },
    },
    select: {
      agentId: true,
      conversationId: true,
      history: true,
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 200, // hard cap to avoid timeouts
  });

  return sessions.map((s) => ({
    agentId: s.agentId,
    conversationId: s.conversationId,
    history: (s.history as any[]) ?? [],
  }));
}

// Helper to cleanup old sessions (older than 7 days)
export async function cleanupOldSessions(daysOld: number = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.conversationSession.deleteMany({
    where: {
      lastMessageAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
