'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
  X,
  ListChecks,
  Wallet,
  FolderOpen,
} from 'lucide-react';

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/admin' },
  { label: 'Tarefas', icon: ListChecks, href: '/admin/tarefas' },
  { label: 'Financeiro', icon: Wallet, href: '/admin/financeiro', somenteMaster: true },
  { label: 'Empresas', icon: Building2, href: '/admin/empresas' },
  { label: 'Contadores', icon: Users, href: '/admin/contadores' },
  { label: 'Escritórios', icon: FileText, href: '/admin/escritorios' },
  { label: 'Assinaturas', icon: CreditCard, href: '/admin/assinaturas' },
  { label: 'Parceiros', icon: Users2, href: '/admin/parceiros' },
  { label: 'Comissões', icon: Percent, href: '/admin/comissoes' },
  { label: 'Usuários', icon: Users, href: '/admin/usuarios' },
  { label: 'Auditoria', icon: History, href: '/admin/auditoria' },
  { label: 'Documentos', icon: FolderOpen, href: '/admin/documentos', somenteMaster: true },
  { label: 'Configurações', icon: Settings, href: '/admin/configuracoes' },
];

function ConteudoMenu({ aoNavegar }: { aoNavegar?: () => void }) {
  const pathname = usePathname();
  // Financeiro da plataforma: só o Admin Master vê o item (o banco também bloqueia os demais)
  const [master, setMaster] = useState(false);
  useEffect(() => {
    createClient().rpc('admin_master_ativo').then(({ data }) => setMaster(data === true));
  }, []);

  return (
    <>
      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto py-4 md:py-6 px-4 space-y-1">
        {menuItems.filter((item) => !item.somenteMaster || master).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={aoNavegar}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 min-h-11 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 text-center">
          <p className="text-sm font-bold text-gray-900 mb-2">Unnify Conecta</p>
          <p className="text-xs text-gray-700 leading-snug mb-3">
            Gestão simples,
            <br />
            empresas mais fortes.
          </p>
          <p className="text-xs text-gray-500 font-medium">v1.0.0</p>
        </div>
      </div>
    </>
  );
}

function Logo({ aoNavegar }: { aoNavegar?: () => void }) {
  return (
    <Link href="/admin" onClick={aoNavegar} className="flex items-center gap-2" aria-label="Unnify — ir para o dashboard">
      <Image src="/brand/unnify-logo.png" alt="Unnify" width={150} height={50} className="h-8 w-auto" priority />
    </Link>
  );
}

export function AdminSidebar({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const pathname = usePathname();
  const painelRef = useRef<HTMLDivElement>(null);
  const botaoFecharRef = useRef<HTMLButtonElement>(null);

  // Fecha a gaveta ao trocar de página
  useEffect(() => {
    aoFechar();
  }, [pathname, aoFechar]);

  useEffect(() => {
    if (!aberto) return;

    const anterior = document.activeElement as HTMLElement | null;
    botaoFecharRef.current?.focus();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !painelRef.current) return;
      const focaveis = painelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, [aberto, aoFechar]);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-gray-200 flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-gray-200">
          <Logo />
        </div>
        <ConteudoMenu />
      </aside>

      {/* Celular e tablet: gaveta */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${aberto ? '' : 'pointer-events-none'}`}
        aria-hidden={!aberto}
      >
        <div
          className={`absolute inset-0 bg-gray-900/40 transition-opacity duration-200 ${aberto ? 'opacity-100' : 'opacity-0'}`}
          onClick={aoFechar}
        />
        <div
          ref={painelRef}
          id="menu-admin"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          inert={!aberto}
          className={`absolute inset-y-0 left-0 w-[85%] max-w-xs bg-white shadow-xl flex flex-col transition-transform duration-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] ${
            aberto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <Logo aoNavegar={aoFechar} />
            <button
              ref={botaoFecharRef}
              type="button"
              onClick={aoFechar}
              aria-label="Fechar menu"
              className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <ConteudoMenu aoNavegar={aoFechar} />
        </div>
      </div>
    </>
  );
}
