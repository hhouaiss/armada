import { z } from 'zod';

// Client → Gateway Messages
export const ConnectMessageSchema = z.object({
  type: z.literal('connect'),
  userId: z.string(),
  token: z.string(),
});

export const OperationMessageSchema = z.object({
  type: z.literal('operation'),
  operationId: z.string(),
  storeId: z.string(),
  agentId: z.string().optional(),
  action: z.string(),
  params: z.record(z.any()),
});

export const SubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  storeId: z.string(),
});

export const PingMessageSchema = z.object({
  type: z.literal('ping'),
});

/** An image sent along with a chat message (base64 or data: URL payload). */
export const ChatAttachmentSchema = z.object({
  type: z.literal('image').default('image'),
  mediaType: z.string().optional(),
  data: z.string(),
  name: z.string().optional(),
});

export const ChatMessageSchema = z.object({
  type: z.literal('chat'),
  messageId: z.string(),
  storeId: z.string(),
  agentId: z.string(),
  message: z.string(),
  conversationId: z.string().optional(),
  attachments: z.array(ChatAttachmentSchema).max(5).optional(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  ConnectMessageSchema,
  OperationMessageSchema,
  SubscribeMessageSchema,
  PingMessageSchema,
  ChatMessageSchema,
]);

export type ConnectMessage = z.infer<typeof ConnectMessageSchema>;
export type OperationMessage = z.infer<typeof OperationMessageSchema>;
export type SubscribeMessage = z.infer<typeof SubscribeMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Gateway → Client Messages
export interface ConnectedMessage {
  type: 'connected';
  connectionId: string;
}

export interface OperationStartedMessage {
  type: 'operation_started';
  operationId: string;
  agentId: string;
}

export interface OperationProgressMessage {
  type: 'operation_progress';
  operationId: string;
  step: string;
  data?: any;
}

export interface OperationCompletedMessage {
  type: 'operation_completed';
  operationId: string;
  result: any;
}

export interface OperationFailedMessage {
  type: 'operation_failed';
  operationId: string;
  error: string;
}

export interface AgentMessageMessage {
  type: 'agent_message';
  agentId: string;
  message: string;
}

export interface StoreEventMessage {
  type: 'store_event';
  storeId: string;
  event: string;
  data: any;
}

export interface PongMessage {
  type: 'pong';
}

export interface ChatResponseMessage {
  type: 'chat_response';
  messageId: string;
  agentId: string;
  response: string;
}

export interface ChatErrorMessage {
  type: 'chat_error';
  messageId: string;
  error: string;
}

export type ServerMessage =
  | ConnectedMessage
  | OperationStartedMessage
  | OperationProgressMessage
  | OperationCompletedMessage
  | OperationFailedMessage
  | AgentMessageMessage
  | StoreEventMessage
  | PongMessage
  | ChatResponseMessage
  | ChatErrorMessage;
