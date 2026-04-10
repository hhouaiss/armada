'use client';

import { Moon, Sun, Bell, Search, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/providers/theme-provider';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GatewayStatus } from '@/components/gateway-status';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { LIVRABLES_CHANGED_EVENT, type Livrable } from '@/lib/livrables';

export function Header() {
  const { theme, setTheme } = useTheme();
  const { activeStoreId } = useActiveStore();
  const [unreadLivrables, setUnreadLivrables] = useState<Livrable[]>([]);

  const fetchUnread = useCallback(async () => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/livrables?storeId=${activeStoreId}`);
      if (res.ok) {
        const data = await res.json();
        const unread = (data.livrables ?? []).filter((l: Livrable) => !l.isRead).slice(0, 5);
        setUnreadLivrables(unread);
      }
    } catch {
      // Non-blocking
    }
  }, [activeStoreId]);

  useEffect(() => {
    fetchUnread();
    window.addEventListener(LIVRABLES_CHANGED_EVENT, fetchUnread);
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      window.removeEventListener(LIVRABLES_CHANGED_EVENT, fetchUnread);
      clearInterval(interval);
    };
  }, [fetchUnread]);

  const toggleTheme = () => {
    if (theme === 'dark') setTheme('light');
    else if (theme === 'light') setTheme('system');
    else setTheme('dark');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--armada-accent)]/40 bg-[var(--armada-surface)]/80 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--armada-surface)]/60">
      <div className="flex h-16 items-center px-6 ml-64 gap-4">

        {/* Search */}
        <div className="flex-1 flex items-center">
          <div className="relative w-full max-w-sm">
            <Search
              className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--armada-text)]/30"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Rechercher missions, agents, magasins…"
              className="w-full rounded-full border border-[var(--armada-accent)]/60 bg-[var(--armada-bg)] px-9 py-2 text-sm text-[var(--armada-text)] placeholder:text-[var(--armada-text)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--armada-primary)]/40 focus-visible:border-[var(--armada-primary)]/40 transition-colors"
            />
          </div>
        </div>

        {/* Gateway Status */}
        <GatewayStatus />

        {/* Actions */}
        <div className="flex items-center gap-1">

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={`Thème : ${theme}`}
            className="text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] rounded-full"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Changer le thème</span> {/* i18n: Toggle theme */}
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] rounded-full"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadLivrables.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--armada-primary)] text-[9px] font-mono font-medium text-white shadow-[0_0_8px_var(--armada-primary)]">
                    {unreadLivrables.length > 9 ? '9+' : unreadLivrables.length}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-80 border-[var(--armada-accent)]/60 bg-[var(--armada-surface)]"
              align="end"
            >
              <DropdownMenuLabel className="flex items-center justify-between px-4 py-2">
                <span className="text-[10px] font-mono text-[var(--armada-text)]/40 uppercase tracking-widest">
                  Livrables {/* i18n: Deliverables */}
                </span>
                {unreadLivrables.length > 0 && (
                  <span className="text-[10px] font-mono text-[var(--armada-primary)]">
                    {unreadLivrables.length} non lu{unreadLivrables.length > 1 ? 's' : ''} {/* i18n: unread */}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[var(--armada-accent)]/40" />
              {unreadLivrables.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <FileText className="h-5 w-5 text-[var(--armada-text)]/20 mx-auto mb-2" />
                  <p className="text-xs text-[var(--armada-text)]/40 font-mono">
                    Aucun nouveau livrable {/* i18n: No new deliverables */}
                  </p>
                </div>
              ) : (
                unreadLivrables.map((livrable) => (
                  <DropdownMenuItem key={livrable.id} asChild>
                    <Link
                      href={`/livrables/${livrable.id}`}
                      className="flex flex-col gap-1 px-4 py-3 cursor-pointer focus:bg-[var(--armada-surface-hover)]"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-1.5 h-1.5 shrink-0 rounded-full bg-[var(--armada-primary)]" />
                        <span className="text-sm text-[var(--armada-text)] font-medium leading-snug line-clamp-2">
                          {livrable.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pl-3.5">
                        <span className="text-[10px] font-mono text-[var(--armada-primary)]/70">
                          {livrable.agentName}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--armada-text)]/30">
                          {new Date(livrable.createdAt).toLocaleString('fr-FR', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator className="bg-[var(--armada-accent)]/40" />
              <DropdownMenuItem asChild>
                <Link
                  href="/livrables"
                  className="flex items-center justify-center px-4 py-2.5 text-xs font-mono text-[var(--armada-primary)] cursor-pointer w-full focus:bg-[var(--armada-surface-hover)] focus:text-[var(--armada-primary)]"
                >
                  Voir tous les livrables → {/* i18n: View all deliverables */}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full hover:bg-[var(--armada-surface-hover)] ml-1"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatar.png" alt="Utilisateur" />
                  <AvatarFallback className="text-xs font-mono bg-[var(--armada-accent)] text-[var(--armada-text)]">
                    AH {/* i18n: Armada HQ initials */}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-52 border-[var(--armada-accent)]/60 bg-[var(--armada-surface)]"
              align="end"
            >
              <DropdownMenuLabel className="text-[var(--armada-text)] font-normal text-xs text-[var(--armada-text)]/50 font-mono">
                Mon compte {/* i18n: My Account */}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[var(--armada-accent)]/40" />
              <DropdownMenuItem className="text-sm text-[var(--armada-text)] focus:bg-[var(--armada-surface-hover)] focus:text-[var(--armada-text)] cursor-pointer">
                Profil {/* i18n: Profile */}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-sm text-[var(--armada-text)] focus:bg-[var(--armada-surface-hover)] focus:text-[var(--armada-text)] cursor-pointer">
                Facturation {/* i18n: Billing */}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[var(--armada-accent)]/40" />
              <DropdownMenuItem className="text-sm text-[var(--armada-text)]/60 focus:bg-[var(--armada-surface-hover)] focus:text-[var(--armada-text)] cursor-pointer">
                Se déconnecter {/* i18n: Log out */}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </header>
  );
}
