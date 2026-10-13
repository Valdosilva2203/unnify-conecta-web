'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, User, Building2, Settings, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface MenuPerfilEmpresaProps {
  nomeUsuario: string;
  email: string;
  nomeEmpresa: string;
  iniciais: string;
}

const opcoes: { icone: typeof User; rotulo: string; descricao: string; href?: string }[] = [
  { icone: User, rotulo: 'Minha conta', descricao: 'E-mail de acesso e segurança', href: '/app/minha-conta' },
  { icone: Building2, rotulo: 'Dados da empresa', descricao: 'Informações cadastrais da empresa' },
  { icone: Settings, rotulo: 'Configurações', descricao: 'Preferências e notificações' },
];

export function MenuPerfilEmpresa({ nomeUsuario, email, nomeEmpresa, iniciais }: MenuPerfilEmpresaProps) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const primeiroItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    primeiroItemRef.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        gatilhoRef.current?.focus();
      }
    };
    const aoClicarFora = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAberto(false);
    };

    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('touchstart', aoClicarFora);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('touchstart', aoClicarFora);
    };
  }, [aberto]);

  const sair = async () => {
    setSaindo(true);
    try {
      await createClient().auth.signOut();
      router.replace('/login');
    } catch {
      setSaindo(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls="menu-perfil-empresa"
        aria-label={`Menu do perfil de ${nomeUsuario}`}
        className="flex items-center gap-2 sm:gap-3 min-h-11 pl-1 pr-2 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        <span className="hidden sm:block text-right min-w-0">
          <span className="block text-sm font-semibold text-gray-900 truncate max-w-[200px]">{nomeUsuario}</span>
          <span className="block text-xs text-gray-500 truncate max-w-[200px]">{nomeEmpresa}</span>
        </span>
        <span
          className="w-10 h-10 shrink-0 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm"
          aria-hidden="true"
        >
          {iniciais}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 text-gray-600 shrink-0 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div
          id="menu-perfil-empresa"
          role="menu"
          aria-label="Opções do perfil"
          className="absolute top-full right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-80 max-h-[calc(100dvh-5rem)] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg z-50"
        >
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <span
              className="w-10 h-10 shrink-0 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              aria-hidden="true"
            >
              {iniciais}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{nomeUsuario}</p>
              <p className="text-xs text-gray-600 truncate">{email}</p>
              <p className="text-xs text-gray-500 truncate">{nomeEmpresa}</p>
            </div>
          </div>

          <div className="py-2">
            {opcoes.map((opcao, i) => {
              const Icone = opcao.icone;
              if (opcao.href) {
                const destino = opcao.href;
                return (
                  <button
                    key={opcao.rotulo}
                    ref={i === 0 ? primeiroItemRef : undefined}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAberto(false);
                      router.push(destino);
                    }}
                    className="w-full min-h-11 px-4 py-3 text-left flex gap-3 items-start hover:bg-orange-50 focus-visible:bg-orange-50 focus-visible:outline-none transition-colors"
                  >
                    <Icone className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{opcao.rotulo}</span>
                      <span className="block text-xs text-gray-600">{opcao.descricao}</span>
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={opcao.rotulo}
                  ref={i === 0 ? primeiroItemRef : undefined}
                  type="button"
                  role="menuitem"
                  aria-disabled="true"
                  onClick={(e) => e.preventDefault()}
                  className="w-full min-h-11 px-4 py-3 text-left flex gap-3 items-start cursor-default focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  <Icone className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-500">{opcao.rotulo}</span>
                    <span className="block text-xs text-gray-400">{opcao.descricao}</span>
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-1">Em breve</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-100" />

          <button
            type="button"
            role="menuitem"
            onClick={sair}
            disabled={saindo}
            className="w-full min-h-11 px-4 py-3 text-left hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none transition-colors flex gap-3 items-start group disabled:opacity-50"
          >
            <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-gray-900 group-hover:text-red-600">
                {saindo ? 'Saindo...' : 'Sair da conta'}
              </span>
              <span className="block text-xs text-gray-600">Encerrar sua sessão com segurança</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
