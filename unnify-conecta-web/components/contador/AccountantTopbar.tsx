'use client';

import { Bell, Menu } from 'lucide-react';
import { AccountMenu } from './AccountMenu';

interface TopbarProps {
  officeInitials: string;
  officeName: string;
  onMenuClick: () => void;
}

export function AccountantTopbar({ officeInitials, officeName, onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="h-16 px-4 md:px-6 flex items-center justify-between">
        {/* Left: Menu Button (Mobile) */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-6 h-6 text-gray-700" />
        </button>

        {/* Spacer for desktop */}
        <div className="hidden md:block" />

        {/* Right: Notifications + Account Menu */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
            aria-label="Notificações"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-orange-600 rounded-full" />
          </button>

          {/* Account Menu Dropdown */}
          <AccountMenu officeInitials={officeInitials} officeName={officeName} />
        </div>
      </div>
    </header>
  );
}
