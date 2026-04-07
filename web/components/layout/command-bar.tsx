'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { Terminal, X, Loader2, Send, ChevronDown, Mic, MicOff, Volume2 } from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { useGeminiLive } from '@/lib/hooks/useGeminiLive';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Message {
  role: 'user' | 'major';
  content: string;
}

export function CommandBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { isConnected, sendChatMessage } = useGateway();
  const { activeStoreId } = useActiveStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef(activeStoreId ? `user-${activeStoreId}` : `command-bar-${Date.now()}`);

  // Find Major agent
  const { data: agentsData } = useSWR(
    activeStoreId ? `/api/agents?storeId=${activeStoreId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const majorAgent = (agentsData?.agents || []).find((a: any) => a.type === 'major');

  // Keep conversationId in sync with active store
  useEffect(() => {
    if (activeStoreId) conversationId.current = `user-${activeStoreId}`;
  }, [activeStoreId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExpanded]);

  // ⌘K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const handleExpand = () => {
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!majorAgent) {
      setIsExpanded(true);
      setMessages(prev => [...prev, {
        role: 'major',
        content: 'The Major is not configured for this store. Visit My Team to set up your squad.',
      }]);
      setInput('');
      return;
    }

    setIsExpanded(true);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(majorAgent.id, text, conversationId.current);
      setMessages(prev => [...prev, { role: 'major', content: response }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'major',
        content: isConnected
          ? 'Something went wrong. Please try again.'
          : 'Gateway is offline. Start the gateway server and try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, majorAgent, isConnected, sendChatMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canChat = isConnected && !!majorAgent && !!activeStoreId;

  // Gemini Live voice — connects on first mic click, streams in real-time
  const { state: liveState, transcript, connect, startRecording, stopRecording, disconnect } = useGeminiLive(
    activeStoreId ?? null,
    majorAgent?.id ?? null,
    {
      onMessage: (text) => {
        setIsExpanded(true);
        setMessages(prev => [...prev, { role: 'major', content: text }]);
      },
      onTranscript: (text) => {
        if (text) {
          setIsExpanded(true);
          setMessages(prev => {
            // Update or add user transcript message
            const last = prev[prev.length - 1];
            if (last?.role === 'user' && last.content === transcript) {
              return [...prev.slice(0, -1), { role: 'user', content: text }];
            }
            return [...prev, { role: 'user', content: text }];
          });
        }
      },
    }
  );

  const handleVoice = async () => {
    if (!activeStoreId || !majorAgent) return;
    setIsExpanded(true);

    if (liveState === 'idle') {
      connect(); // opens WS + waits for 'ready'
    } else if (liveState === 'ready') {
      await startRecording();
    } else if (liveState === 'recording') {
      stopRecording();
    } else if (liveState === 'speaking') {
      // barge-in: stop playback and re-record
      await startRecording();
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setMessages([]);
    setIsExpanded(false);
  };

  return (
    <div className="fixed bottom-0 right-0 left-64 z-50 border-t border-[var(--armada-accent)]/50 bg-[var(--armada-surface)]/90 backdrop-blur-md">
      {/* Expanded conversation */}
      {isExpanded && messages.length > 0 && (
        <div className="max-h-80 overflow-y-auto px-4 py-3 space-y-3 border-b border-[var(--armada-accent)]/50">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'major' && (
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-[var(--armada-primary)]/10 border border-[var(--armada-primary)]/30 mr-2 flex-shrink-0 mt-0.5">
                  <Terminal className="h-3 w-3 text-[var(--armada-primary)]" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[var(--armada-primary)]/10 border border-[var(--armada-primary)]/20 text-[var(--armada-text)]'
                    : 'bg-[var(--armada-surface-hover)] border border-[var(--armada-accent)]/50 text-[var(--armada-text)]/90'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-[var(--armada-primary)]/10 border border-[var(--armada-primary)]/30 mr-2 flex-shrink-0">
                <Terminal className="h-3 w-3 text-[var(--armada-primary)]" />
              </div>
              <div className="bg-[var(--armada-surface-hover)] border border-[var(--armada-accent)]/50 rounded-2xl px-3 py-2 text-sm text-[var(--armada-text)]/50 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-mono text-xs">analyse en cours…</span>{/* i18n: thinking... */}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Major indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`h-1.5 w-1.5 rounded-full ${canChat ? 'bg-green-400 animate-pulse' : 'bg-[var(--armada-text)]/20'}`} />
          <span className="text-[10px] font-sans font-medium text-[var(--armada-text)]/40 uppercase tracking-widest hidden sm:block">
            Le Major{/* i18n: The Major */}
          </span>
          {/* Live session badge */}
          {(liveState !== 'idle' && liveState !== 'error') && (
            <span className="text-[9px] font-mono font-medium text-[var(--armada-primary)] uppercase tracking-widest border border-[var(--armada-primary)]/30 rounded-full px-1.5 py-0.5 hidden sm:block">
              live
            </span>
          )}
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[var(--armada-accent)]/60 flex-shrink-0" />

        {/* Input */}
        <div className="flex-1 relative" onClick={!isExpanded ? handleExpand : undefined}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsExpanded(true)}
            placeholder={
              canChat
                ? 'Donner un ordre au Major… (⌘K)' // i18n: Ask The Major... (⌘K)
                : activeStoreId
                  ? 'Connexion en cours…' // i18n: Connecting to gateway...
                  : 'Connectez un magasin pour commencer' // i18n: Connect a store to chat
            }
            disabled={!canChat}
            className="w-full bg-transparent text-sm text-[var(--armada-text)]/80 placeholder:text-[var(--armada-text)]/30 font-sans focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isExpanded && messages.length > 0 && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-[var(--armada-text)]/30 hover:text-[var(--armada-text)]/70 transition-colors"
              title="Réduire"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
          {isExpanded && messages.length > 0 && (
            <button
              onClick={handleDisconnect}
              className="text-[var(--armada-text)]/30 hover:text-[var(--armada-text)]/70 transition-colors"
              title="Terminer la session"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {/* Bouton vocal Gemini Live */}
          <button
            onClick={handleVoice}
            disabled={!activeStoreId || !majorAgent || liveState === 'connecting'}
            title={
              liveState === 'idle' ? 'Démarrer une session vocale (Gemini Live)'
              : liveState === 'connecting' ? 'Connexion…'
              : liveState === 'ready' ? 'Parler au Major'
              : liveState === 'recording' ? 'Arrêter d\'écouter'
              : liveState === 'speaking' ? 'Interrompre (barge-in)'
              : 'Parler au Major'
            }
            className={`flex items-center justify-center h-7 w-7 rounded-full border transition-all ${
              liveState === 'recording'
                ? 'bg-red-500 border-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                : liveState === 'connecting'
                  ? 'bg-[var(--armada-primary)]/10 border-[var(--armada-primary)]/30 text-[var(--armada-primary)]'
                  : liveState === 'speaking'
                    ? 'bg-[var(--armada-primary)] border-[var(--armada-primary)] text-white shadow-[0_0_12px_rgba(77,92,255,0.4)]'
                    : liveState === 'ready'
                      ? 'bg-[var(--armada-primary)]/10 border-[var(--armada-primary)]/50 text-[var(--armada-primary)]'
                      : 'bg-[var(--armada-surface-hover)] border-[var(--armada-accent)]/60 text-[var(--armada-text)]/50 hover:border-[var(--armada-primary)]/40 hover:text-[var(--armada-primary)]'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {liveState === 'connecting' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : liveState === 'speaking' ? (
              <Volume2 className="h-3 w-3" />
            ) : liveState === 'recording' ? (
              <MicOff className="h-3 w-3" />
            ) : (
              <Mic className="h-3 w-3" />
            )}
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !canChat}
            className="flex items-center justify-center h-7 w-7 rounded-full bg-[var(--armada-primary)] text-white hover:opacity-90 transition-all shadow-sm disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}
