'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  CreditCard,
  Users2,
  Percent,
  History,
  Settings,
} from 'lucide-react';

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/admin' },
  { label: 'Empresas', icon: Building2, href: '/admin/empresas' },
  { label: 'Contadores', icon: Users, href: '/admin/contadores' },
  { label: 'Escritórios', icon: FileText, href: '/admin/escritorios' },
  { label: 'Assinaturas', icon: CreditCard, href: '/admin/assinaturas' },
  { label: 'Parceiros', icon: Users2, href: '/admin/parceiros' },
  { label: 'Comissões', icon: Percent, href: '/admin/comissoes' },
  { label: 'Usuários', icon: Users, href: '/admin/usuarios' },
  { label: 'Auditoria', icon: History, href: '/admin/auditoria' },
  { label: 'Configurações', icon: Settings, href: '/admin/configuracoes' },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <Link href="/admin" className="flex items-center gap-2">
          <Image
            src="/brand/unnify-logo.png"
            alt="Unnify"
            width={150}
            height={50}
            className="h-8 w-auto"
          />
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href ||
            (item.href === '/admin' && pathname === '/admin');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Card */}
      <div className="p-4 border-t border-gray-200">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 text-center">
          <p className="text-sm font-bold text-gray-900 mb-2">
            Unnify Conecta
          </p>
          <p className="text-xs text-gray-700 leading-snug mb-3">
            Gestão simples,
            <br />
            empresas mais fortes.
          </p>
          <p className="text-xs text-gray-500 font-medium">v1.0.0</p>
        </div>
      </div>
    </aside>
  );
}
