'use client';

import { Suspense, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, User, Headphones, X, Building2, IdCard, ListChecks } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// Menu do ESCRITÓRIO (só funcionalidades existentes). Módulos de uma empresa (documentos, obrigações, impostos…)
// ficam no menu horizontal do espaço da empresa (/contador/empresas/[id]).
const menuItems = [
  { label: 'Início', icon: Home, href: '/contador' },
  { label: 'Minhas empresas', icon: Building2, href: '/contador/empresas' },
  { label: 'Agenda', icon: Calendar, href: '/contador/agenda' },
  { label: 'Tarefas', icon: ListChecks, href: '/contador/tarefas' },
  { label: 'Perfil profissional', icon: IdCard, href: '/contador/perfil-profissional' },
  { label: 'Minha conta', icon: User, href: '/contador/minha-conta' },
];

// usePathname suspende em rotas com parâmetro dinâmico (cacheComponents): fica dentro de <Suspense>.
function ListaMenuComRota({ onClose }: { onClose: () => void }) {
  return <ListaMenu pathname={usePathname()} onClose={onClose} />;
}

function ListaMenu({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  return (
    <nav aria-label="Menu principal" className="flex-1 overflow-y-auto py-4 lg:py-6 px-4 space-y-1">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === '/contador' ? pathname === '/contador' : pathname.startsWith(item.href);
        const isDisabled = item.href === '#';

        return isDisabled ? (
          <div
            key={item.label}
            aria-disabled="true"
            className="flex items-center justify-between gap-3 px-4 min-h-11 rounded-lg text-gray-400 cursor-default"
          >
            <span className="flex items-center gap-3">
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-sm font-medium">{item.label}</span>
            </span>
          </div>
        ) : (
          <Link
            key={item.label}
            href={item.href}
            onClick={onClose}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 px-4 min-h-11 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountantSidebar({ isOpen, onClose }: SidebarProps) {
  useEffect(() => {
    if (!isOpen) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [isOpen, onClose]);

  const conteudo = (
    <>
      <Suspense fallback={<ListaMenu pathname="" onClose={onClose} />}>
        <ListaMenuComRota onClose={onClose} />
      </Suspense>

      <div className="p-4 border-t border-gray-200 space-y-4">
        <div className="bg-orange-50 rounded-lg p-4 text-center">
          <Headphones className="w-6 h-6 text-orange-600 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Precisa de ajuda?</p>
          <p className="text-xs text-gray-600 mb-3">Nossa equipe está pronta para te ajudar.</p>
          <button
            type="button"
            className="w-full min-h-11 px-3 border border-orange-600 text-orange-600 rounded-lg text-xs font-semibold hover:bg-orange-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            Falar com o suporte
          </button>
        </div>
        <div className="text-center pt-4 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-900">Unnify Conecta</p>
          <p className="text-xs text-gray-500">v1.0.0</p>
        </div>
      </div>
    </>
  );

  const logo = (
    <Link href="/contador" onClick={onClose} className="flex items-center gap-2" aria-label="Unnify — início">
      <Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={200} height={67} className="h-8 w-auto" priority />
    </Link>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-64 shrink-0 bg-white border-r border-gray-200 flex-col overflow-y-auto">
        <div className="p-6 border-b border-gray-200">{logo}</div>
        {conteudo}
      </aside>

      {/* Celular e tablet: gaveta */}
      <div className={`lg:hidden fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`} aria-hidden={!isOpen}>
        <div
          className={`absolute inset-0 bg-gray-900/40 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
        <aside
          id="menu-contador"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          inert={!isOpen}
          className={`absolute inset-y-0 left-0 w-[85%] max-w-xs bg-white shadow-xl flex flex-col transition-transform duration-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            {logo}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar menu"
              className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          {conteudo}
        </aside>
      </div>
    </>
  );
}
