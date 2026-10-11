'use client';

import { Bell, Menu } from 'lucide-react';
import { AccountMenu } from './AccountMenu';

interface TopbarProps {
  officeInitials: string;
  officeName: string;
  onMenuClick: () => void;
  menuAberto?: boolean;
}

export function AccountantTopbar({ officeInitials, officeName, onMenuClick, menuAberto = false }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 pt-[env(safe-area-inset-top)]">
      <div className="h-16 px-3 sm:px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden w-11 h-11 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          aria-label="Abrir menu"
          aria-controls="menu-contador"
          aria-expanded={menuAberto}
        >
          <Menu className="w-6 h-6 text-gray-700" />
        </button>

        <div className="hidden lg:block" />

        <div className="flex items-center gap-1 sm:gap-3">
          <button
            type="button"
            className="w-11 h-11 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            aria-label="Notificações"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-orange-600 rounded-full" aria-hidden="true" />
          </button>

          <AccountMenu officeInitials={officeInitials} officeName={officeName} />
        </div>
      </div>
    </header>
  );
}
