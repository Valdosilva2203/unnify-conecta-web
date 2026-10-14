'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro, UFS } from '@/lib/contabil';
import { formatarData, formatarMoeda } from '@/lib/financeiro';
import { documentoValido, mascaraCep, mascaraDocumento, mascaraTelefone, type ClienteCompleto, type StatusCliente } from '@/lib/clientes';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const Erro = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null);

export function ModalCliente({ aberto, aoFechar, idEmpresa, cliente, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; cliente: ClienteCompleto | null; aoSalvar: (m: string, id: string) => void;
}) {
  const [tipo, setTipo] = useState<'pf' | 'pj'>('pf');
  const [f, setF] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<StatusCliente>('ativo');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!aberto) return;
    const c = cliente;
    setErro(null); setTipo(c?.tipo_pessoa ?? 'pf'); setStatus(c?.status ?? 'ativo');
    setF({
      nome: c?.nome ?? '', fantasia: c?.nome_fantasia ?? '', documento: c?.documento ? mascaraDocumento(c.tipo_pessoa, c.documento) : '',
      telefone: c?.telefone ? mascaraTelefone(c.telefone) : '', email: c?.email ?? '', cep: c?.cep ? mascaraCep(c.cep) : '', logradouro: c?.logradouro ?? '',
      numero: c?.numero ?? '', complemento: c?.complemento ?? '', bairro: c?.bairro ?? '', cidade: c?.cidade ?? '', estado: c?.estado ?? '', obs: c?.observacoes ?? '',
    });
  }, [aberto, cliente]);

  const salvar = async () => {
    if ((f.nome ?? '').trim().length < 2) return setErro(tipo === 'pf' ? 'Informe o nome.' : 'Informe a razão social.');
    if (f.documento && !documentoValido(tipo, f.documento)) return setErro(tipo === 'pf' ? 'CPF inválido.' : 'CNPJ inválido.');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErro('E-mail inválido.');
    setOcupado(true); setErro(null);
    const { data, error } = await createClient().rpc('salvar_cliente', {
      p_id: cliente?.id ?? null, p_id_empresa: idEmpresa, p_tipo_pessoa: tipo, p_nome: f.nome, p_nome_fantasia: tipo === 'pj' ? f.fantasia || null : null,
      p_documento: f.documento || null, p_telefone: f.telefone || null, p_email: f.email || null, p_cep: f.cep || null, p_logradouro: f.logradouro || null,
      p_numero: f.numero || null, p_complemento: f.complemento || null, p_bairro: f.bairro || null, p_cidade: f.cidade || null, p_estado: f.estado || null,
      p_status: status, p_observacoes: f.obs || null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o cliente.'));
    aoSalvar(cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.', data as string);
  };

  const input = (k: string, label: string, props: Record<string, unknown> = {}, mascara?: (v: string) => string) => (
    <div><label htmlFor={`cli-${k}`} className={rotulo}>{label}</label>
      <input id={`cli-${k}`} value={f[k] ?? ''} onChange={(e) => set(k, mascara ? mascara(e.target.value) : e.target.value)} className={campo} {...props} /></div>
  );
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={cliente ? 'Editar cliente' : 'Novo cliente'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div role="radiogroup" aria-label="Tipo de pessoa" className="flex gap-2">
          {(['pf', 'pj'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => { setTipo(t); set('documento', ''); }}
              className={`flex-1 min-h-11 rounded-lg border text-sm font-semibold ${tipo === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>
              {t === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">{input('nome', tipo === 'pf' ? 'Nome completo' : 'Razão social', { maxLength: 150 })}</div>
          {tipo === 'pj' && input('fantasia', 'Nome fantasia (opcional)', { maxLength: 150 })}
          {input('documento', tipo === 'pf' ? 'CPF (opcional)' : 'CNPJ (opcional)', { inputMode: 'numeric' }, (v) => mascaraDocumento(tipo, v))}
          {input('telefone', 'Telefone', { inputMode: 'tel' }, mascaraTelefone)}
          {input('email', 'E-mail', { type: 'email', maxLength: 254 })}
          <div><label htmlFor="cli-status" className={rotulo}>Situação</label>
            <select id="cli-status" value={status} onChange={(e) => setStatus(e.target.value as StatusCliente)} className={campo}>
              <option value="ativo">Ativo</option><option value="prospect">Prospect</option><option value="inativo">Inativo</option></select></div>
        </div>
        <fieldset className="grid sm:grid-cols-6 gap-4">
          <legend className="text-sm font-semibold text-gray-900 mb-1 sm:col-span-6">Endereço (opcional)</legend>
          <div className="sm:col-span-2">{input('cep', 'CEP', { inputMode: 'numeric' }, mascaraCep)}</div>
          <div className="sm:col-span-4">{input('logradouro', 'Logradouro', { maxLength: 150 })}</div>
          <div className="sm:col-span-2">{input('numero', 'Número', { maxLength: 20 })}</div>
          <div className="sm:col-span-4">{input('complemento', 'Complemento', { maxLength: 80 })}</div>
          <div className="sm:col-span-3">{input('bairro', 'Bairro', { maxLength: 80 })}</div>
          <div className="sm:col-span-2">{input('cidade', 'Cidade', { maxLength: 80 })}</div>
          <div className="sm:col-span-1"><label htmlFor="cli-estado" className={rotulo}>UF</label>
            <select id="cli-estado" value={f.estado ?? ''} onChange={(e) => set('estado', e.target.value)} className={campo}><option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        </fieldset>
        <div><label htmlFor="cli-obs" className={rotulo}>Observações</label>
          <textarea id="cli-obs" rows={2} maxLength={2000} value={f.obs ?? ''} onChange={(e) => set('obs', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
        <p className="text-xs text-gray-500">Dados pessoais protegidos: visíveis só para a empresa e para quem ela autorizar.</p>
      </div>
    </Modal>
  );
}

interface ReceitaLivre { id: string; descricao: string; valor: number; status: string; data_vencimento: string | null; contraparte: string | null }
// Vincula receitas JÁ lançadas no Financeiro (nada é criado ou copiado)
export function ModalVincularReceita({ aberto, aoFechar, idEmpresa, idCliente, nomeCliente, aoConcluir }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; idCliente: string; nomeCliente: string; aoConcluir: (m: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ReceitaLivre[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (aberto) { setBusca(nomeCliente.split(' ')[0] ?? ''); setErro(null); } }, [aberto, nomeCliente]);
  useEffect(() => {
    if (!aberto) return;
    setItens(null);
    const t = setTimeout(() => {
      createClient().rpc('receitas_sem_cliente', { p_id_empresa: idEmpresa, p_busca: busca || null }).then(({ data, error }) => {
        if (error) { setErro(mensagemDeErro(error, 'Não foi possível buscar receitas.')); setItens([]); return; }
        setItens((data ?? []) as ReceitaLivre[]);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [aberto, busca, idEmpresa]);
  const vincular = async (id: string) => {
    const { error } = await createClient().rpc('vincular_cliente_lancamento', { p_id_lancamento: id, p_id_cliente: idCliente });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível vincular.'));
    aoConcluir('Receita vinculada ao cliente.');
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Vincular receita" descricao={`Receitas do Financeiro ainda sem cliente → ${nomeCliente}`}
      rodape={<button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Fechar</button>}>
      <div className="space-y-3">
        <Erro texto={erro} />
        <input type="search" aria-label="Buscar receita" placeholder="Buscar por descrição ou pagador..." value={busca} onChange={(e) => setBusca(e.target.value)} className={campo} />
        {itens === null ? <div role="status" aria-label="Carregando" className="h-24 rounded-lg bg-gray-50 animate-pulse" />
          : itens.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">Nenhuma receita sem cliente encontrada. Lance a receita no Financeiro e escolha o cliente no formulário.</p>
          : (
            <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {itens.map((l) => (
                <li key={l.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 truncate">{l.descricao}</span>
                    <span className="block text-xs text-gray-500">{l.contraparte ? `${l.contraparte} · ` : ''}{l.status === 'pago' ? 'Recebida' : `Vence ${formatarData(l.data_vencimento)}`}</span></span>
                  <span className="font-semibold whitespace-nowrap">{formatarMoeda(l.valor)}</span>
                  <button type="button" onClick={() => vincular(l.id)} className="min-h-11 px-3 rounded-lg text-sm font-semibold text-orange-600 hover:bg-orange-50">Vincular</button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Modal>
  );
}
