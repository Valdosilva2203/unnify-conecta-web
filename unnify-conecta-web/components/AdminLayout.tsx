'use client';

import { ReactNode, useCallback, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar aberto={menuAberto} aoFechar={fecharMenu} />

      <div className="flex-1 min-w-0 flex flex-col">
        <AdminHeader aoAbrirMenu={() => setMenuAberto(true)} menuAberto={menuAberto} />

        <main className="flex-1 min-w-0">
          <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
