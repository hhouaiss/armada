'use client';

import { createContext, useCallback, useContext, useState } from 'react';

interface ChatDrawerContextType {
  isOpen: boolean;
  agentId: string | null;
  openChat: (agentId: string) => void;
  closeChat: () => void;
  toggleChat: (agentId: string) => void;
}

const ChatDrawerContext = createContext<ChatDrawerContextType | null>(null);

export function ChatDrawerProvider({ children }: { children: React.ReactNode }) {
  const [agentId, setAgentId] = useState<string | null>(null);

  const openChat = useCallback((id: string) => setAgentId(id), []);
  const closeChat = useCallback(() => setAgentId(null), []);
  const toggleChat = useCallback((id: string) => {
    setAgentId(prev => (prev === id ? null : id));
  }, []);

  return (
    <ChatDrawerContext.Provider
      value={{ isOpen: agentId !== null, agentId, openChat, closeChat, toggleChat }}
    >
      {children}
    </ChatDrawerContext.Provider>
  );
}

export function useChatDrawer() {
  const ctx = useContext(ChatDrawerContext);
  if (!ctx) throw new Error('useChatDrawer must be used inside ChatDrawerProvider');
  return ctx;
}
