'use client';

import { useEffect, useState } from 'react';
import { Search, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminProfileMenu } from './admin/AdminProfileMenu';

export function AdminHeader() {
  const [userName, setUserName] = useState<string>('Admin');
  const [userInitials, setUserInitials] = useState<string>('A');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          // Get profile data
          const { data: profile } = await supabase
            .from('perfis')
            .select('nome_completo')
            .eq('user_id', user.id)
            .single();

          const displayName = profile?.nome_completo || user.email || 'Admin';
          setUserName(displayName);

          // Generate initials from full name
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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="px-6 md:px-8 py-4 flex items-center justify-between gap-6">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar empresas, contadores, usuários..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-6">
          {/* Notifications */}
          <button className="relative text-gray-600 hover:text-gray-900 transition-colors">
            <Bell className="w-6 h-6" />
            <span className="absolute -top-2 -right-2 bg-orange-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              3
            </span>
          </button>

          {/* User Profile */}
          <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{userName}</p>
              <p className="text-xs text-gray-600">Administrador Master</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-orange-600">{userInitials}</span>
            </div>
            {!isLoading && <AdminProfileMenu userName={userName} userInitials={userInitials} />}
          </div>
        </div>
      </div>
    </header>
  );
}
