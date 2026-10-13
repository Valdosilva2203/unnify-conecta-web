'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Archive, ArchiveRestore, Landmark, ListOrdered, Pencil, Plus, Star, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  CORES_CONTA, TIPOS_CONTA, formatarData, formatarMoeda, hojeBrasil, mascaraMoeda, paraDecimal, paraDecimalComSinal, valorParaMascara,
  type ContaFinanceira, type TipoConta,
} from '@/lib/financeiro';
import { BotaoIcone, Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { SeletorConta } from './SeletorConta';
import { SeletorCor } from '@/components/ui/SeletorCor';
import { corSobre } from '@/lib/cores';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

interface Movimentacao {
  id: string;
  natureza: 'entrada' | 'saida';
  valor: number;
  data: string;
  descricao: string;
  origem: 'lancamento' | 'transferencia';
  id_transferencia: string | null;
  estornada_em: string | null;
}

interface Props {
  idEmpresa: string;
  contas: ContaFinanceira[];
  aoAlterar: (mensagem: string) => void;
}

export function ContasBancos({ idEmpresa, contas, aoAlterar }: Props) {
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [editando, setEditando] = useState<ContaFinanceira | 'nova' | null>(null);
  const [transferindo, setTransferindo] = useState(false);
  const [extrato, setExtrato] = useState<ContaFinanceira | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ativas = contas.filter((c) => !c.arquivada_em);
  const visiveis = (mostrarArquivadas ? contas : ativas).slice().sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome));

  const executar = async (fn: () => PromiseLike<{ error: { message?: string } | null }>, sucesso: string) => {
    setErro(null);
    const { error } = await fn();
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível concluir a ação.'));
    aoAlterar(sucesso);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 max-w-2xl">
          Saldos calculados a partir do saldo inicial e das movimentações registradas no Unnify Conecta. <strong>Não são saldos bancários.</strong>
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" disabled={ativas.length < 2} onClick={() => setTransferindo(true)} className={classeBotaoSecundario} title={ativas.length < 2 ? 'Cadastre ao menos duas contas' : undefined}>
            <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
            Transferir
          </button>
          <button type="button" onClick={() => setEditando('nova')} className={classeBotaoPrimario}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Nova conta
          </button>
        </div>
      </div>

      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}

      {contas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-orange-300 p-8 text-center">
          <Landmark className="w-10 h-10 text-orange-500 mx-auto mb-3" aria-hidden="true" />
          <p className="font-semibold text-gray-900">Nenhuma conta cadastrada</p>
          <p className="text-sm text-gray-600 mt-1">Cadastre suas contas bancárias e o caixa físico para registrar pagamentos e recebimentos.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((c) => (
            <li key={c.id} data-testid={`card-${c.nome}`} style={{ borderTopColor: c.cor }} className={`bg-white rounded-2xl border border-gray-200 border-t-4 shadow-sm p-4 flex flex-col gap-3 ${c.arquivada_em ? 'opacity-70' : ''}`}>
              <div className="flex items-start gap-3">
                <span style={{ backgroundColor: c.cor, color: corSobre(c.cor) }} className="w-11 h-11 shrink-0 rounded-xl inline-flex items-center justify-center">
                  {c.tipo === 'caixa' ? <Wallet className="w-5 h-5" aria-hidden="true" /> : <Landmark className="w-5 h-5" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 break-words">{c.nome}</h3>
                  <p className="text-xs text-gray-500">{[c.instituicao, TIPOS_CONTA[c.tipo]].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c.principal && <Selo tipo="alerta" texto="Principal" />}
                  {c.arquivada_em && <Selo tipo="neutro" texto="Arquivada" />}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Saldo calculado</p>
                <p className={`text-xl font-bold ${Number(c.saldo) < 0 ? 'text-red-700' : 'text-gray-900'}`} data-testid={`saldo-${c.nome}`}>
                  {formatarMoeda(c.saldo)}
                </p>
                {c.permite_saldo_negativo && <p className="text-xs text-gray-500">Permite saldo negativo</p>}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                <BotaoIcone icone={ListOrdered} titulo={`Movimentações de ${c.nome}`} aoClicar={() => setExtrato(c)} />
                {!c.arquivada_em && <BotaoIcone icone={Pencil} titulo={`Editar ${c.nome}`} aoClicar={() => setEditando(c)} />}
                {!c.arquivada_em && !c.principal && (
                  <BotaoIcone icone={Star} titulo={`Tornar ${c.nome} a conta principal`} aoClicar={() => executar(() => createClient().rpc('definir_conta_principal', { p_id: c.id }), 'Conta principal definida.')} />
                )}
                <BotaoIcone
                  icone={c.arquivada_em ? ArchiveRestore : Archive}
                  titulo={`${c.arquivada_em ? 'Reativar' : 'Arquivar'} ${c.nome}`}
                  aoClicar={() => executar(() => createClient().rpc('arquivar_conta_financeira', { p_id: c.id, p_arquivar: !c.arquivada_em }), c.arquivada_em ? 'Conta reativada.' : 'Conta arquivada. O histórico foi mantido.')}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {contas.some((c) => c.arquivada_em) && (
        <label className="flex w-fit items-center gap-2 min-h-11 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={mostrarArquivadas} onChange={(e) => setMostrarArquivadas(e.target.checked)} />
          Mostrar contas arquivadas
        </label>
      )}

      <FormConta idEmpresa={idEmpresa} conta={editando} aoFechar={() => setEditando(null)} aoSalvar={(m) => { setEditando(null); aoAlterar(m); }} />
      <FormTransferencia aberto={transferindo} contas={contas} aoFechar={() => setTransferindo(false)} aoSalvar={(m) => { setTransferindo(false); aoAlterar(m); }} />
      <Extrato conta={extrato} aoFechar={() => setExtrato(null)} aoAlterar={aoAlterar} />
    </div>
  );
}

function FormConta({ idEmpresa, conta, aoFechar, aoSalvar }: { idEmpresa: string; conta: ContaFinanceira | 'nova' | null; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const nova = conta === 'nova';
  const [nome, setNome] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [tipo, setTipo] = useState<TipoConta>('conta_corrente');
  const [saldo, setSaldo] = useState('');
  const [negativoInicial, setNegativoInicial] = useState(false);
  const [data, setData] = useState('');
  const [permiteNegativo, setPermiteNegativo] = useState(false);
  const [cor, setCor] = useState(CORES_CONTA[0].valor);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!conta) return;
    const c = conta === 'nova' ? null : conta;
    setNome(c?.nome ?? '');
    setInstituicao(c?.instituicao ?? '');
    setTipo(c?.tipo ?? 'conta_corrente');
    setSaldo(c ? valorParaMascara(Math.abs(Number(c.saldo_inicial))) : '');
    setNegativoInicial(c ? Number(c.saldo_inicial) < 0 : false);
    setData(c?.data_saldo_inicial ?? hojeBrasil());
    setPermiteNegativo(c?.permite_saldo_negativo ?? false);
    setCor(c?.cor ?? CORES_CONTA[0].valor);
    setErro(null);
  }, [conta]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro('Informe o nome da conta.');
    const decimal = paraDecimalComSinal(`${negativoInicial ? '-' : ''}${saldo}`);
    if (decimal === null) return setErro('Saldo inicial inválido.');
    if (!data) return setErro('Informe a data do saldo inicial.');
    setSalvando(true);
    const { error } = await createClient().rpc('salvar_conta_financeira', {
      p_id: nova ? null : (conta as ContaFinanceira).id,
      p_id_empresa: idEmpresa,
      p_nome: nome.trim(),
      p_instituicao: tipo === 'caixa' ? null : instituicao.trim() || null,
      p_tipo: tipo,
      p_saldo_inicial: decimal,
      p_data_saldo_inicial: data,
      p_permite_saldo_negativo: permiteNegativo,
      p_cor: cor,
    });
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a conta.'));
    aoSalvar(nova ? 'Conta cadastrada.' : 'Conta atualizada.');
  };

  return (
    <Modal
      aberto={!!conta}
      aoFechar={aoFechar}
      titulo={nova ? 'Nova conta' : 'Editar conta'}
      rodape={
        <>
          <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-conta" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Salvando...' : 'Salvar conta'}</button>
        </>
      }
    >
      <form id="form-conta" onSubmit={salvar} noValidate className="space-y-4">
        <div>
          <label htmlFor="conta-nome" className={rotulo}>Nome da conta</label>
          <input id="conta-nome" maxLength={60} className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Banco do Brasil PJ" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="conta-tipo" className={rotulo}>Tipo</label>
            <select id="conta-tipo" className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)}>
              {Object.entries(TIPOS_CONTA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          {tipo !== 'caixa' && (
            <div>
              <label htmlFor="conta-instituicao" className={rotulo}>Instituição <span className="font-normal text-gray-500">(opcional)</span></label>
              <input id="conta-instituicao" maxLength={80} className={campo} value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="Ex.: Banco do Brasil" />
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="conta-saldo" className={rotulo}>Saldo inicial (R$)</label>
            <input id="conta-saldo" inputMode="numeric" className={campo} value={saldo} onChange={(e) => setSaldo(mascaraMoeda(e.target.value))} placeholder="0,00" />
            <label className="flex w-fit items-center gap-2 min-h-11 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={negativoInicial} onChange={(e) => setNegativoInicial(e.target.checked)} />
              Saldo inicial negativo
            </label>
          </div>
          <div>
            <label htmlFor="conta-data" className={rotulo}>Data do saldo inicial</label>
            <input id="conta-data" type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div>
          <SeletorCor rotulo="Cor do card" valor={cor} aoMudar={setCor} cores={CORES_CONTA} />
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 border-t-4 p-3" style={{ borderTopColor: cor }} aria-hidden="true">
            <span className="w-9 h-9 rounded-lg inline-flex items-center justify-center" style={{ backgroundColor: cor, color: corSobre(cor) }}>
              {tipo === 'caixa' ? <Wallet className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}
            </span>
            <span className="text-sm font-semibold text-gray-900 truncate">{nome || 'Prévia do card'}</span>
          </div>
        </div>
        <label className="flex items-start gap-2 min-h-11 text-sm text-gray-800 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-orange-600" checked={permiteNegativo} onChange={(e) => setPermiteNegativo(e.target.checked)} />
          <span>Permite saldo negativo <span className="block text-xs text-gray-500">Ex.: conta com cheque especial. Sem isso, pagamentos e transferências que deixariam a conta negativa são recusados.</span></span>
        </label>
        <p className="text-xs text-gray-500">Não informe senhas nem dados de acesso ao banco. O Unnify Conecta não se conecta ao seu banco nesta fase.</p>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}

function FormTransferencia({ aberto, contas, aoFechar, aoSalvar }: { aberto: boolean; contas: ContaFinanceira[]; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const travado = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    setOrigem(contas.find((c) => c.principal && !c.arquivada_em)?.id ?? '');
    setDestino('');
    setValor('');
    setData(hojeBrasil());
    setDescricao('');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [aberto]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (travado.current) return;
    if (!origem || !destino) return setErro('Escolha as contas de origem e destino.');
    if (origem === destino) return setErro('Origem e destino devem ser contas diferentes.');
    const decimal = paraDecimal(valor);
    if (!decimal) return setErro('Informe um valor maior que zero.');
    if (!data) return setErro('Informe a data.');
    travado.current = true;
    setSalvando(true);
    const { error } = await createClient().rpc('realizar_transferencia', {
      p_id_conta_origem: origem, p_id_conta_destino: destino, p_valor: decimal, p_data: data, p_descricao: descricao.trim() || null,
    });
    travado.current = false;
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível transferir.'));
    aoSalvar('Transferência registrada.');
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Transferência entre contas"
      descricao="Move valores entre contas da empresa. Não conta como receita nem despesa."
      rodape={
        <>
          <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-transferencia" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Transferindo...' : 'Transferir'}</button>
        </>
      }
    >
      <form id="form-transferencia" onSubmit={salvar} noValidate className="space-y-4">
        <SeletorConta id="transf-origem" rotulo="Conta de origem" contas={contas} idConta={origem} aoMudar={setOrigem} valor={paraDecimal(valor)} natureza="saida" />
        <SeletorConta id="transf-destino" rotulo="Conta de destino" contas={contas.filter((c) => c.id !== origem)} idConta={destino} aoMudar={setDestino} valor={paraDecimal(valor)} natureza="entrada" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="transf-valor" className={rotulo}>Valor (R$)</label>
            <input id="transf-valor" inputMode="numeric" className={campo} value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} placeholder="0,00" />
          </div>
          <div>
            <label htmlFor="transf-data" className={rotulo}>Data</label>
            <input id="transf-data" type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="transf-descricao" className={rotulo}>Descrição <span className="font-normal text-gray-500">(opcional)</span></label>
          <input id="transf-descricao" maxLength={200} className={campo} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}

function Extrato({ conta, aoFechar, aoAlterar }: { conta: ContaFinanceira | null; aoFechar: () => void; aoAlterar: (m: string) => void }) {
  const [itens, setItens] = useState<Movimentacao[]>([]);
  const [limite, setLimite] = useState(30);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!conta) return;
    const { data } = await createClient()
      .from('movimentacoes_financeiras')
      .select('id, natureza, valor, data, descricao, origem, id_transferencia, estornada_em')
      .eq('id_conta', conta.id)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(limite + 1);
    setTemMais((data ?? []).length > limite);
    setItens(((data ?? []) as Movimentacao[]).slice(0, limite));
  }, [conta, limite]);

  useEffect(() => {
    setErro(null);
    carregar();
  }, [carregar]);

  const estornar = async (m: Movimentacao) => {
    if (!m.id_transferencia) return;
    const { error } = await createClient().rpc('estornar_transferencia', { p_id: m.id_transferencia });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível estornar.'));
    await carregar();
    aoAlterar('Transferência estornada.');
  };

  return (
    <Modal aberto={!!conta} aoFechar={aoFechar} titulo={conta ? `Movimentações · ${conta.nome}` : ''} rodape={<button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Fechar</button>}>
      {conta && (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Saldo inicial {formatarMoeda(conta.saldo_inicial)} em {formatarData(conta.data_saldo_inicial)} · Saldo calculado <strong>{formatarMoeda(conta.saldo)}</strong>
          </p>
          {itens.length === 0 ? (
            <p className="text-gray-500 py-6 text-center">Nenhuma movimentação nesta conta.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {itens.map((m) => (
                <li key={m.id} className={`py-2.5 flex items-center gap-3 ${m.estornada_em ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-gray-900 break-words ${m.estornada_em ? 'line-through' : ''}`}>{m.descricao}</p>
                    <p className="text-xs text-gray-500">
                      {formatarData(m.data)} · {m.origem === 'transferencia' ? 'Transferência' : 'Lançamento'}
                      {m.estornada_em ? ' · estornada' : ''}
                    </p>
                  </div>
                  <span className={`font-semibold whitespace-nowrap ${m.natureza === 'entrada' ? 'text-green-700' : 'text-red-700'}`}>
                    {m.natureza === 'entrada' ? '+ ' : '− '}
                    {formatarMoeda(m.valor)}
                  </span>
                  {m.origem === 'transferencia' && !m.estornada_em && (
                    <button type="button" onClick={() => estornar(m)} className="min-h-11 px-2 text-xs font-semibold text-gray-600 underline">
                      Estornar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {temMais && (
            <button type="button" onClick={() => setLimite((l) => l + 30)} className={`${classeBotaoSecundario} w-full`}>
              Carregar mais
            </button>
          )}
          {erro && <p role="alert" className="text-red-700">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}
