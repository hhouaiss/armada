'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Activity,
  Inbox,
  Settings,
  Store,
  BookOpen,
  Users,
  Package,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useActiveStore } from '@/lib/hooks/useActiveStore';
import { LIVRABLES_CHANGED_EVENT } from '@/lib/livrables';

const navGroups = [
  {
    label: 'Opérations', // i18n: Operations
    items: [
      { name: 'Quartier Général', href: '/hq', icon: LayoutDashboard }, // i18n: Command Center
      { name: 'Magasins', href: '/stores', icon: Store }, // i18n: Stores
      { name: 'Clients', href: '/customers', icon: Users }, // i18n: Customers
      { name: 'Inventaire', href: '/inventory', icon: Package }, // i18n: Inventory
      { name: 'Livrables', href: '/livrables', icon: Inbox }, // i18n: Deliverables
    ],
  },
  {
    label: 'Intelligence', // i18n: Intelligence
    items: [
      { name: 'Capacités', href: '/skills', icon: BookOpen }, // i18n: Skills
      { name: 'Journal', href: '/activity', icon: Activity }, // i18n: Activity
    ],
  },
  {
    label: 'Système', // i18n: System
    items: [
      { name: 'Configuration', href: '/settings', icon: Settings }, // i18n: Settings
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeStoreId } = useActiveStore();
  const [unreadLivrables, setUnreadLivrables] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/livrables?storeId=${activeStoreId}`);
      if (res.ok) {
        const data = await res.json();
        setUnreadLivrables(data.unreadCount ?? 0);
      }
    } catch {
      // Non-blocking — badge just won't show
    }
  }, [activeStoreId]);

  useEffect(() => {
    fetchUnread();
    // Re-fetch when any livrable is marked as read elsewhere
    window.addEventListener(LIVRABLES_CHANGED_EVENT, fetchUnread);
    // Poll every 30s to catch new livrables from agents
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      window.removeEventListener(LIVRABLES_CHANGED_EVENT, fetchUnread);
      clearInterval(interval);
    };
  }, [fetchUnread]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      className="flex h-full w-64 flex-col fixed left-0 top-0 border-r border-[var(--armada-accent)]/50 bg-[var(--armada-surface)]"
      aria-label="Navigation principale"
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-[var(--armada-accent)]/50 px-5">
        <Link href="/hq" className="flex items-center gap-3 group">
          <div className="flex flex-col leading-none">
            <span className="font-serif text-xl font-semibold tracking-tight text-[var(--armada-text)] group-hover:text-[var(--armada-primary)] transition-colors">
              armada
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--armada-text)]/30 border border-[var(--armada-accent)] px-1.5 py-0.5 rounded-full leading-tight">
            HQ v1.0
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            <h3 className="px-3 mb-1.5 text-[10px] font-mono font-semibold tracking-widest text-[var(--armada-text)]/30 uppercase">
              {group.label}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/hq' && pathname?.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-[var(--armada-text)] text-[var(--armada-bg)] font-medium'
                        : 'text-[var(--armada-text)]/60 hover:bg-[var(--armada-surface-hover)] hover:text-[var(--armada-text)] font-normal'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isActive ? 'opacity-100' : 'opacity-60'
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{item.name}</span>
                    {item.href === '/livrables' && unreadLivrables > 0 && (
                      <span
                        className={cn(
                          'flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-medium',
                          isActive
                            ? 'bg-[var(--armada-bg)] text-[var(--armada-text)]'
                            : 'text-white shadow-[0_0_8px_var(--armada-primary)]'
                        )}
                        style={isActive ? {} : { backgroundColor: 'var(--armada-primary)' }}
                      >
                        {unreadLivrables}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--armada-accent)]/50 px-5 py-4 space-y-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 text-xs font-mono text-[var(--armada-text)]/40 hover:text-[var(--armada-text)]/70 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Déconnexion
        </button>
        <div className="flex items-center justify-between">
          <span className="font-serif text-sm text-[var(--armada-text)]/30 tracking-tight">
            armada
          </span>
          <span className="text-[10px] font-mono text-[var(--armada-text)]/20">
            ArmadaOS 1.0
          </span>
        </div>
      </div>
    </aside>
  );
}
