'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, User, Lock, Palette, Activity, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AdminProfileMenuProps {
  userName: string;
  userInitials: string;
}

export function AdminProfileMenu({ userName, userInitials }: AdminProfileMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const menuItems = [
    {
      icon: User,
      label: 'Meu perfil',
      description: 'Dados pessoais e informações da conta',
      onClick: () => router.push('/admin/perfil'),
    },
    {
      icon: Lock,
      label: 'Segurança da conta',
      description: 'Senha, sessões e autenticação',
      onClick: () => router.push('/admin/seguranca'),
    },
    {
      icon: Palette,
      label: 'Preferências',
      description: 'Aparência e notificações',
      onClick: () => router.push('/admin/preferencias'),
    },
    {
      icon: Activity,
      label: 'Minhas atividades',
      description: 'Histórico de ações administrativas',
      onClick: () => router.push('/admin/atividades'),
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
        aria-label={`Menu do perfil ${userName}`}
        className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 rounded-lg px-2 py-1 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50"
          role="menu"
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-orange-600">{userInitials}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{userName}</p>
                <p className="text-xs text-gray-600">Administrador Master</p>
                <p className="text-xs text-gray-500">Conta administrativa</p>
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
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex gap-3 items-start group"
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
                {isLoading ? 'Saindo...' : 'Sair da conta'}
              </p>
              <p className="text-xs text-gray-600">Encerrar sessão com segurança</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
