'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import type { Categoria, TipoLancamento } from '@/lib/financeiro';
import { BotaoIcone, Selo, TabelaCard } from '@/components/admin/tabela';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ICONES_CATEGORIA, ICONE_PADRAO, IconeCategoria } from './IconeCategoria';
import { SeletorIcone } from '@/components/ui/SeletorIcone';
import { SeletorCor } from '@/components/ui/SeletorCor';
import { CORES_CATEGORIA } from '@/lib/cores';

const COR_INICIAL = CORES_CATEGORIA[0].valor;

// Janela de criar/editar categoria (cor + ícone). idEmpresa nulo = categoria da plataforma (Admin Master; só despesa).
export function ModalCategoria({ editando, tipo, idEmpresa, aoFechar, aoSalvar }: {
  editando: Categoria | 'nova' | null;
  tipo: TipoLancamento;
  idEmpresa: string | null;
  aoFechar: () => void;
  aoSalvar: (mensagem: string, id: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(COR_INICIAL);
  const [icone, setIcone] = useState(ICONE_PADRAO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!editando) return;
    setNome(editando === 'nova' ? '' : editando.nome);
    setCor(editando === 'nova' ? COR_INICIAL : editando.cor);
    setIcone(editando === 'nova' ? ICONE_PADRAO : editando.icone || ICONE_PADRAO);
    setErro(null);
  }, [editando]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (nome.trim().length < 2) return setErro('Informe o nome (mínimo 2 caracteres).');
    setSalvando(true);
    const id = editando === 'nova' ? null : editando?.id;
    const { data, error } = idEmpresa
      ? await createClient().rpc('salvar_categoria_financeira', { p_id: id, p_id_empresa: idEmpresa, p_tipo: tipo, p_nome: nome.trim(), p_cor: cor, p_icone: icone })
      : await createClient().rpc('salvar_categoria_plataforma', { p_id: id, p_nome: nome.trim(), p_cor: cor, p_icone: icone });
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a categoria.'));
    aoSalvar(editando === 'nova' ? 'Categoria criada.' : 'Categoria atualizada.', data as string);
  };

  return (
    <Modal
      aberto={!!editando}
      aoFechar={aoFechar}
      titulo={editando === 'nova' ? `Nova categoria de ${tipo === 'receita' ? 'receita' : 'despesa'}` : 'Editar categoria'}
      rodape={
        <>
          <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" form="form-categoria" disabled={salvando} className={classeBotaoPrimario}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-categoria" onSubmit={salvar} noValidate className="space-y-4">
        <div>
          <label htmlFor="cat-nome" className="block text-sm font-semibold text-gray-900 mb-1.5">
            Nome
          </label>
          <input id="cat-nome" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3" data-testid="previa-categoria">
          <IconeCategoria icone={icone} cor={cor} tamanho="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{nome || 'Prévia da categoria'}</p>
            <p className="text-xs text-gray-500">{tipo === 'receita' ? 'Receita' : 'Despesa'} · {ICONES_CATEGORIA.find((i) => i.id === icone)?.nome}</p>
          </div>
        </div>
        <SeletorCor rotulo="Cor" valor={cor} aoMudar={setCor} cores={CORES_CATEGORIA} />
        <SeletorIcone valor={icone} aoMudar={setIcone} cor={cor} />
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}

export function Categorias({ idEmpresa, categorias, aoAlterar }: { idEmpresa: string | null; categorias: Categoria[]; aoAlterar: (m: string) => void }) {
  const plataforma = idEmpresa === null;
  const [tipo, setTipo] = useState<TipoLancamento>(plataforma ? 'despesa' : 'receita');
  const [editando, setEditando] = useState<Categoria | 'nova' | null>(null);

  const alternar = async (c: Categoria) => {
    const { error } = await createClient().rpc('definir_categoria_financeira_ativa', { p_id: c.id, p_ativa: !c.ativa });
    aoAlterar(error ? mensagemDeErro(error, 'Não foi possível alterar a categoria.') : c.ativa ? 'Categoria desativada.' : 'Categoria ativada.');
  };

  const lista = categorias.filter((c) => c.tipo === tipo).sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome));

  return (
    <TabelaCard>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {plataforma ? (
          <p className="text-sm text-gray-600">Categorias das despesas administrativas da plataforma.</p>
        ) : (
          <div role="tablist" aria-label="Tipo de categoria" className="grid grid-cols-2 rounded-lg bg-gray-100 p-1 sm:w-72">
            {(['receita', 'despesa'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tipo === t} onClick={() => setTipo(t)} className={`min-h-10 rounded-md text-sm font-semibold ${tipo === t ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600'}`}>
                {t === 'receita' ? 'Receitas' : 'Despesas'}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setEditando('nova')} className={classeBotaoPrimario}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nova categoria
        </button>
      </div>
      <p className="text-xs text-gray-500">Categorias com lançamentos não são apagadas: desative para não usar mais.</p>
      <ul className="divide-y divide-gray-100">
        {lista.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <IconeCategoria icone={c.icone} cor={c.cor} />
            <span className={`flex-1 min-w-0 text-sm ${c.ativa ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{c.nome}</span>
            {!c.ativa && <Selo tipo="neutro" texto="Desativada" />}
            <BotaoIcone icone={Pencil} titulo={`Editar ${c.nome}`} aoClicar={() => setEditando(c)} />
            <button type="button" onClick={() => alternar(c)} className="min-h-11 min-[85rem]:min-h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              {c.ativa ? 'Desativar' : 'Ativar'}
            </button>
          </li>
        ))}
      </ul>

      <ModalCategoria editando={editando} tipo={tipo} idEmpresa={idEmpresa} aoFechar={() => setEditando(null)}
        aoSalvar={(m) => { setEditando(null); aoAlterar(m); }} />
    </TabelaCard>
  );
}
