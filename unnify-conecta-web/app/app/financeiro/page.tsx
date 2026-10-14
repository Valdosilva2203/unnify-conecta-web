'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { hojeBrasil, inicioDoMes, rotuloMes, somarMeses, type Categoria, type ContaFinanceira, type Lancamento, type TipoLancamento } from '@/lib/financeiro';
import { Aviso } from '@/components/conta/Aviso';
import { VisaoGeral } from '@/components/financeiro/VisaoGeral';
import { ListaLancamentos } from '@/components/financeiro/ListaLancamentos';
import { Categorias } from '@/components/financeiro/Categorias';
import { FormLancamento } from '@/components/financeiro/FormLancamento';
import { ContasBancos } from '@/components/financeiro/ContasBancos';
import { Parcelamentos } from '@/components/financeiro/Parcelamentos';
import { GastosFixos } from '@/components/financeiro/GastosFixos';

type Aba = 'visao' | 'lancamentos' | 'pagar' | 'receber' | 'gastos-fixos' | 'parcelamentos' | 'contas' | 'categorias';
const ABAS: { id: Aba; titulo: string }[] = [
  { id: 'visao', titulo: 'Visão geral' },
  { id: 'lancamentos', titulo: 'Lançamentos' },
  { id: 'pagar', titulo: 'Contas a pagar' },
  { id: 'receber', titulo: 'Contas a receber' },
  { id: 'gastos-fixos', titulo: 'Gastos fixos' },
  { id: 'parcelamentos', titulo: 'Parcelamentos' },
  { id: 'contas', titulo: 'Contas e bancos' },
  { id: 'categorias', titulo: 'Categorias' },
];
const ehAba = (v: string): v is Aba => ABAS.some((a) => a.id === v);

export default function FinanceiroPage() {
  const { empresa } = useEmpresaAtual();
  const [aba, setAba] = useState<Aba>('visao');
  const [periodo, setPeriodo] = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [menuNovo, setMenuNovo] = useState(false);
  const [categoriaInicial, setCategoriaInicial] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<{ tipo: TipoLancamento; lancamento: Lancamento | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Data atual só no navegador (cacheComponents não aceita new Date() na renderização)
  useEffect(() => {
    setPeriodo(inicioDoMes(hojeBrasil()));
  }, []);

  // A aba acompanha o #endereço (links diretos e voltar/avançar). ?categoria= abre a lista já filtrada (Saúde Empresarial).
  useEffect(() => {
    const sincronizar = () => {
      const h = window.location.hash.slice(1);
      const cat = new URLSearchParams(window.location.search).get('categoria');
      if (cat && /^[0-9a-f-]{36}$/i.test(cat)) setCategoriaInicial(cat);
      if (ehAba(h)) setAba(h);
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
    if (!empresa) return;
    const supabase = createClient();
    const buscar = () => supabase.from('categorias_financeiras').select('id, tipo, nome, cor, icone, ativa').eq('id_empresa', empresa.id).order('nome');
    let { data } = await buscar();
    if (data && data.length === 0) {
      // Primeira vez: cria as categorias iniciais (idempotente no banco)
      await supabase.rpc('inicializar_categorias_financeiras', { p_id_empresa: empresa.id });
      ({ data } = await buscar());
    }
    setCategorias((data ?? []) as Categoria[]);
  }, [empresa]);

  const carregarContas = useCallback(async () => {
    if (!empresa) return;
    const { data } = await createClient()
      .from('contas_financeiras_saldo')
      .select('id, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal, permite_saldo_negativo, arquivada_em, saldo, cor')
      .eq('id_empresa', empresa.id)
      .order('nome');
    setContas((data ?? []) as ContaFinanceira[]);
  }, [empresa]);

  useEffect(() => {
    carregarCategorias();
    carregarContas();
  }, [carregarCategorias, carregarContas]);

  useEffect(() => {
    if (!menuNovo) return;
    const fechar = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuNovo(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setMenuNovo(false);
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', tecla);
    };
  }, [menuNovo]);

  const alterado = (mensagem: string) => {
    setForm(null);
    setAviso(mensagem);
    setVersao((v) => v + 1);
    carregarCategorias();
    carregarContas();
  };

  const novo = (tipo: TipoLancamento) => {
    setMenuNovo(false);
    setForm({ tipo, lancamento: null });
  };

  if (!empresa || !periodo) return null;

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Financeiro</h1>
          <p className="text-gray-600 mt-1">Controle as finanças da sua empresa de forma simples e organizada.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2" role="group" aria-label="Período">
            <button type="button" onClick={() => setPeriodo((p) => somarMeses(p, -1))} aria-label="Mês anterior" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="flex-1 sm:flex-none min-h-11 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 whitespace-nowrap" aria-live="polite">
              <CalendarDays className="w-4 h-4 text-gray-500" aria-hidden="true" />
              {rotuloMes(periodo)}
            </span>
            <button type="button" onClick={() => setPeriodo((p) => somarMeses(p, 1))} aria-label="Próximo mês" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuNovo((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuNovo}
              className="w-full sm:w-auto min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Novo lançamento
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </button>
            {menuNovo && (
              <div role="menu" className="absolute right-0 mt-2 w-full sm:w-52 bg-white rounded-xl border border-gray-200 shadow-lg z-30 py-1">
                <button type="button" role="menuitem" onClick={() => novo('receita')} className="w-full min-h-11 px-4 text-left text-sm font-medium text-green-700 hover:bg-green-50">
                  Receita
                </button>
                <button type="button" role="menuitem" onClick={() => novo('despesa')} className="w-full min-h-11 px-4 text-left text-sm font-medium text-red-700 hover:bg-red-50">
                  Despesa
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav aria-label="Seções do financeiro" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex gap-1 border-b border-gray-200 min-w-max">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => irPara(a.id)}
              aria-current={aba === a.id ? 'page' : undefined}
              className={`min-h-11 px-4 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${aba === a.id ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            >
              {a.titulo}
            </button>
          ))}
        </div>
      </nav>

      {aviso && (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Aviso tipo={aviso.includes('Atenção') ? 'info' : 'sucesso'}>{aviso}</Aviso>
          </div>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="min-h-11 px-3 text-sm text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>
      )}

      {aba === 'visao' && <VisaoGeral idEmpresa={empresa.id} periodo={periodo} versao={versao} aoIrPara={irPara} aoNovo={() => setMenuNovo(true)} />}
      {(aba === 'lancamentos' || aba === 'pagar' || aba === 'receber') && (
        <ListaLancamentos
          key={`${aba}-${categoriaInicial ?? ''}`}
          modo={aba === 'lancamentos' ? 'todos' : aba}
          categoriaInicial={aba === 'lancamentos' ? categoriaInicial : undefined}
          idEmpresa={empresa.id}
          periodo={periodo}
          categorias={categorias}
          contas={contas}
          aoIrParaContas={() => irPara('contas')}
          versao={versao}
          aoEditar={(l) => setForm({ tipo: l.tipo, lancamento: l })}
          aoAlterar={alterado}
        />
      )}
      {aba === 'gastos-fixos' && (
        <GastosFixos contexto="empresa" idEmpresa={empresa.id} categorias={categorias} contas={contas} periodo={periodo} versao={versao} aoAlterar={alterado} aoIrParaContas={() => irPara('contas')} />
      )}
      {aba === 'parcelamentos' && (
        <Parcelamentos idEmpresa={empresa.id} categorias={categorias} contas={contas} versao={versao} aoAlterar={alterado} aoIrParaContas={() => irPara('contas')} />
      )}
      {aba === 'contas' && <ContasBancos idEmpresa={empresa.id} contas={contas} aoAlterar={alterado} />}
      {aba === 'categorias' && <Categorias idEmpresa={empresa.id} categorias={categorias} aoAlterar={alterado} />}

      <FormLancamento
        aberto={!!form}
        aoFechar={() => setForm(null)}
        idEmpresa={empresa.id}
        tipoInicial={form?.tipo ?? 'receita'}
        lancamento={form?.lancamento ?? null}
        categorias={categorias}
        contas={contas}
        aoIrParaContas={() => {
          setForm(null);
          irPara('contas');
        }}
        aoSalvar={alterado}
      />
    </div>
  );
}
