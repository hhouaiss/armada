'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import {
  X, Send, Bot, Loader2, FileText, ExternalLink, Sparkles,
  Plus, MessageSquare,
} from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';
import Link from 'next/link';
import { AGENT_COLORS } from '@/lib/livrables';

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}

interface LivrableRef { id: string; title: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLivrableRef(content: string): LivrableRef | null {
  const match = content.match(/\[LIVRABLE:([^:]+):([^\]]+)\]/);
  return match ? { id: match[1], title: match[2] } : null;
}

function stripLivrableMarker(content: string): string {
  return content.replace(/\[LIVRABLE:[^\]]+\]/g, '').trim();
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

const agentPersonalities: Record<string, { name: string; role: string; greeting: string }> = {
  product:   { name: 'Sarah',     role: 'Spécialiste Produit',     greeting: "Bonjour ! Je suis Sarah, votre spécialiste produits. Comment puis-je vous aider ?" },
  inventory: { name: 'Marcus',    role: 'Gestionnaire Inventaire', greeting: "Bonjour ! Je suis Marcus, votre gestionnaire de stocks. Comment puis-je vous aider ?" },
  support:   { name: 'Emma',      role: 'Succès Client',           greeting: "Bonjour ! Je suis Emma, votre spécialiste relation client. Comment puis-je vous aider ?" },
  content:   { name: 'Alex',      role: 'Créateur de Contenu',     greeting: "Bonjour ! Je suis Alex, votre créateur de contenu. Quel contenu souhaitez-vous ?" },
  seo:       { name: 'Olivia',    role: 'SEO Stratège',            greeting: "Bonjour ! Je suis Olivia, votre spécialiste SEO. Comment optimiser votre visibilité ?" },
  major:     { name: 'Le Major',  role: 'Chef des Opérations',     greeting: "Bonjour ! Je suis Le Major, votre Chef des Opérations. Que puis-je faire pour vous ?" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function LivrableCard({ livrableRef, agentType }: { livrableRef: LivrableRef; agentType: string }) {
  const colorClass = AGENT_COLORS[agentType] ?? AGENT_COLORS.major;
  return (
    <Link
      href={`/livrables/${livrableRef.id}`}
      className="flex items-center gap-3 mt-3 p-3 rounded-xl border border-[var(--armada-primary)]/25 hover:border-[var(--armada-primary)]/50 hover:bg-[var(--armada-primary)]/5 transition-all group"
      style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 4%, var(--armada-surface))' }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-[var(--armada-primary)]/20"
        style={{ backgroundColor: 'color-mix(in srgb, var(--armada-primary) 10%, transparent)' }}>
        <FileText className="h-3.5 w-3.5" style={{ color: 'var(--armada-primary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <Sparkles className="h-2.5 w-2.5 shrink-0" style={{ color: 'var(--armada-primary)' }} />
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--armada-primary)' }}>
            Livrable généré
          </span>
        </div>
        <p className="text-xs font-medium text-[var(--armada-text)] truncate">{livrableRef.title}</p>
      </div>
      <ExternalLink className="h-3 w-3 shrink-0 text-[var(--armada-primary)]/50 group-hover:text-[var(--armada-primary)] transition-colors" />
    </Link>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export function AgentChatDrawer() {
  const { isOpen, agentId, closeChat } = useChatDrawer();
  const { activeStoreId } = useActiveStore();
  const { isConnected, sendChatMessage } = useGateway();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>(() => `conv-${Date.now()}`);
  const [conversations, setConversations] = useState<Array<{ id: string; label: string }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const greetingRef = useRef('');

  const { data: agentsData } = useSWR(
    activeStoreId ? `/api/agents?storeId=${activeStoreId}` : null,
    fetcher
  );

  const agent = agentsData?.agents?.find((a: any) => a.id === agentId);
  const agentType = agent?.type || 'major';
  const personality = agentPersonalities[agentType] ?? {
    name: agent?.name || 'Agent',
    role: agentType,
    greeting: 'Bonjour ! Comment puis-je vous aider ?',
  };
  greetingRef.current = personality.greeting;

  // Load history when agentId or conversationId changes
  useEffect(() => {
    if (!activeStoreId || !agentId) return;
    setMessages([]);
    fetch(`/api/chat?storeId=${activeStoreId}&agentId=${agentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.messages?.length > 0) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            timestamp: new Date(m.createdAt),
            status: 'sent',
          })));
        } else {
          setMessages([{ id: 'welcome', sender: 'agent', content: greetingRef.current, timestamp: new Date(), status: 'sent' }]);
        }
      })
      .catch(() => {
        setMessages([{ id: 'welcome', sender: 'agent', content: greetingRef.current, timestamp: new Date(), status: 'sent' }]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId, agentId, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeChat(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeChat]);

  const startNewConversation = useCallback(() => {
    const newId = `conv-${Date.now()}`;
    setConversations(prev => [
      { id: conversationId, label: `Conversation ${prev.length + 1}` },
      ...prev,
    ]);
    setConversationId(newId);
    setMessages([{ id: 'welcome', sender: 'agent', content: greetingRef.current, timestamp: new Date(), status: 'sent' }]);
    setInput('');
  }, [conversationId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !agentId) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: input,
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(agentId, input, conversationId);
      setMessages(prev => [
        ...prev.map(m => m.id === userMsg.id ? { ...m, status: 'sent' as const } : m),
        { id: `agent-${Date.now()}`, sender: 'agent', content: response, timestamp: new Date(), status: 'sent' },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev.map(m => m.id === userMsg.id ? { ...m, status: 'error' as const } : m),
        {
          id: `error-${Date.now()}`,
          sender: 'agent',
          content: `Désolé, une erreur est survenue. Veuillez réessayer.`,
          timestamp: new Date(),
          status: 'sent',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !agentId) return null;

  return (
    /* Drawer — desktop only (mobile uses Telegram) */
    <div
      className={[
        'hidden md:flex fixed top-0 right-0 h-full z-50 flex-col',
        'w-[420px]',
        'border-l border-[var(--armada-accent)]/50',
        'shadow-2xl',
      ].join(' ')}
      style={{ backgroundColor: 'var(--armada-bg)' }}
    >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-[var(--armada-accent)]/50 shrink-0"
          style={{ backgroundColor: 'var(--armada-surface)' }}
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full border border-[var(--armada-accent)] flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--armada-bg)' }}>
            <Bot className="h-3.5 w-3.5 text-[var(--armada-text)]/50" />
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm text-[var(--armada-text)] leading-tight">{personality.name}</span>
              {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
            </div>
            <p className="text-[9px] font-mono uppercase tracking-widest" style={{ color: 'var(--armada-primary)' }}>
              {personality.role}
            </p>
          </div>

          {/* New conversation */}
          <button
            onClick={startNewConversation}
            title="Nouvelle conversation"
            className="p-1.5 rounded-lg text-[var(--armada-text)]/40 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          {/* Close */}
          <button
            onClick={closeChat}
            className="p-1.5 rounded-lg text-[var(--armada-text)]/40 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] transition-colors"
            aria-label="Fermer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Past conversations (if any) ── */}
        {conversations.length > 0 && (
          <div
            className="flex gap-2 px-4 py-2 border-b border-[var(--armada-accent)]/30 overflow-x-auto shrink-0"
            style={{ backgroundColor: 'var(--armada-surface)' }}
          >
            <button
              onClick={() => {
                setConversationId(`conv-${Date.now()}`);
                setMessages([{ id: 'welcome', sender: 'agent', content: greetingRef.current, timestamp: new Date(), status: 'sent' }]);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono whitespace-nowrap border border-[var(--armada-primary)]/40 text-[var(--armada-primary)]"
            >
              <MessageSquare className="h-2.5 w-2.5" />
              En cours
            </button>
            {conversations.slice(0, 5).map(conv => (
              <button
                key={conv.id}
                onClick={() => setConversationId(conv.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono whitespace-nowrap border border-[var(--armada-accent)]/40 text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] transition-colors"
              >
                {conv.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map(message => {
            const livrableRef = message.sender === 'agent' ? parseLivrableRef(message.content) : null;
            const displayContent = livrableRef ? stripLivrableMarker(message.content) : message.content;
            return (
              <div
                key={message.id}
                className={`flex gap-2.5 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {message.sender === 'agent' && (
                  <div className="w-6 h-6 rounded-full border border-[var(--armada-accent)] flex items-center justify-center shrink-0 mt-1"
                    style={{ backgroundColor: 'var(--armada-surface)' }}>
                    <Bot className="h-3 w-3 text-[var(--armada-text)]/40" />
                  </div>
                )}
                <div className={`max-w-[80%] flex flex-col gap-1 ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  {message.sender === 'agent' && (
                    <span className="text-[9px] font-mono text-[var(--armada-text)]/30 uppercase tracking-wider px-1">
                      {personality.name}
                    </span>
                  )}
                  <div
                    className={`px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      message.sender === 'user'
                        ? 'rounded-2xl rounded-br-sm text-white'
                        : 'rounded-2xl rounded-bl-sm border border-[var(--armada-accent)]/50'
                    }`}
                    style={
                      message.sender === 'user'
                        ? { backgroundColor: 'var(--armada-primary)' }
                        : { backgroundColor: 'var(--armada-surface)', color: 'var(--armada-text)' }
                    }
                  >
                    {displayContent}
                    {livrableRef && <LivrableCard livrableRef={livrableRef} agentType={agentType} />}
                  </div>
                  <span className="text-[9px] text-[var(--armada-text)]/25 font-mono px-1">
                    {message.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {message.status === 'sending' && ' · envoi…'}
                    {message.status === 'error' && ' · erreur'}
                  </span>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-2.5">
              <div className="w-6 h-6 rounded-full border border-[var(--armada-accent)] flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--armada-surface)' }}>
                <Bot className="h-3 w-3 text-[var(--armada-text)]/40" />
              </div>
              <div className="px-3 py-2.5 rounded-2xl rounded-bl-sm border border-[var(--armada-accent)]/50"
                style={{ backgroundColor: 'var(--armada-surface)' }}>
                <div className="flex items-center gap-2 text-xs text-[var(--armada-text)]/40 font-mono">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  réflexion en cours…
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input ── */}
        <div
          className="border-t border-[var(--armada-accent)]/50 p-3 shrink-0"
          style={{ backgroundColor: 'var(--armada-surface)' }}
        >
          <form onSubmit={handleSend} className="flex gap-2 items-center">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={isConnected ? `Briefer ${personality.name}…` : 'Connexion en cours…'}
              disabled={!isConnected || isLoading}
              className="flex-1 rounded-full border border-[var(--armada-accent)]/60 px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-2 focus:ring-[var(--armada-primary)]/10 transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--armada-bg)', color: 'var(--armada-text)' }}
            />
            <button
              type="submit"
              disabled={!isConnected || isLoading || !input.trim()}
              className="flex items-center justify-center w-9 h-9 rounded-full text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 shrink-0"
              style={{ backgroundColor: 'var(--armada-primary)' }}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
    </div>
  );
}
