'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { useAcessoAdminConfirmado } from '@/components/admin/GuardaAdmin';
import { Aviso } from '@/components/conta/Aviso';
import { GastosFixos } from '@/components/financeiro/GastosFixos';
import { Categorias } from '@/components/financeiro/Categorias';
import type { Categoria } from '@/lib/financeiro';

type Aba = 'gastos-fixos' | 'categorias';
const ABAS: { id: Aba; titulo: string }[] = [
  { id: 'gastos-fixos', titulo: 'Gastos fixos' },
  { id: 'categorias', titulo: 'Categorias' },
];

// Financeiro da administração do Unnify (contexto 'plataforma', somente Admin Master).
// Não dá acesso a dados financeiros das empresas clientes: o isolamento é garantido no banco (RLS + funções).
export default function FinanceiroAdminPage() {
  const confirmado = useAcessoAdminConfirmado();
  return <AdminLayout>{confirmado && <FinanceiroPlataforma />}</AdminLayout>;
}

function FinanceiroPlataforma() {
  const [master, setMaster] = useState<boolean | null>(null);
  const [aba, setAba] = useState<Aba>('gastos-fixos');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    createClient().rpc('admin_master_ativo').then(({ data }) => setMaster(data === true));
  }, []);

  useEffect(() => {
    const sincronizar = () => {
      const h = window.location.hash.slice(1);
      if (ABAS.some((a) => a.id === h)) setAba(h as Aba);
    };
    sincronizar();
    window.addEventListener('hashchange', sincronizar);
    return () => window.removeEventListener('hashchange', sincronizar);
  }, []);

  const irPara = (a: Aba) => {
    setAba(a);
    if (window.location.hash !== `#${a}`) window.history.pushState(null, '', `#${a}`);
  };

  const carregarCategorias = useCallback(async () => {
    const supabase = createClient();
    const buscar = () => supabase.from('categorias_financeiras').select('id, tipo, nome, cor, icone, ativa').is('id_empresa', null).order('nome');
    let { data } = await buscar();
    if (data && data.length === 0) {
      // Primeira vez: categorias administrativas iniciais (idempotente no banco)
      await supabase.rpc('inicializar_categorias_plataforma');
      ({ data } = await buscar());
    }
    setCategorias((data ?? []) as Categoria[]);
  }, []);

  useEffect(() => {
    if (master) carregarCategorias();
  }, [master, carregarCategorias]);

  const alterado = (mensagem: string) => {
    setAviso(mensagem);
    setVersao((v) => v + 1);
    carregarCategorias();
  };

  if (master === null) return null;
  if (!master) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
        <p className="font-semibold text-gray-900">O financeiro da plataforma é restrito ao Admin Master.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Financeiro</h1>
        <p className="text-gray-600 mt-1">Despesas administrativas do Unnify Conecta. Dados financeiros das empresas clientes não aparecem aqui.</p>
      </div>

      <nav aria-label="Seções do financeiro" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex gap-1 border-b border-gray-200 min-w-max">
          {ABAS.map((a) => (
            <button key={a.id} type="button" onClick={() => irPara(a.id)} aria-current={aba === a.id ? 'page' : undefined}
              className={`min-h-11 px-4 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${aba === a.id ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
              {a.titulo}
            </button>
          ))}
        </div>
      </nav>

      {aviso && (
        <div className="flex items-start gap-2">
          <div className="flex-1"><Aviso tipo={aviso.includes('Atenção') ? 'info' : 'sucesso'}>{aviso}</Aviso></div>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="min-h-11 px-3 text-sm text-gray-500 hover:text-gray-800">✕</button>
        </div>
      )}

      {aba === 'gastos-fixos' && <GastosFixos contexto="plataforma" idEmpresa={null} categorias={categorias} contas={[]} versao={versao} aoAlterar={alterado} />}
      {aba === 'categorias' && <Categorias idEmpresa={null} categorias={categorias} aoAlterar={alterado} />}
    </div>
  );
}
