'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Activity,
  Inbox,
  Settings,
  BookOpen,
  LogOut,
  Puzzle,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { LIVRABLES_CHANGED_EVENT } from '@/lib/livrables';

const navGroups = [
  {
    label: 'Opérations',
    items: [
      { name: 'Quartier Général', href: '/hq', icon: LayoutDashboard },
      { name: 'Livrables', href: '/livrables', icon: Inbox },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { name: 'Capacités', href: '/skills', icon: BookOpen },
      { name: 'Journal', href: '/activity', icon: Activity },
      { name: 'Apps', href: '/integrations', icon: Puzzle },
    ],
  },
  {
    label: 'Système',
    items: [
      { name: 'Configuration', href: '/settings', icon: Settings },
    ],
  },
];

// ── Tooltip wrapper ───────────────────────────────────────────────────────────

function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tooltip">
      {children}
      <div
        className={[
          'pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50',
          'px-2.5 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap',
          'opacity-0 group-hover/tooltip:opacity-100',
          'translate-x-1 group-hover/tooltip:translate-x-0',
          'transition-all duration-150',
          'border border-[var(--armada-accent)]/60 shadow-lg',
        ].join(' ')}
        style={{ backgroundColor: 'var(--armada-surface)', color: 'var(--armada-text)' }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeStoreId } = useActiveStore();
  const [unreadLivrables, setUnreadLivrables] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const fetchUnread = useCallback(async () => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/livrables?storeId=${activeStoreId}`);
      if (res.ok) {
        const data = await res.json();
        setUnreadLivrables(data.unreadCount ?? 0);
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

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-[var(--armada-accent)]/50">
        <NavTooltip label="armada HQ">
          <Link href="/hq" className="flex items-center justify-center w-9 h-9 rounded-xl group">
            <span className="font-serif text-lg font-semibold leading-none text-[var(--armada-text)] group-hover:text-[var(--armada-primary)] transition-colors">
              A
            </span>
          </Link>
        </NavTooltip>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col gap-5 px-2 py-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 flex justify-center">
              <div className="h-px w-6 bg-[var(--armada-accent)]/30" />
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/hq' && pathname?.startsWith(item.href + '/'));

                return (
                  <NavTooltip key={item.href} label={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        'relative flex items-center justify-center w-10 h-10 rounded-xl mx-auto transition-colors',
                        isActive
                          ? 'bg-[var(--armada-text)] text-[var(--armada-bg)]'
                          : 'text-[var(--armada-text)]/50 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)]'
                      )}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.name}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />

                      {/* Unread badge on Livrables */}
                      {item.href === '/livrables' && unreadLivrables > 0 && (
                        <span
                          className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[8px] font-mono font-bold text-white"
                          style={{ backgroundColor: 'var(--armada-primary)' }}
                        >
                          {unreadLivrables > 9 ? '9+' : unreadLivrables}
                        </span>
                      )}
                    </Link>
                  </NavTooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer — sign out */}
      <div className="border-t border-[var(--armada-accent)]/50 py-4 flex justify-center">
        <NavTooltip label="Déconnexion">
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-[var(--armada-text)]/30 hover:text-[var(--armada-text)]/70 hover:bg-[var(--armada-surface-hover)] transition-colors"
            aria-label="Déconnexion"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </NavTooltip>
      </div>
    </nav>
  );

  return (
    <>
      {/* ── Mobile hamburger ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-[var(--armada-accent)]/60 text-[var(--armada-text)]/60"
        style={{ backgroundColor: 'var(--armada-surface)' }}
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* ── Mobile overlay sidebar ── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 h-full w-16 z-50 flex flex-col border-r border-[var(--armada-accent)]/50 md:hidden"
            style={{ backgroundColor: 'var(--armada-surface)' }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-2 p-1.5 rounded-lg text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]"
              aria-label="Fermer le menu"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* ── Desktop sidebar — always visible, always w-16 ── */}
      <aside
        className="hidden md:flex h-full w-16 flex-col fixed left-0 top-0 border-r border-[var(--armada-accent)]/50"
        style={{ backgroundColor: 'var(--armada-surface)' }}
        aria-label="Navigation principale"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
