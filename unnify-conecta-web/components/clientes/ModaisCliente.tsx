'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [buscaCep, setBuscaCep] = useState<'buscando' | 'erro' | null>(null);
  const cepConsultado = useRef('');
  const autoCep = useRef<Record<string, string>>({}); // o que o CEP preencheu (pode ser trocado por outro CEP)

  const [buscaCnpj, setBuscaCnpj] = useState<'buscando' | 'erro' | 'ok' | null>(null);
  const cnpjConsultado = useRef('');
  const autoCnpj = useRef<Record<string, string>>({}); // o que o CNPJ preencheu (pode ser trocado por outro CNPJ)

  // Novo CNPJ: remove os dados que a consulta anterior preencheu, deixando o formulário pronto para a próxima empresa
  const limparDadosDoCnpj = () => {
    const auto = autoCnpj.current;
    if (!Object.keys(auto).length) return;
    autoCnpj.current = {};
    setF((x) => ({ ...x, ...Object.fromEntries(Object.keys(auto).filter((k) => x[k] === auto[k]).map((k) => [k, ''])) }));
    if (autoCep.current.cep === undefined) cepConsultado.current = ''; // o CEP anterior veio do CNPJ: libera nova consulta de CEP
  };

  // CNPJ válido (14 dígitos) → consulta pública BrasilAPI (só o CNPJ é enviado). Preenche campos vazios ou já vindos de CNPJ.
  const consultarCnpj = async (doc: string) => {
    const digitos = doc.replace(/\D/g, '');
    if (digitos.length !== 14 || digitos === cnpjConsultado.current || !documentoValido('pj', doc)) return;
    cnpjConsultado.current = digitos;
    setBuscaCnpj('buscando');
    try {
      let r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digitos, { signal: AbortSignal.timeout(10000) });
      if (r.status === 503 || r.status === 429) { // serviço instável: uma nova tentativa
        await new Promise((ok) => setTimeout(ok, 1500));
        if (cnpjConsultado.current !== digitos) return;
        r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digitos, { signal: AbortSignal.timeout(10000) });
      }
      if (cnpjConsultado.current !== digitos) return; // CNPJ já mudou
      if (!r.ok) { setBuscaCnpj('erro'); return; }
      const d = (await r.json()) as Record<string, unknown>;
      const t = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const fone = t(d.ddd_telefone_1, 11).replace(/\D/g, '');
      const cep = t(d.cep, 8).replace(/\D/g, '');
      const numero = t(d.numero, 20);
      const uf = t(d.uf, 2);
      const novos: Record<string, string> = {
        nome: t(d.razao_social, 150), fantasia: t(d.nome_fantasia, 150), telefone: fone.length >= 10 ? mascaraTelefone(fone) : '', email: t(d.email, 254).toLowerCase(),
        cep: cep.length === 8 ? mascaraCep(cep) : '', logradouro: t(d.logradouro, 150), numero: /^S\/?N$/i.test(numero) ? 'S/N' : numero, complemento: t(d.complemento, 80),
        bairro: t(d.bairro, 80), cidade: t(d.municipio, 80), estado: (UFS as readonly string[]).includes(uf) ? uf : '',
      };
      if (!novos.nome) { setBuscaCnpj('erro'); return; }
      const anterior = autoCnpj.current; // capturado fora do setF (a função de atualização pode rodar duas vezes)
      autoCnpj.current = novos;
      setF((x) => {
        const n = { ...x };
        for (const [k, v] of Object.entries(novos)) if (v && (!x[k] || x[k] === anterior[k])) n[k] = v;
        return n;
      });
      if (novos.cep) { cepConsultado.current = novos.cep.replace(/\D/g, ''); setBuscaCep(null); } // endereço já veio do CNPJ: o CEP não sobrescreve
      setBuscaCnpj('ok');
    } catch {
      if (cnpjConsultado.current === digitos) setBuscaCnpj('erro');
    }
  };

  // CEP completo (8 dígitos) → consulta pública ViaCEP (só o CEP é enviado). Preenche campos vazios ou já vindos de CEP.
  const consultarCep = async (cep: string) => {
    const digitos = cep.replace(/\D/g, '');
    if (digitos.length !== 8 || digitos === cepConsultado.current) return;
    cepConsultado.current = digitos;
    setBuscaCep('buscando');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal: AbortSignal.timeout(8000) });
      const d = (await r.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (cepConsultado.current !== digitos) return; // CEP já mudou
      if (!r.ok || d.erro) { setBuscaCep('erro'); return; }
      const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const novos: Record<string, string> = { logradouro: texto(d.logradouro, 150), bairro: texto(d.bairro, 80), cidade: texto(d.localidade, 80), estado: (UFS as readonly string[]).includes(d.uf ?? '') ? d.uf! : '' };
      const anterior = autoCep.current; // capturado fora do setF (a função de atualização pode rodar duas vezes)
      autoCep.current = novos;
      setF((x) => {
        const n = { ...x };
        for (const [k, v] of Object.entries(novos)) if (v && (!x[k] || x[k] === anterior[k])) n[k] = v;
        return n;
      });
      setBuscaCep(null);
      document.getElementById('cli-numero')?.focus();
    } catch {
      if (cepConsultado.current === digitos) setBuscaCep('erro');
    }
  };

  useEffect(() => {
    if (!aberto) return;
    const c = cliente;
    setErro(null); setTipo(c?.tipo_pessoa ?? 'pf'); setStatus(c?.status ?? 'ativo');
    setBuscaCep(null); cepConsultado.current = (c?.cep ?? '').replace(/\D/g, ''); autoCep.current = {};
    setBuscaCnpj(null); cnpjConsultado.current = c?.tipo_pessoa === 'pj' ? (c.documento ?? '').replace(/\D/g, '') : ''; autoCnpj.current = {};
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
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => { setTipo(t); set('documento', ''); setBuscaCnpj(null); cnpjConsultado.current = ''; }}
              className={`flex-1 min-h-11 rounded-lg border text-sm font-semibold ${tipo === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>
              {t === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">{input('nome', tipo === 'pf' ? 'Nome completo' : 'Razão social', { maxLength: 150 })}</div>
          {tipo === 'pj' && input('fantasia', 'Nome fantasia (opcional)', { maxLength: 150 })}
          <div><label htmlFor="cli-documento" className={rotulo}>{tipo === 'pf' ? 'CPF (opcional)' : 'CNPJ (opcional)'}</label>
            <input id="cli-documento" inputMode="numeric" value={f.documento ?? ''} aria-describedby="cli-doc-status" className={campo}
              onChange={(e) => { const v = mascaraDocumento(tipo, e.target.value); set('documento', v); if (tipo === 'pj') { if (v.replace(/\D/g, '') !== cnpjConsultado.current) limparDadosDoCnpj(); if (v.replace(/\D/g, '').length === 14) consultarCnpj(v); else { cnpjConsultado.current = ''; setBuscaCnpj(null); } } }} />
            <p id="cli-doc-status" role="status" className={`mt-1 text-xs ${buscaCnpj === 'erro' ? 'text-amber-700' : 'text-gray-500'}`}>
              {buscaCnpj === 'buscando' ? 'Buscando dados da empresa...' : buscaCnpj === 'ok' ? 'Dados da empresa preenchidos. Confira antes de salvar.' : buscaCnpj === 'erro' ? 'Não foi possível buscar os dados deste CNPJ. Preencha manualmente.' : ''}</p></div>
          {input('telefone', 'Telefone', { inputMode: 'tel' }, mascaraTelefone)}
          {input('email', 'E-mail', { type: 'email', maxLength: 254 })}
          <div><label htmlFor="cli-status" className={rotulo}>Situação</label>
            <select id="cli-status" value={status} onChange={(e) => setStatus(e.target.value as StatusCliente)} className={campo}>
              <option value="ativo">Ativo</option><option value="prospect">Prospect</option><option value="inativo">Inativo</option></select></div>
        </div>
        <fieldset className="grid sm:grid-cols-6 gap-4">
          <legend className="text-sm font-semibold text-gray-900 mb-1 sm:col-span-6">Endereço (opcional)</legend>
          <div className="sm:col-span-2"><label htmlFor="cli-cep" className={rotulo}>CEP</label>
            <input id="cli-cep" inputMode="numeric" value={f.cep ?? ''} aria-describedby="cli-cep-status" className={campo}
              onChange={(e) => { const v = mascaraCep(e.target.value); set('cep', v); if (v.replace(/\D/g, '').length === 8) consultarCep(v); else { cepConsultado.current = ''; setBuscaCep(null); } }} />
            <p id="cli-cep-status" role="status" className={`mt-1 text-xs ${buscaCep === 'erro' ? 'text-amber-700' : 'text-gray-500'}`}>
              {buscaCep === 'buscando' ? 'Buscando endereço...' : buscaCep === 'erro' ? 'CEP não encontrado. Preencha o endereço manualmente.' : ''}</p></div>
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
