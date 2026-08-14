import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { nanoid } from 'nanoid';
import {
  ClientMessageSchema,
  ServerMessage,
  OperationMessage,
  ChatMessage,
} from '../types/messages.js';
import { Operation } from '../types/operations.js';
import { Router } from './router.js';
import { SessionManager } from './session-manager.js';
import { ToolRegistry } from './tool-registry.js';
import { getStoreCredentials, saveOperation, updateOperation, saveChatMessage, prisma } from '../lib/database.js';
import { decryptToken } from '../lib/shopify-client.js';
import { registerStoreAgents } from '../lib/store-loader.js';
import { runAutoDream } from '../workers/auto-dream.js';
import { runKairosTick, setKairosEnabled, setKairosThresholds } from '../workers/kairos-worker.js';
import { MemoryEngine } from '../lib/memory-engine.js';
import { createLLMProvider } from '../lib/llm/provider-factory.js';

// ── Mission completion Telegram notifier (wired from index.ts after telegram init) ──
type AlertFn = (storeId: string, text: string, hasButtons?: boolean) => Promise<void>;
let missionTelegramNotifier: AlertFn | null = null;
export function setMissionTelegramNotifier(fn: AlertFn): void {
  missionTelegramNotifier = fn;
}

interface Connection {
  id: string;
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>; // storeIds
}

export class Gateway {
  private wss: WebSocketServer;
  private httpServer: http.Server;
  private connections: Map<string, Connection> = new Map();
  private router: Router;
  private sessionManager: SessionManager;
  private toolRegistry: ToolRegistry;

  constructor(
    port: number,
    router: Router,
    sessionManager: SessionManager,
    toolRegistry: ToolRegistry
  ) {
    this.router = router;
    this.sessionManager = sessionManager;
    this.toolRegistry = toolRegistry;

    // Single HTTP server handles both REST and WebSocket upgrades on the same port.
    // This is required for Railway (only one port exposed per service).
    this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', this.handleConnection.bind(this));

    this.httpServer.listen(port, () => {
      console.log(`\n🚀 Gateway running on port ${port} (HTTP + WebSocket)\n`);
    });
  }

  private handleConnection(ws: WebSocket): void {
    const connectionId = nanoid();
    const connection: Connection = {
      id: connectionId,
      ws,
      subscriptions: new Set(),
    };

    this.connections.set(connectionId, connection);
    console.log(`→ Client connected: ${connectionId}`);

    // Send connected message
    this.send(ws, {
      type: 'connected',
      connectionId,
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(connection, message);
      } catch (error) {
        console.error('Error handling message:', error);
        this.send(ws, {
          type: 'operation_failed',
          operationId: 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    ws.on('close', () => {
      this.connections.delete(connectionId);
      console.log(`← Client disconnected: ${connectionId}`);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${connectionId}:`, error);
    });
  }

  private async handleMessage(
    connection: Connection,
    rawMessage: any
  ): Promise<void> {
    // Validate message
    const parseResult = ClientMessageSchema.safeParse(rawMessage);
    if (!parseResult.success) {
      console.error('Invalid message:', parseResult.error);
      return;
    }

    const message = parseResult.data;

    switch (message.type) {
      case 'connect':
        connection.userId = message.userId;
        console.log(`✓ User authenticated: ${message.userId}`);
        break;

      case 'subscribe':
        connection.subscriptions.add(message.storeId);
        console.log(`→ Subscribed to store: ${message.storeId}`);
        break;

      case 'operation':
        await this.handleOperation(connection, message);
        break;

      case 'chat':
        await this.handleChat(connection, message);
        break;

      case 'ping':
        this.send(connection.ws, { type: 'pong' });
        break;
    }
  }

  private async handleOperation(
    connection: Connection,
    message: OperationMessage
  ): Promise<void> {
    const operation: Operation = {
      id: message.operationId,
      storeId: message.storeId,
      agentId: message.agentId,
      action: message.action,
      params: message.params,
      status: 'pending',
      startedAt: new Date(),
    };

    console.log(`\n📦 Operation received: ${operation.action} (${operation.id})`);

    // Route to agent
    const agent = await this.router.route(operation);
    if (!agent) {
      this.send(connection.ws, {
        type: 'operation_failed',
        operationId: operation.id,
        error: 'No agent available to handle this operation',
      });
      return;
    }

    // Send started message
    this.send(connection.ws, {
      type: 'operation_started',
      operationId: operation.id,
      agentId: agent.config.id,
    });

    // Update operation status
    operation.status = 'in_progress';
    operation.agentId = agent.config.id;

    const startTime = Date.now();

    try {
      // Get real Shopify credentials from database
      const store = await getStoreCredentials(operation.storeId);
      const accessToken = decryptToken(store.accessToken);

      // Create tool context with real credentials
      const context = {
        storeId: operation.storeId,
        shopifyAccessToken: accessToken,
        shopifyDomain: store.shopifyDomain,
        agentId: agent.config.id,
        operationId: operation.id,
        router: this.router,
        toolRegistry: this.toolRegistry,
        sessionManager: this.sessionManager,
      };

      // Save operation to database
      await saveOperation({
        operationId: operation.id,
        storeId: operation.storeId,
        agentId: agent.config.id,
        action: operation.action,
        params: operation.params,
        status: 'in_progress',
      });

      // Execute operation
      const result = await agent.executeOperation(operation, context);

      // Send completed message
      operation.status = 'completed';
      operation.result = result;
      operation.completedAt = new Date();

      const duration = Date.now() - startTime;

      // Update operation in database
      await updateOperation(operation.id, {
        status: 'completed',
        result,
        duration,
      });

      this.send(connection.ws, {
        type: 'operation_completed',
        operationId: operation.id,
        result,
      });

      console.log(`✓ Operation completed: ${operation.id} (${duration}ms)\n`);
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.completedAt = new Date();

      const duration = Date.now() - startTime;

      // Update operation in database
      await updateOperation(operation.id, {
        status: 'failed',
        error: operation.error,
        duration,
      });

      this.send(connection.ws, {
        type: 'operation_failed',
        operationId: operation.id,
        error: operation.error,
      });

      console.error(`✗ Operation failed: ${operation.id} - ${operation.error}\n`);
    }
  }

  private async handleChat(
    connection: Connection,
    message: ChatMessage
  ): Promise<void> {
    console.log(`\n💬 Chat message received for agent: ${message.agentId}`);

    // Find the agent
    const agent = this.router.getAgent(message.agentId);
    if (!agent) {
      this.send(connection.ws, {
        type: 'chat_error',
        messageId: message.messageId,
        error: 'Agent not found',
      });
      return;
    }

    try {
      // Get real Shopify credentials from database
      const store = await getStoreCredentials(message.storeId);
      const accessToken = decryptToken(store.accessToken);

      // Create tool context with real credentials
      const context = {
        storeId: message.storeId,
        shopifyAccessToken: accessToken,
        shopifyDomain: store.shopifyDomain,
        agentId: agent.config.id,
        operationId: message.messageId,
        router: this.router,
        toolRegistry: this.toolRegistry,
        sessionManager: this.sessionManager,
      };

      // Save user message to database
      await saveChatMessage({
        storeId: message.storeId,
        agentId: message.agentId,
        sender: 'user',
        content: message.message,
      });

      // Call agent's chat method
      const response = await agent.chat(
        message.message,
        context,
        message.conversationId || 'default'
      );

      // Save agent response to database
      await saveChatMessage({
        storeId: message.storeId,
        agentId: message.agentId,
        sender: 'agent',
        content: response,
      });

      // Send response to client
      this.send(connection.ws, {
        type: 'chat_response',
        messageId: message.messageId,
        agentId: message.agentId,
        response,
      });

      console.log(`✓ Chat response sent\n`);
    } catch (error) {
      console.error(`✗ Chat failed:`, error);
      this.send(connection.ws, {
        type: 'chat_error',
        messageId: message.messageId,
        error: error instanceof Error ? error.message : 'Chat failed',
      });
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(storeId: string, message: ServerMessage): void {
    for (const connection of this.connections.values()) {
      if (connection.subscriptions.has(storeId)) {
        this.send(connection.ws, message);
      }
    }
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Parse URL and method
    const url = req.url || '/';
    const method = req.method || 'GET';

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (method === 'GET' && url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        connections: this.connections.size,
        agents: this.router.getAllAgents().length,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // MCP servers: current status (connected / errored, tool counts)
    if (method === 'GET' && url === '/api/mcp/status') {
      const { getMcpStatus } = await import('../lib/mcp-bridge.js');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ servers: getMcpStatus() }));
      return;
    }

    // MCP servers: reconcile with the Integration table (called by the web UI
    // after connecting/disconnecting an app — no gateway restart needed)
    if (method === 'POST' && url === '/api/mcp/sync') {
      try {
        const { syncIntegrations } = await import('../lib/mcp-bridge.js');
        const statuses = await syncIntegrations();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, servers: statuses }));
      } catch (error) {
        console.error('MCP sync failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'MCP sync failed' }));
      }
      return;
    }

    // List all agents endpoint
    if (method === 'GET' && url === '/api/agents') {
      const agents = this.router.getAllAgents();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents }));
      return;
    }

    // Reload store agents endpoint
    if (method === 'POST' && url === '/api/stores/reload') {
      try {
        const body = await this.readBody(req);
        const { storeId } = JSON.parse(body);

        if (!storeId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'storeId is required' }));
          return;
        }

        // Fetch store with agents from database
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          include: {
            agents: {
              where: { isActive: true },
            },
          },
        });

        if (!store) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Store not found' }));
          return;
        }

        // Register agents for this store
        await registerStoreAgents(store, this.toolRegistry, this.sessionManager, this.router);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          agentsLoaded: store.agents.length,
          storeId: store.id,
          storeName: store.storeName,
        }));
      } catch (error) {
        console.error('Error reloading store:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to reload store' }));
      }
      return;
    }

    // AutoDream manual trigger: POST /api/dream/:storeId
    const dreamMatch = url.match(/^\/api\/dream\/([^/?]+)$/);
    if (method === 'POST' && dreamMatch) {
      const storeId = dreamMatch[1];
      try {
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { id: true, userId: true },
        });

        if (!store) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Store not found' }));
          return;
        }

        // Run async — respond immediately, dream runs in background
        runAutoDream(store.id, store.userId).catch((err) =>
          console.error(`AutoDream manual trigger error:`, err)
        );

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `AutoDream started for store ${storeId}` }));
      } catch (error) {
        console.error('Error triggering AutoDream:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to trigger AutoDream' }));
      }
      return;
    }

    // KAIROS manual trigger: POST /api/kairos/:storeId
    const kairosTickMatch = url.match(/^\/api\/kairos\/([^/?]+)\/tick$/);
    if (method === 'POST' && kairosTickMatch) {
      const storeId = kairosTickMatch[1];
      try {
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { id: true, userId: true },
        });

        if (!store) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Store not found' }));
          return;
        }

        runKairosTick(store.id, store.userId).catch((err) =>
          console.error(`KAIROS manual tick error:`, err)
        );

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `KAIROS tick started for store ${storeId}` }));
      } catch (error) {
        console.error('Error triggering KAIROS tick:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to trigger KAIROS tick' }));
      }
      return;
    }

    // KAIROS settings: POST /api/kairos/:storeId/settings
    // Body: { enabled?: boolean, thresholds?: { lowStockUnits?, orderDelayHours?, openOrdersAlertCount? } }
    const kairosSettingsMatch = url.match(/^\/api\/kairos\/([^/?]+)\/settings$/);
    if (method === 'POST' && kairosSettingsMatch) {
      const storeId = kairosSettingsMatch[1];
      try {
        const body = await this.readBody(req);
        const { enabled, thresholds } = JSON.parse(body);

        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { id: true },
        });

        if (!store) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Store not found' }));
          return;
        }

        if (typeof enabled === 'boolean') {
          await setKairosEnabled(storeId, enabled);
        }

        if (thresholds && typeof thresholds === 'object') {
          await setKairosThresholds(storeId, thresholds);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, storeId }));
      } catch (error) {
        console.error('Error updating KAIROS settings:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update KAIROS settings' }));
      }
      return;
    }

    // ── Objective analysis: POST /api/objectives/analyze ───────────────────
    if (method === 'POST' && url === '/api/objectives/analyze') {
      try {
        const body = await this.readBody(req);
        const { storeId, objectiveId } = JSON.parse(body);

        if (!storeId || !objectiveId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'storeId and objectiveId are required' }));
          return;
        }

        // Load objective
        const objective = await prisma.objective.findUnique({
          where: { id: objectiveId },
          include: { projects: { select: { id: true, description: true, status: true } } },
        });

        if (!objective || objective.storeId !== storeId) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Objective not found' }));
          return;
        }

        // Load active agents for this store
        const agents = await prisma.agent.findMany({
          where: { storeId, isActive: true },
          select: { id: true, type: true, name: true, personality: true, capabilities: true },
        });

        // Load Major for userId / model config
        const major = agents.find((a) => a.type === 'major') ?? agents[0];
        if (!major) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No agents configured for this store' }));
          return;
        }

        // Get store's userId for LLM key lookup
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { userId: true },
        });
        if (!store) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Store not found' }));
          return;
        }

        // Build agent roster summary for the prompt
        const rosterText = agents
          .filter((a) => a.type !== 'major')
          .map((a) => {
            const role = a.personality?.split(' — ')[0] ?? a.type;
            const caps = (a.capabilities as { allowed?: string[] })?.allowed?.join(', ') ?? '';
            return `- ${a.name} (${a.type}): ${role}${caps ? ' | Outils: ' + caps : ''}`;
          })
          .join('\n');

        const planningPrompt = `Tu es The Major, le commandant de l'équipe Armada. Tu dois créer un plan d'action précis pour l'objectif suivant.

OBJECTIF : ${objective.title}
${objective.description ? `DESCRIPTION : ${objective.description}` : ''}
PRIORITÉ : ${objective.priority}
TYPE : ${objective.type}
${objective.dueDate ? `ÉCHÉANCE : ${new Date(objective.dueDate).toLocaleDateString('fr-FR')}` : ''}

ÉQUIPE DISPONIBLE :
${rosterText}

Analyse cet objectif et décompose-le en tâches concrètes, une par agent concerné. Assigne chaque tâche à l'agent le plus adapté.

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "analysis": "2-3 phrases résumant la stratégie globale pour atteindre cet objectif",
  "tasks": [
    {
      "agentType": "type_exact_de_lagent",
      "agentName": "Prénom de l'agent",
      "task": "Description précise et actionnable de ce que doit faire cet agent (2-3 phrases)",
      "rationale": "Pourquoi cet agent est le mieux placé pour cette tâche",
      "priority": "high|medium|low",
      "estimatedDays": 2
    }
  ]
}

Règles :
- Maximum 4 tâches, uniquement les agents vraiment nécessaires
- Chaque tâche doit être immédiatement exécutable
- Le type d'agent doit être EXACTEMENT l'un de : ${agents.filter(a => a.type !== 'major').map(a => a.type).join(', ')}
- Réponds uniquement en JSON, sans markdown, sans explication`;

        // Create LLM provider — try multiple providers in order of preference
        let llm: Awaited<ReturnType<typeof createLLMProvider>> | null = null;
        for (const providerName of ['openai', 'anthropic', 'openrouter']) {
          try {
            llm = await createLLMProvider(store.userId, providerName, providerName === 'openai' ? 'gpt-4o' : providerName === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'anthropic/claude-3-5-haiku');
            break;
          } catch {
            // try next provider
          }
        }

        if (!llm) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No LLM provider available. Please configure an API key in Settings → Models.' }));
          return;
        }

        const response = await llm.chat({
          messages: [{ role: 'user', content: planningPrompt }],
          maxTokens: 1500,
        });

        // Parse JSON from response
        let plan: { analysis: string; tasks: any[] };
        try {
          const text = response.content.trim();
          // Strip markdown code blocks if present
          const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
          plan = JSON.parse(jsonStr);
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to parse planning response', raw: response.content.slice(0, 500) }));
          return;
        }

        // Enrich tasks with agent details from DB
        plan.tasks = plan.tasks.map((t: any) => {
          const agent = agents.find((a) => a.type === t.agentType);
          return {
            ...t,
            agentName: agent?.name ?? t.agentName,
            agentPersonality: agent?.personality ?? '',
          };
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ plan, objectiveTitle: objective.title }));
      } catch (error) {
        console.error('Error analyzing objective:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to analyze objective' }));
      }
      return;
    }

    // ── Execute objective plan: POST /api/objectives/execute-plan ────────────
    // Triggers each agent immediately and saves results to ChatMessage table.
    // Responds 202 instantly; execution runs in background.
    if (method === 'POST' && url === '/api/objectives/execute-plan') {
      try {
        const body = await this.readBody(req);
        const { storeId, objectiveId, objectiveTitle, tasks } = JSON.parse(body) as {
          storeId: string;
          objectiveId: string;
          objectiveTitle: string;
          tasks: Array<{ agentType: string; agentName: string; task: string }>;
        };

        if (!storeId || !Array.isArray(tasks) || tasks.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'storeId and tasks[] are required' }));
          return;
        }

        // Respond immediately — execution is async
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `Executing ${tasks.length} tasks in background` }));

        // Execute in background (don't block the response)
        (async () => {
          try {
            const store = await getStoreCredentials(storeId);
            const accessToken = decryptToken(store.accessToken);
            const storeAgents = this.router.getAgentsByStore(storeId);

            console.log(`\n🚀 Mission Control: executing ${tasks.length} tasks for objective "${objectiveTitle}"`);

            interface TaskResult {
              agentName: string;
              agentType: string;
              skipped?: boolean;
              done?: boolean;
              failed?: boolean;
              response?: string;
              error?: string;
            }

            // Run all agents in parallel (settled so one failure doesn't block others)
            const settled = await Promise.allSettled(
              tasks.map(async (t): Promise<TaskResult> => {
                // Find agent by type
                const agent = storeAgents.find((a) => a.config.type === t.agentType);
                if (!agent) {
                  console.warn(`  ⚠️  Agent type "${t.agentType}" not found in router — skipping`);
                  return { agentName: t.agentName, agentType: t.agentType, skipped: true };
                }

                const operationId = `mc-${objectiveId}-${t.agentType}-${Date.now()}`;
                // Use the agent's stable main thread — same as the chat drawer and chat page
                const conversationId = `agent-${agent.config.id}`;

                const context = {
                  storeId,
                  shopifyAccessToken: accessToken,
                  shopifyDomain: store.shopifyDomain,
                  agentId: agent.config.id,
                  operationId,
                  router: this.router,
                  toolRegistry: this.toolRegistry,
                  sessionManager: this.sessionManager,
                };

                // Build the task message with objective context
                const taskMessage = `[Mission Control — Objectif: ${objectiveTitle}]\n\n${t.task}\n\nExécute cette tâche maintenant et fournis un rapport de ce que tu as fait et les résultats obtenus.`;

                // Save user-side message (the task)
                await saveChatMessage({
                  storeId,
                  agentId: agent.config.id,
                  sender: 'user',
                  content: taskMessage,
                });

                console.log(`  → Calling ${t.agentName} (${t.agentType})...`);

                let response: string;
                try {
                  response = await agent.chat(taskMessage, context, conversationId);
                } catch (chatErr) {
                  console.error(`  ✗ ${t.agentName} failed:`, chatErr);
                  return {
                    agentName: t.agentName, agentType: t.agentType,
                    failed: true, error: String(chatErr),
                  };
                }

                // Save agent response to chat UI
                await saveChatMessage({
                  storeId,
                  agentId: agent.config.id,
                  sender: 'agent',
                  content: response,
                });

                // ── Mark the corresponding Project as completed ──────────────
                try {
                  const project = await prisma.project.findFirst({
                    where: { objectiveId, ownerAgentId: agent.config.id, status: 'active' },
                    orderBy: { createdAt: 'desc' },
                  });
                  if (project) {
                    await prisma.project.update({
                      where: { id: project.id },
                      data: { status: 'completed' },
                    });
                    console.log(`  ✅ Project "${project.title}" marked completed`);
                  }
                } catch (dbErr) {
                  console.warn(`  ⚠️  Could not update project status:`, dbErr);
                }

                console.log(`  ✓ ${t.agentName} completed task`);
                return { agentName: t.agentName, agentType: t.agentType, done: true, response };
              })
            );

            // ── Build Telegram summary ───────────────────────────────────────
            const taskResults: TaskResult[] = settled.map((r) =>
              r.status === 'fulfilled' ? r.value : { agentName: '?', agentType: '?', failed: true, error: String((r as PromiseRejectedResult).reason) }
            );

            const succeeded = taskResults.filter((r) => r.done).length;
            const failed = taskResults.filter((r) => r.failed || r.skipped).length;

            console.log(`\n✅ Mission Control: ${succeeded}/${tasks.length} tasks done${failed > 0 ? `, ${failed} failed/skipped` : ''}\n`);

            // Check if all projects for this objective are now done → mark objective completed
            if (succeeded > 0) {
              try {
                const remainingActive = await prisma.project.count({
                  where: { objectiveId, status: 'active' },
                });
                if (remainingActive === 0) {
                  await prisma.objective.update({
                    where: { id: objectiveId },
                    data: { status: 'completed' },
                  });
                  console.log(`  🎯 Objective "${objectiveTitle}" marked completed`);
                }
              } catch { /* non-fatal */ }
            }

            // Send Telegram notification
            if (missionTelegramNotifier && succeeded > 0) {
              const lines: string[] = [
                `✅ *Mission accomplie* — ${objectiveTitle}`,
                '',
              ];

              for (const r of taskResults) {
                if (r.done && r.response) {
                  // Trim response to first ~200 chars for Telegram readability
                  const preview = r.response.replace(/\n+/g, ' ').slice(0, 220);
                  const ellipsis = r.response.length > 220 ? '…' : '';
                  lines.push(`*${r.agentName}* — Terminé`);
                  lines.push(`↳ ${preview}${ellipsis}`);
                  lines.push('');
                } else if (r.skipped) {
                  lines.push(`*${r.agentName}* — ⚠️ Agent non trouvé`);
                  lines.push('');
                } else if (r.failed) {
                  lines.push(`*${r.agentName}* — ✗ Erreur`);
                  lines.push('');
                }
              }

              lines.push(`_${succeeded}/${tasks.length} tâche${tasks.length > 1 ? 's' : ''} complétée${succeeded > 1 ? 's' : ''} — résultats visibles dans chaque chat._`);

              try {
                await missionTelegramNotifier(storeId, lines.join('\n'), false);
              } catch (tgErr) {
                console.warn('  ⚠️  Telegram notification failed:', tgErr);
              }
            }

          } catch (error) {
            console.error('Mission Control execution error:', error);
          }
        })();

      } catch (error) {
        console.error('Error starting plan execution:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to start execution' }));
      }
      return;
    }

    // ── Inbox dispatch: POST /api/inbox/dispatch ────────────────────────────
    if (method === 'POST' && url === '/api/inbox/dispatch') {
      try {
        const body = await this.readBody(req);
        const { storeId, tasks } = JSON.parse(body) as {
          storeId: string;
          tasks: Array<{ agentType: string; task: string; from: string; scheduledDate?: string }>;
        };

        if (!storeId || !Array.isArray(tasks)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'storeId and tasks[] are required' }));
          return;
        }

        const engine = new MemoryEngine(storeId);
        let dispatched = 0;

        for (const t of tasks) {
          await engine.addToInbox(t.agentType, {
            task: t.task,
            from: t.from || 'Mission Control',
            scheduledDate: t.scheduledDate,
          });
          dispatched++;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, dispatched }));
      } catch (error) {
        console.error('Error dispatching to inboxes:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to dispatch tasks' }));
      }
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  close(): void {
    this.wss.close();
    this.httpServer.close();
  }
}
