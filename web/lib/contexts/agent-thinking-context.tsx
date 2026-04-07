'use client';

import { createContext, useContext, useState, useCallback } from 'react';

export interface ThinkingSession {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentInitial: string;
  chatPath: string;
  status: 'thinking' | 'ready' | 'error';
  pendingMessage: string;
  agentResponse: string | null;
}

interface AgentThinkingContextType {
  session: ThinkingSession | null;
  startThinking: (params: Omit<ThinkingSession, 'status' | 'agentResponse'>) => void;
  setReady: (response: string) => void;
  setError: () => void;
  dismiss: () => void;
}

const AgentThinkingContext = createContext<AgentThinkingContextType | null>(null);

export function AgentThinkingProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ThinkingSession | null>(null);

  const startThinking = useCallback((params: Omit<ThinkingSession, 'status' | 'agentResponse'>) => {
    setSession({ ...params, status: 'thinking', agentResponse: null });
  }, []);

  const setReady = useCallback((response: string) => {
    setSession(prev => (prev ? { ...prev, status: 'ready', agentResponse: response } : null));
  }, []);

  const setError = useCallback(() => {
    setSession(null);
  }, []);

  const dismiss = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <AgentThinkingContext.Provider value={{ session, startThinking, setReady, setError, dismiss }}>
      {children}
    </AgentThinkingContext.Provider>
  );
}

export function useAgentThinking() {
  const ctx = useContext(AgentThinkingContext);
  if (!ctx) throw new Error('useAgentThinking must be used within AgentThinkingProvider');
  return ctx;
}
