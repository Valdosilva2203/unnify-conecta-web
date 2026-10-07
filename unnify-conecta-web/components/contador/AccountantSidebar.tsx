'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, FileText, Calendar, CheckSquare, DollarSign, BarChart3, User, Headphones } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

const menuItems = [
  { label: 'Início', icon: Home, href: '/contador' },
  { label: 'Clientes', icon: Users, href: '#' },
  { label: 'Documentos', icon: FileText, href: '#' },
  { label: 'Agenda', icon: Calendar, href: '#' },
  { label: 'Obrigações', icon: CheckSquare, href: '#' },
  { label: 'Financeiro', icon: DollarSign, href: '#' },
  { label: 'Relatórios', icon: BarChart3, href: '#' },
  { label: 'Minha conta', icon: User, href: '#' },
];

export function AccountantSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 h-screen
          w-64 bg-white border-r border-gray-200
          overflow-y-auto
          transform transition-transform duration-300 ease-in-out
          z-50 md:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col
        `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <Link href="/contador" className="flex items-center gap-2">
            <Image
              src="/brand/unnify-logo.png"
              alt="Unnify Conecta"
              width={200}
              height={67}
              className="h-8 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 py-6 px-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const isDisabled = item.href === '#';

            return (
              <div key={item.label}>
                {isDisabled ? (
                  <div
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg
                      text-gray-400 cursor-default
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg
                      transition-colors
                      ${
                        isActive
                          ? 'bg-orange-50 text-orange-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        {/* Support Card */}
        <div className="p-4 border-t border-gray-200 space-y-4">
          <div className="bg-orange-50 rounded-lg p-4 text-center">
            <Headphones className="w-6 h-6 text-orange-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-900 mb-1">Precisa de ajuda?</p>
            <p className="text-xs text-gray-600 mb-3">Nossa equipe está pronta para te ajudar.</p>
            <button className="w-full px-3 py-2 border border-orange-600 text-orange-600 rounded-lg text-xs font-semibold hover:bg-orange-50 transition-colors">
              Falar com o suporte
            </button>
          </div>

          {/* Version */}
          <div className="text-center pt-4 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-900">Unnify Conecta</p>
            <p className="text-xs text-gray-500">v1.0.0</p>
          </div>
        </div>
      </aside>
    </>
  );
}
