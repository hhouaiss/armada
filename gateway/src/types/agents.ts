export type AgentType = string;

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  storeId: string;

  // Legacy field
  personality: string;

  // OpenClaw-style customizable personality (Phase 2)
  systemPrompt?: string;
  capabilities?: {
    allowed?: string[];
    denied?: string[];
  };
  customRules?: string;
  templateId?: string;

  config?: Record<string, any>;
}

export interface AgentSession {
  id: string;
  agentId: string;
  type: 'interactive' | 'workflow' | 'background' | 'chat';
  status: 'active' | 'completed' | 'failed' | 'paused';
  context?: Record<string, any>;
  startedAt: Date;
  lastActivityAt: Date;
}
