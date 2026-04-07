'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAgentThinking } from '@/lib/contexts/agent-thinking-context';

export function AgentThinkingBubble() {
  const { session, dismiss } = useAgentThinking();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [readyFlash, setReadyFlash] = useState(false);
  const prevStatus = useRef<string | null>(null);

  // Show bubble only when user is away from the chat page
  const isOnChatPage = pathname === session?.chatPath;

  useEffect(() => {
    if (!session || isOnChatPage) {
      setVisible(false);
      return;
    }
    // Slight delay so the page transition completes before bubble slides in
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, [session, isOnChatPage]);

  // Dismiss automatically when user navigates back to the chat page
  useEffect(() => {
    if (isOnChatPage && session?.status === 'ready') {
      dismiss();
    }
  }, [isOnChatPage, session?.status, dismiss]);

  // Flash animation when status changes to ready
  useEffect(() => {
    if (session?.status === 'ready' && prevStatus.current === 'thinking') {
      setReadyFlash(true);
      const t = setTimeout(() => setReadyFlash(false), 800);
      return () => clearTimeout(t);
    }
    prevStatus.current = session?.status ?? null;
  }, [session?.status]);

  if (!session) return null;

  const handleClick = () => {
    router.push(session.chatPath);
    dismiss();
  };

  const isThinking = session.status === 'thinking';
  const isReady = session.status === 'ready';

  return (
    <>
      <style>{`
        @keyframes orbit-pulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          50%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 0; }
        }
        @keyframes orbit-pulse-2 {
          0%   { transform: scale(1);   opacity: 0.4; }
          50%  { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1);   opacity: 0; }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes ready-flash {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
          50%  { box-shadow: 0 0 0 12px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        @keyframes bubble-slide-in {
          from { opacity: 0; transform: translateX(24px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes bubble-slide-out {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to   { opacity: 0; transform: translateX(24px) scale(0.92); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .agent-bubble-enter {
          animation: bubble-slide-in 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
        .agent-bubble-exit {
          animation: bubble-slide-out 0.22s ease-in forwards;
        }
        .agent-bubble-ready-flash {
          animation: ready-flash 0.8s ease-out;
        }
        .dot-1 { animation: dot-bounce 1.4s ease-in-out infinite; animation-delay: 0s; }
        .dot-2 { animation: dot-bounce 1.4s ease-in-out infinite; animation-delay: 0.2s; }
        .dot-3 { animation: dot-bounce 1.4s ease-in-out infinite; animation-delay: 0.4s; }
        .orbit-ring-1 {
          animation: orbit-pulse 2s ease-out infinite;
          animation-delay: 0s;
        }
        .orbit-ring-2 {
          animation: orbit-pulse-2 2s ease-out infinite;
          animation-delay: 0.6s;
        }
      `}</style>

      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        aria-label={
          isThinking
            ? `${session.agentName} est en train de réfléchir`
            : `Réponse de ${session.agentName} prête — cliquez pour revenir`
        }
        className={[
          'fixed right-5 z-50 cursor-pointer select-none',
          'flex items-center gap-3',
          'rounded-2xl border',
          'shadow-2xl backdrop-blur-xl',
          'transition-all duration-300 ease-out',
          'hover:scale-[1.03] active:scale-[0.98]',
          visible ? 'agent-bubble-enter' : 'agent-bubble-exit',
          readyFlash ? 'agent-bubble-ready-flash' : '',
          isReady
            ? 'px-4 py-3 border-green-500/40 bg-[#0d1f14]/90'
            : 'px-4 py-3 border-[var(--armada-primary)]/30 bg-[var(--armada-surface)]/90',
        ].join(' ')}
        style={{
          bottom: '96px',
          minWidth: isReady ? '192px' : '168px',
          boxShadow: isReady
            ? '0 8px 32px rgba(34,197,94,0.15), 0 2px 8px rgba(0,0,0,0.4)'
            : '0 8px 32px rgba(77,92,255,0.15), 0 2px 8px rgba(0,0,0,0.4)',
        }}
      >
        {/* Avatar with orbital rings when thinking */}
        <div className="relative shrink-0">
          {isThinking && (
            <>
              <div
                className="orbit-ring-1 absolute inset-0 rounded-full border"
                style={{ borderColor: 'var(--armada-primary)', opacity: 0.6 }}
              />
              <div
                className="orbit-ring-2 absolute inset-0 rounded-full border"
                style={{ borderColor: 'var(--armada-primary)', opacity: 0.4 }}
              />
            </>
          )}

          <div
            className={[
              'relative w-9 h-9 rounded-full flex items-center justify-center shrink-0',
              'font-serif text-sm font-bold',
              'transition-colors duration-500',
              isReady
                ? 'bg-green-500/15 border border-green-500/50 text-green-400'
                : 'border text-[var(--armada-primary)]',
            ].join(' ')}
            style={
              isThinking
                ? {
                    backgroundColor: 'color-mix(in srgb, var(--armada-primary) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--armada-primary) 40%, transparent)',
                  }
                : undefined
            }
          >
            {session.agentInitial}
          </div>
        </div>

        {/* Text content */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="text-[10px] font-mono uppercase tracking-widest truncate"
            style={{ color: isReady ? '#86efac' : 'var(--armada-primary)' }}
          >
            {session.agentName}
          </span>

          {isThinking ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--armada-text)]/50 font-mono">réflexion</span>
              <span className="flex gap-[3px] items-center">
                <span className="dot-1 w-1 h-1 rounded-full bg-[var(--armada-text)]/40 inline-block" />
                <span className="dot-2 w-1 h-1 rounded-full bg-[var(--armada-text)]/40 inline-block" />
                <span className="dot-3 w-1 h-1 rounded-full bg-[var(--armada-text)]/40 inline-block" />
              </span>
            </div>
          ) : (
            <span className="text-xs text-green-300/90 font-mono">
              Réponse prête →
            </span>
          )}
        </div>

        {/* Dismiss button (only in ready state) */}
        {isReady && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            className="ml-auto shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[var(--armada-text)]/30 hover:text-[var(--armada-text)]/70 hover:bg-[var(--armada-text)]/10 transition-colors"
            aria-label="Fermer"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}
