'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { CORES_CATEGORIA } from '@/lib/cores';
import { ROTULO_PRIORIDADE, type CategoriaTarefa, type ContextoTarefas, type Membro, type Prioridade, type Tarefa } from '@/lib/tarefas';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { SeletorCor } from '@/components/ui/SeletorCor';
import { SeletorIcone } from '@/components/ui/SeletorIcone';
import { IconeCategoria } from '@/components/financeiro/IconeCategoria';
import { BotaoIcone, Selo } from '@/components/admin/tabela';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

interface PropsForm {
  aberto: boolean;
  aoFechar: () => void;
  contexto: ContextoTarefas;
  idEmpresa: string | null;
  tarefa: Tarefa | null;
  categorias: CategoriaTarefa[];
  membros: Membro[];
  aoSalvar: (mensagem: string) => void;
  aoCriarCategoria: () => Promise<void>;
}

export function FormTarefa({ aberto, aoFechar, contexto, idEmpresa, tarefa, categorias, membros, aoSalvar, aoCriarCategoria }: PropsForm) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [idCategoria, setIdCategoria] = useState('');
  const [prioridade, setPrioridade] = useState<Prioridade>('media');
  const [prazo, setPrazo] = useState('');
  const [hora, setHora] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const travado = useRef(false);
  // Criação rápida de categoria sem sair da tarefa
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [nomeCategoria, setNomeCategoria] = useState('');
  const [corCategoria, setCorCategoria] = useState(CORES_CATEGORIA[2].valor);
  const [iconeCategoria, setIconeCategoria] = useState('tag');
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [erroCategoria, setErroCategoria] = useState<string | null>(null);

  const criarCategoria = async () => {
    if (nomeCategoria.trim().length < 2) return setErroCategoria('Informe o nome da categoria (mínimo 2 caracteres).');
    setCriandoCategoria(true);
    setErroCategoria(null);
    const { data, error } = await createClient().rpc('salvar_categoria_tarefa', {
      p_id: null, p_contexto: contexto, p_id_empresa: idEmpresa, p_nome: nomeCategoria.trim(), p_cor: corCategoria, p_icone: iconeCategoria,
    });
    if (error) {
      setCriandoCategoria(false);
      return setErroCategoria(mensagemDeErro(error, 'Não foi possível criar a categoria.'));
    }
    await aoCriarCategoria();
    setIdCategoria(data as string);
    setCriandoCategoria(false);
    setNovaCategoria(false);
  };

  useEffect(() => {
    if (!aberto) return;
    setNovaCategoria(false);
    setNomeCategoria('');
    setCorCategoria(CORES_CATEGORIA[2].valor);
    setIconeCategoria('tag');
    setErroCategoria(null);
    setTitulo(tarefa?.titulo ?? '');
    setDescricao(tarefa?.descricao ?? '');
    setIdCategoria(tarefa?.id_categoria ?? '');
    setPrioridade(tarefa?.prioridade ?? 'media');
    setPrazo(tarefa?.prazo ?? '');
    setHora(tarefa?.hora?.slice(0, 5) ?? '');
    setResponsavel(tarefa?.id_responsavel ?? '');
    setErro(null);
  }, [aberto, tarefa]);

  const opcoes = categorias.filter((c) => c.ativa || c.id === tarefa?.id_categoria);
  const escolhida = categorias.find((c) => c.id === idCategoria);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (travado.current) return;
    if (titulo.trim().length < 3) return setErro('Informe o título (mínimo 3 caracteres).');
    if (hora && !prazo) return setErro('Informe a data do prazo para usar horário.');
    travado.current = true;
    setSalvando(true);
    const { error } = await createClient().rpc('salvar_tarefa', {
      p_id: tarefa?.id ?? null,
      p_contexto: contexto,
      p_id_empresa: idEmpresa,
      p_titulo: titulo.trim(),
      p_descricao: descricao.trim() || null,
      p_id_categoria: idCategoria || null,
      p_prioridade: prioridade,
      p_prazo: prazo || null,
      p_hora: hora || null,
      p_id_responsavel: responsavel || null,
    });
    travado.current = false;
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a tarefa.'));
    aoSalvar(tarefa ? 'Tarefa atualizada.' : 'Tarefa criada.');
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={tarefa ? 'Editar tarefa' : 'Nova tarefa'}
      rodape={
        <>
          <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-tarefa" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Salvando...' : 'Salvar tarefa'}</button>
        </>
      }
    >
      <form id="form-tarefa" onSubmit={salvar} noValidate className="space-y-4">
        <div>
          <label htmlFor="tarefa-titulo" className={rotulo}>Título</label>
          <input id="tarefa-titulo" maxLength={200} className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Enviar documentos fiscais de setembro" />
        </div>
        <div>
          <label htmlFor="tarefa-descricao" className={rotulo}>Descrição <span className="font-normal text-gray-500">(opcional)</span></label>
          <textarea id="tarefa-descricao" rows={3} maxLength={4000} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tarefa-categoria" className={rotulo}>Categoria</label>
            <select id="tarefa-categoria" className={campo} value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)}>
              <option value="">Sem categoria</option>
              {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}{!c.ativa ? ' (desativada)' : ''}</option>)}
            </select>
            {escolhida && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-600" data-testid="categoria-tarefa-escolhida">
                <IconeCategoria icone={escolhida.icone} cor={escolhida.cor} tamanho="sm" />
                {escolhida.nome}
              </p>
            )}
            {!novaCategoria && (
              <button type="button" onClick={() => setNovaCategoria(true)} className="mt-1 min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700">
                <Plus className="w-4 h-4" aria-hidden="true" />Nova categoria
              </button>
            )}
          </div>
          <div>
            <label htmlFor="tarefa-responsavel" className={rotulo}>Responsável</label>
            <select id="tarefa-responsavel" className={campo} value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">Sem responsável</option>
              {membros.map((m) => <option key={m.id_usuario} value={m.id_usuario}>{m.nome}</option>)}
            </select>
          </div>
        </div>
        {novaCategoria && (
          <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-4" role="group" aria-label="Nova categoria">
            <div className="flex items-center gap-3">
              <IconeCategoria icone={iconeCategoria} cor={corCategoria} tamanho="lg" />
              <div className="flex-1 min-w-0">
                <label htmlFor="nova-categoria-nome" className={rotulo}>Nome da nova categoria</label>
                <input id="nova-categoria-nome" maxLength={60} className={campo} value={nomeCategoria} onChange={(e) => setNomeCategoria(e.target.value)} placeholder="Ex.: Fiscal" />
              </div>
            </div>
            <SeletorCor rotulo="Cor" valor={corCategoria} aoMudar={setCorCategoria} cores={CORES_CATEGORIA} />
            <SeletorIcone valor={iconeCategoria} aoMudar={setIconeCategoria} cor={corCategoria} />
            {erroCategoria && <p role="alert" className="text-sm text-red-700">{erroCategoria}</p>}
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={criarCategoria} disabled={criandoCategoria} className={classeBotaoPrimario}>{criandoCategoria ? 'Criando...' : 'Criar e usar'}</button>
              <button type="button" onClick={() => setNovaCategoria(false)} className={classeBotaoSecundario}>Cancelar</button>
            </div>
          </div>
        )}
        <fieldset>
          <legend className={rotulo}>Prioridade</legend>
          <div className="grid grid-cols-3 rounded-lg bg-gray-100 p-1" role="radiogroup">
            {(['baixa', 'media', 'alta'] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={prioridade === p} onClick={() => setPrioridade(p)}
                className={`min-h-10 rounded-md text-sm font-semibold ${prioridade === p ? 'bg-white shadow-sm ' + (p === 'alta' ? 'text-red-700' : p === 'media' ? 'text-orange-700' : 'text-green-700') : 'text-gray-600'}`}>
                {ROTULO_PRIORIDADE[p]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 grid-cols-2">
          <div>
            <label htmlFor="tarefa-prazo" className={rotulo}>Prazo</label>
            <input id="tarefa-prazo" type="date" className={campo} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tarefa-hora" className={rotulo}>Horário <span className="font-normal text-gray-500">(opcional)</span></label>
            <input id="tarefa-hora" type="time" className={campo} value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}

interface PropsCategorias {
  aberto: boolean;
  aoFechar: () => void;
  contexto: ContextoTarefas;
  idEmpresa: string | null;
  categorias: CategoriaTarefa[];
  aoAlterar: (mensagem: string) => void;
  iniciarNova?: boolean;
}

// Gerenciar categorias de tarefas (lista ↔ formulário na mesma janela)
export function CategoriasTarefas({ aberto, aoFechar, contexto, idEmpresa, categorias, aoAlterar, iniciarNova }: PropsCategorias) {
  const [editando, setEditando] = useState<CategoriaTarefa | 'nova' | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES_CATEGORIA[2].valor);
  const [icone, setIcone] = useState('tag');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return setEditando(null);
    if (iniciarNova) abrir('nova');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [aberto]);

  const abrir = (c: CategoriaTarefa | 'nova') => {
    setEditando(c);
    setNome(c === 'nova' ? '' : c.nome);
    setCor(c === 'nova' ? CORES_CATEGORIA[2].valor : c.cor);
    setIcone(c === 'nova' ? 'tag' : c.icone);
    setErro(null);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro('Informe o nome (mínimo 2 caracteres).');
    setSalvando(true);
    const { error } = await createClient().rpc('salvar_categoria_tarefa', {
      p_id: editando === 'nova' ? null : editando?.id, p_contexto: contexto, p_id_empresa: idEmpresa, p_nome: nome.trim(), p_cor: cor, p_icone: icone,
    });
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a categoria.'));
    aoAlterar(editando === 'nova' ? 'Categoria criada.' : 'Categoria atualizada.');
    setEditando(null);
  };

  const alternar = async (c: CategoriaTarefa) => {
    const { error } = await createClient().rpc('definir_categoria_tarefa_ativa', { p_id: c.id, p_ativa: !c.ativa });
    aoAlterar(error ? mensagemDeErro(error, 'Não foi possível alterar.') : c.ativa ? 'Categoria desativada.' : 'Categoria ativada.');
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? (editando === 'nova' ? 'Nova categoria' : 'Editar categoria') : 'Categorias de tarefas'}
      rodape={
        editando ? (
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setEditando(null)}><ArrowLeft className="w-4 h-4" aria-hidden="true" />Voltar</button>
            <button type="submit" form="form-categoria-tarefa" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Salvando...' : 'Salvar categoria'}</button>
          </>
        ) : (
          <>
            <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Fechar</button>
            <button type="button" className={classeBotaoPrimario} onClick={() => abrir('nova')}><Plus className="w-4 h-4" aria-hidden="true" />Nova categoria</button>
          </>
        )
      }
    >
      {editando ? (
        <form id="form-categoria-tarefa" onSubmit={salvar} noValidate className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3" data-testid="previa-categoria-tarefa">
            <IconeCategoria icone={icone} cor={cor} tamanho="lg" />
            <span className="text-sm font-semibold text-gray-900 truncate">{nome || 'Prévia da categoria'}</span>
          </div>
          <div>
            <label htmlFor="cat-tarefa-nome" className={rotulo}>Nome</label>
            <input id="cat-tarefa-nome" maxLength={60} className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <SeletorCor rotulo="Cor" valor={cor} aoMudar={setCor} cores={CORES_CATEGORIA} />
          <SeletorIcone valor={icone} aoMudar={setIcone} cor={cor} />
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </form>
      ) : categorias.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Nenhuma categoria ainda. Crie categorias para organizar as tarefas.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {categorias.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <IconeCategoria icone={c.icone} cor={c.cor} />
              <span className={`flex-1 min-w-0 text-sm ${c.ativa ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{c.nome}</span>
              {!c.ativa && <Selo tipo="neutro" texto="Desativada" />}
              <BotaoIcone icone={Pencil} titulo={`Editar ${c.nome}`} aoClicar={() => abrir(c)} />
              <button type="button" onClick={() => alternar(c)} className="min-h-11 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                {c.ativa ? 'Desativar' : 'Ativar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
