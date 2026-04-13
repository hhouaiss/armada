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
