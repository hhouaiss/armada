export interface Operation {
  id: string;
  storeId: string;
  agentId?: string;
  action: string;
  params: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_approval';
  result?: any;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ToolContext {
  storeId: string;
  shopifyAccessToken: string;
  shopifyDomain: string;
  agentId: string;
  operationId: string;
  channel?: 'web' | 'telegram' | 'api';
  approvalCallback?: (approved: boolean) => void;
  // Router reference — injected by Gateway so orchestration tools can dispatch to sub-agents
  router?: import('../core/router.js').Router;
  // Registry + session manager — injected so orchestration tools can create & register new agents
  toolRegistry?: import('../core/tool-registry.js').ToolRegistry;
  sessionManager?: import('../core/session-manager.js').SessionManager;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  requiresApproval?: boolean;
  approvalDescription?: string;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string; enum?: string[]; default?: any; properties?: Record<string, any> }>;
  required?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  category: string;
  requiresApproval?: boolean;
  inputSchema: ToolInputSchema;
  execute(params: any, context: ToolContext): Promise<ToolResult>;
  validate?(params: any): { valid: boolean; errors?: string[] };
}

// Keep ShopifyTool as an alias for backward compatibility
export type ShopifyTool = AgentTool;
