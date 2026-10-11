'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, User, Building2, Users, Settings, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AccountMenuProps {
  officeInitials: string;
  officeName: string;
}

export function AccountMenu({ officeInitials, officeName }: AccountMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [membershipRole, setMembershipRole] = useState<string>('membro');

  useEffect(() => {
    const getMembershipRole = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: membership } = await supabase
          .from('membros_escritorio')
          .select('funcao')
          .eq('id_usuario', user.id)
          .maybeSingle();

        if (membership) {
          setMembershipRole(membership.funcao);
        }
      } catch (error) {
        console.error('Error fetching membership:', error);
      }
    };

    getMembershipRole();
  }, []);

  // Close on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoading(false);
    }
  };

  const getRoleLabel = (role: string): string => {
    const roleMap: Record<string, string> = {
      dono: 'Proprietário',
      membro: 'Membro',
      visualizador: 'Visualizador',
    };
    return roleMap[role] || 'Membro';
  };

  const menuItems = [
    {
      icon: User,
      label: 'Minha conta',
      description: 'Seus dados pessoais',
      onClick: () => router.push('/contador/minha-conta'),
    },
    {
      icon: Building2,
      label: 'Dados do escritório',
      description: 'Informações do seu escritório',
      onClick: () => router.push('/contador/escritorio'),
    },
    {
      icon: Users,
      label: 'Equipe',
      description: 'Gerenciar colaboradores',
      onClick: () => router.push('/contador/equipe'),
    },
    {
      icon: Settings,
      label: 'Configurações',
      description: 'Preferências do sistema',
      onClick: () => router.push('/contador/configuracoes'),
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Menu da conta ${officeName}`}
        className="flex items-center gap-2 sm:gap-3 min-h-11 cursor-pointer hover:bg-gray-50 rounded-lg px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-orange-600">{officeInitials}</span>
        </div>
        <div className="hidden sm:flex flex-col items-end">
          <p className="text-sm font-semibold text-gray-900 line-clamp-1 max-w-[200px]">{officeName}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-80 max-h-[calc(100dvh-5rem)] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg z-50"
          role="menu"
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-orange-600">{officeInitials}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{officeName}</p>
                <p className="text-xs text-gray-600">{getRoleLabel(membershipRole)}</p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    item.onClick();
                    setIsOpen(false);
                  }}
                  className="w-full min-h-11 px-4 py-3 text-left hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none transition-colors flex gap-3 items-start group"
                  role="menuitem"
                >
                  <Icon className="w-5 h-5 text-gray-400 group-hover:text-orange-600 transition-colors flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-600">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full px-4 py-3 text-left hover:bg-red-50 transition-colors flex gap-3 items-start group disabled:opacity-50"
            role="menuitem"
          >
            <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-600 transition-colors flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900 group-hover:text-red-600">
                {isLoading ? 'Saindo...' : 'Sair'}
              </p>
              <p className="text-xs text-gray-600">Encerrar sua sessão</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
