'use client';

import { useEffect, useState } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminProfileMenu } from './admin/AdminProfileMenu';

interface AdminHeaderProps {
  aoAbrirMenu: () => void;
  menuAberto: boolean;
}

export function AdminHeader({ aoAbrirMenu, menuAberto }: AdminHeaderProps) {
  const [userName, setUserName] = useState<string>('Admin');
  const [userInitials, setUserInitials] = useState<string>('A');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from('perfis')
            .select('nome_completo')
            .eq('id_usuario', user.id)
            .single();

          const displayName = profile?.nome_completo || user.email || 'Admin';
          setUserName(displayName);

          const initials = displayName
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
          setUserInitials(initials);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
      <div className="px-3 sm:px-6 lg:px-8 py-2.5 lg:py-4 flex items-center justify-between gap-2 sm:gap-6">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={aoAbrirMenu}
            aria-label="Abrir menu"
            aria-controls="menu-admin"
            aria-expanded={menuAberto}
            className="lg:hidden w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="hidden sm:block flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar empresas, contadores e usuários"
                placeholder="Buscar empresas, contadores, usuários..."
                className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-4">
          <button
            type="button"
            aria-label="Notificações (3 novas)"
            className="relative w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Bell className="w-6 h-6" />
            <span className="absolute top-1 right-1 bg-orange-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              3
            </span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3 sm:pl-4 sm:border-l sm:border-gray-200 min-w-0">
            <div className="hidden md:block text-right min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">{userName}</p>
              <p className="text-xs text-gray-600">Administrador Master</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-orange-600">{userInitials}</span>
            </div>
            {!isLoading && <AdminProfileMenu userName={userName} userInitials={userInitials} />}
          </div>
        </div>
      </div>
    </header>
  );
}
