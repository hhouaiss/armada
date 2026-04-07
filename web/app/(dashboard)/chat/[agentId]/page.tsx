'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Send, Bot, Loader2, ArrowLeft } from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import Link from 'next/link';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}

const agentPersonalities: Record<string, { name: string; role: string; greeting: string }> = {
  product: {
    name: 'Sarah',
    role: 'Spécialiste Produit',
    greeting: "Bonjour ! Je suis Sarah, votre spécialiste produits. Je peux vous aider à gérer votre catalogue, optimiser le SEO et améliorer vos fiches produits. Par où commençons-nous ?",
  },
  inventory: {
    name: 'Marcus',
    role: 'Gestionnaire Inventaire',
    greeting: "Bonjour ! Je suis Marcus, votre gestionnaire de stocks. Je surveille les niveaux de stock et préviens les ruptures. Comment puis-je vous aider ?",
  },
  support: {
    name: 'Emma',
    role: 'Succès Client',
    greeting: "Bonjour ! Je suis Emma, votre spécialiste relation client. Je gère les données clients et les opérations support. Comment puis-je vous aider aujourd'hui ?",
  },
  content: {
    name: 'Alex',
    role: 'Créateur de Contenu',
    greeting: "Bonjour ! Je suis Alex, votre créateur de contenu. J'écris des articles de blog et crée du contenu engageant pour votre boutique. Quel contenu souhaitez-vous ?",
  },
  seo: {
    name: 'Olivia',
    role: 'SEO Stratège',
    greeting: "Bonjour ! Je suis Olivia, votre spécialiste SEO. J'analyse vos performances de recherche, vos mots-clés et vos classements. Comment puis-je optimiser votre visibilité ?",
  },
  major: {
    name: 'Le Major',
    role: 'Chef des Opérations',
    greeting: "Bonjour ! Je suis Le Major, votre Chef des Opérations. Je coordonne toute l'escouade — Sarah, Marcus, Emma, Alex et Olivia — pour répondre à vos besoins. Que puis-je faire pour vous ?",
  },
};

export default function ChatPage() {
  const params = useParams();
  const agentId = params?.agentId as string;
  const { activeStoreId, activeStore } = useActiveStore();
  const { isConnected, sendChatMessage } = useGateway();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // greetingRef: lets the DB fetch read the welcome text without making
  // personality.greeting a reactive dep (which caused a double-fetch every time
  // SWR loaded agents and changed the string, wiping in-flight local state).
  const greetingRef = useRef(agentPersonalities.product.greeting);

  const { data: agentsData } = useSWR(
    activeStoreId ? '/api/agents?storeId=' + activeStoreId : null,
    (url) => fetch(url).then(r => r.json())
  );

  const agent = agentsData?.agents?.find((a: any) => a.id === agentId);
  const agentType = agent?.type || 'product';
  const personality = agentPersonalities[agentType] || {
    name: agent?.name || 'Agent',
    role: agentType,
    greeting: "Bonjour ! Comment puis-je vous aider ?",
  };
  greetingRef.current = personality.greeting;

  useEffect(() => {
    if (!activeStoreId || !agentId) return;
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
  }, [activeStoreId, agentId]); // intentionally omitting personality.greeting — see greetingRef above

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: input,
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(agentId, input, `user-${activeStoreId}`);
      setMessages(prev => prev.map(m => m.id === userMessage.id ? { ...m, status: 'sent' as const } : m));
      setMessages(prev => [...prev, {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        content: response,
        timestamp: new Date(),
        status: 'sent',
      }]);
    } catch (error) {
      setMessages(prev => prev.map(m => m.id === userMessage.id ? { ...m, status: 'error' as const } : m));
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        sender: 'agent',
        content: `Désolé, une erreur est survenue : ${error instanceof Error ? error.message : 'Erreur inconnue'}. Veuillez réessayer.`,
        timestamp: new Date(),
        status: 'sent',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Empty states ────────────────────────────────────────────────
  if (!activeStore) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--armada-bg)' }}
      >
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-14 h-14 rounded-full border border-[var(--armada-accent)] flex items-center justify-center mx-auto">
            <Bot className="h-6 w-6 text-[var(--armada-text)]/30" />
          </div>
          <p className="font-serif text-xl text-[var(--armada-text)]">Aucun magasin actif</p>
          <p className="text-sm text-[var(--armada-text)]/50">
            Connectez un magasin pour démarrer un briefing avec votre escouade.
          </p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--armada-bg)' }}
      >
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-14 h-14 rounded-full border border-[var(--armada-accent)] flex items-center justify-center mx-auto">
            <Bot className="h-6 w-6 text-[var(--armada-text)]/30" />
          </div>
          <p className="font-serif text-xl text-[var(--armada-text)]">Agent introuvable</p>
          <Link
            href="/hq"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--armada-accent)] text-sm text-[var(--armada-text)]/70 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au QG
          </Link>
        </div>
      </div>
    );
  }

  // ── Main chat UI ────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'var(--armada-bg)' }}
    >
      {/* ── Chat header ── */}
      <div
        className="border-b border-[var(--armada-accent)]/50 px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <div className="flex items-center gap-4">
          {/* Back */}
          <Link
            href="/hq"
            className="text-[var(--armada-text)]/40 hover:text-[var(--armada-text)] transition-colors"
            aria-label="Retour au QG"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Avatar */}
          <div className="w-9 h-9 rounded-full border border-[var(--armada-accent)] flex items-center justify-center bg-[var(--armada-bg)] shrink-0">
            <Bot className="h-4 w-4 text-[var(--armada-text)]/50" />
          </div>

          {/* Name + role */}
          <div>
            <h1 className="font-serif text-base font-medium text-[var(--armada-text)] leading-tight">
              {personality.name}
            </h1>
            <p className="text-[10px] font-mono text-[var(--armada-primary)] uppercase tracking-widest">
              {personality.role}
            </p>
          </div>

          {/* Status pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono ${
              isConnected
                ? 'border-green-500/20 bg-green-500/8 text-green-600'
                : 'border-[var(--armada-accent)] text-[var(--armada-text)]/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-[var(--armada-text)]/20'}`} />
            {isConnected ? 'En ligne' : 'Hors ligne'}
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Agent avatar */}
            {message.sender === 'agent' && (
              <div className="w-7 h-7 rounded-full border border-[var(--armada-accent)] flex items-center justify-center shrink-0 mt-1"
                style={{ backgroundColor: 'var(--armada-surface)' }}>
                <Bot className="h-3.5 w-3.5 text-[var(--armada-text)]/40" />
              </div>
            )}

            <div className={`max-w-[72%] flex flex-col gap-1 ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
              {/* Sender label */}
              {message.sender === 'agent' && (
                <span className="text-[10px] font-mono text-[var(--armada-text)]/30 uppercase tracking-wider px-1">
                  {personality.name}
                </span>
              )}

              {/* Bubble */}
              <div
                className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
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
                {message.content}
              </div>

              {/* Timestamp + status */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-[var(--armada-text)]/25 font-mono">
                  {message.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {message.status === 'sending' && (
                  <span className="text-[10px] text-[var(--armada-text)]/30 font-mono">envoi…</span>
                )}
                {message.status === 'error' && (
                  <span className="text-[10px] text-red-400 font-mono">erreur</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full border border-[var(--armada-accent)] flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--armada-surface)' }}>
              <Bot className="h-3.5 w-3.5 text-[var(--armada-text)]/40" />
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-bl-sm border border-[var(--armada-accent)]/50"
              style={{ backgroundColor: 'var(--armada-surface)' }}
            >
              <div className="flex items-center gap-2 text-xs text-[var(--armada-text)]/40 font-mono">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                réflexion en cours…
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ── */}
      <div
        className="border-t border-[var(--armada-accent)]/50 p-4"
        style={{ backgroundColor: 'var(--armada-surface)' }}
      >
        <form onSubmit={handleSend} className="flex gap-3 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isConnected
                ? `Briefer ${personality.name}…`
                : 'Connexion en cours…'
            }
            disabled={!isConnected || isLoading}
            className="flex-1 rounded-full border border-[var(--armada-accent)]/60 px-5 py-3 text-sm focus:outline-none focus:border-[var(--armada-primary)]/50 focus:ring-2 focus:ring-[var(--armada-primary)]/10 transition-colors disabled:opacity-40"
            style={{
              backgroundColor: 'var(--armada-bg)',
              color: 'var(--armada-text)',
            }}
          />
          <button
            type="submit"
            disabled={!isConnected || isLoading || !input.trim()}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: 'var(--armada-primary)' }}
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Envoyer</span>
          </button>
        </form>
      </div>
    </div>
  );
}
