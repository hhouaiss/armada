'use client';

import { Moon, Sun, Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/providers/theme-provider';
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

export function Header() {
  const { theme, setTheme } = useTheme();

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
          <Button
            variant="ghost"
            size="icon"
            className="text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:bg-[var(--armada-surface-hover)] rounded-full"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Notifications</span>
          </Button>

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
