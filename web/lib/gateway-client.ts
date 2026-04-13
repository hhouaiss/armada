type ServerMessage =
  | { type: 'connected'; connectionId: string }
  | { type: 'operation_started'; operationId: string; agentId: string }
  | { type: 'operation_progress'; operationId: string; step: string; data?: any }
  | { type: 'operation_completed'; operationId: string; result: any }
  | { type: 'operation_failed'; operationId: string; error: string }
  | { type: 'agent_message'; agentId: string; message: string }
  | { type: 'store_event'; storeId: string; event: string; data: any }
  | { type: 'pong' }
  | { type: 'chat_response'; messageId: string; agentId: string; response: string }
  | { type: 'chat_error'; messageId: string; error: string };

type MessageHandler = (message: ServerMessage) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, MessageHandler[]> = new Map();
  private connectionId: string | null = null;
  private isConnecting = false;
  private userId: string | null = null;

  constructor(private url: string = 'ws://localhost:18790') {}

  connect(userId: string, token: string = 'default-token'): Promise<string> {
    this.userId = userId;

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve(this.connectionId!);
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('✓ Gateway connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Send connect message
          this.send({
            type: 'connect',
            userId,
            token,
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);

            if (message.type === 'connected') {
              this.connectionId = message.connectionId;
              resolve(message.connectionId);
            }

            this.emit(message.type, message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('✗ Gateway disconnected');
          this.isConnecting = false;
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.userId) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

      console.log(`→ Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        if (this.userId) {
          this.connect(this.userId).catch((err) => {
            console.error('Reconnection failed:', err);
            this.handleReconnect();
          });
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.userId = null;
    }
  }

  subscribe(storeId: string): void {
    this.send({
      type: 'subscribe',
      storeId,
    });
    console.log(`→ Subscribed to store: ${storeId}`);
  }

  executeOperation(
    storeId: string,
    action: string,
    params: Record<string, any>,
    agentId?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Set up listeners
      const cleanup = () => {
        this.off('operation_completed', onComplete);
        this.off('operation_failed', onFailed);
      };

      const onComplete = (msg: any) => {
        if (msg.operationId === operationId) {
          cleanup();
          resolve(msg.result);
        }
      };

      const onFailed = (msg: any) => {
        if (msg.operationId === operationId) {
          cleanup();
          reject(new Error(msg.error));
        }
      };

      this.on('operation_completed', onComplete);
      this.on('operation_failed', onFailed);

      // Send operation
      this.send({
        type: 'operation',
        operationId,
        storeId,
        agentId,
        action,
        params,
      });

      console.log(`→ Operation sent: ${action} (${operationId})`);
    });
  }

  sendChatMessage(
    storeId: string,
    agentId: string,
    message: string,
    conversationId?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Set up listeners
      const cleanup = () => {
        this.off('chat_response', onResponse);
        this.off('chat_error', onError);
      };

      const onResponse = (msg: any) => {
        if (msg.messageId === messageId) {
          cleanup();
          resolve(msg.response);
        }
      };

      const onError = (msg: any) => {
        if (msg.messageId === messageId) {
          cleanup();
          reject(new Error(msg.error));
        }
      };

      this.on('chat_response', onResponse);
      this.on('chat_error', onError);

      // Send chat message
      this.send({
        type: 'chat',
        messageId,
        storeId,
        agentId,
        message,
        conversationId,
      });

      console.log(`→ Chat message sent to ${agentId}: "${message}"`);
    });
  }

  on(eventType: string, handler: MessageHandler): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(handler);
  }

  off(eventType: string, handler: MessageHandler): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(eventType: string, message: any): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connectionId = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance — reads Railway WebSocket URL from env in production
const gatewayUrl =
  process.env.NEXT_PUBLIC_GATEWAY_WS_URL || 'ws://localhost:18790';

export const gatewayClient = new GatewayClient(gatewayUrl);
