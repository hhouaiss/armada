'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  FileText,
  Settings,
  Store,
  BookOpen,
  Users,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navGroups = [
  {
    label: 'Opérations', // i18n: Operations
    items: [
      { name: 'Quartier Général', href: '/hq', icon: LayoutDashboard }, // i18n: Command Center
      { name: 'Magasins', href: '/stores', icon: Store }, // i18n: Stores
      { name: 'Clients', href: '/customers', icon: Users }, // i18n: Customers
      { name: 'Inventaire', href: '/inventory', icon: Package }, // i18n: Inventory
      { name: 'Contenu', href: '/content', icon: FileText }, // i18n: Content
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
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--armada-accent)]/50 px-5 py-4">
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
