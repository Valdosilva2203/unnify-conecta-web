'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, MapPin, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { FUNCOES, mensagemDeErro, type Funcao } from '@/lib/contabil';
import { cnpjValido, dispararNotificacoes, enviarConviteApi, mascaraCnpj } from '@/lib/convites';

interface Encontrada { encontrada: boolean; nome: string | null; cidade: string | null; estado: string | null; situacao_vinculo: string | null }
type Etapa = { tipo: 'cnpj' } | { tipo: 'encontrada'; dados: Encontrada } | { tipo: 'nao_encontrada' } | { tipo: 'concluido'; texto: string; alerta?: boolean };
const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500';

// Cenários A (empresa cadastrada → solicitação) e B (não cadastrada → convite por e-mail). O banco valida tudo de novo.
export function ModalVincularEmpresa({ aberto, aoFechar, aoConcluir }: { aberto: boolean; aoFechar: () => void; aoConcluir: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'cnpj' });
  const [cnpj, setCnpj] = useState('');
  const [funcao, setFuncao] = useState<Funcao>('principal');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const fechar = () => { setEtapa({ tipo: 'cnpj' }); setCnpj(''); setEmail(''); setMensagem(''); setErro(null); aoFechar(); };
  const consultar = async () => {
    setErro(null);
    if (!cnpjValido(cnpj)) { setErro('CNPJ inválido. Confira os números digitados.'); return; }
    setOcupado(true);
    const { data, error } = await createClient().rpc('consultar_empresa_por_cnpj', { p_cnpj: cnpj });
    setOcupado(false);
    if (error) { setErro(mensagemDeErro(error, 'Não foi possível consultar agora.')); return; }
    const r = (data as Encontrada[])[0];
    setEtapa(r?.encontrada ? { tipo: 'encontrada', dados: r } : { tipo: 'nao_encontrada' });
  };
  const solicitar = async () => {
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('solicitar_vinculo_por_cnpj', { p_cnpj: cnpj, p_funcao: funcao });
    setOcupado(false);
    if (error) { setErro(mensagemDeErro(error, 'Não foi possível enviar a solicitação.')); return; }
    dispararNotificacoes();
    setEtapa({ tipo: 'concluido', texto: 'Solicitação enviada. Aguardando resposta da empresa — você terá acesso somente depois da aprovação.' });
    aoConcluir();
  };
  const convidar = async () => {
    setErro(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErro('Informe um e-mail válido.'); return; }
    setOcupado(true);
    const r = await enviarConviteApi({ sentido: 'contador_para_empresa', cnpj, email: email.trim(), mensagem, funcao });
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setEtapa(r.enviado
      ? { tipo: 'concluido', texto: `Convite enviado para ${email.trim()}. Aguardando o empresário criar a conta e aceitar.` }
      : { tipo: 'concluido', alerta: true, texto: 'Convite registrado, mas não conseguimos enviar o e-mail. Use “Reenviar” em Convites enviados.' });
    aoConcluir();
  };

  const rodape = etapa.tipo === 'concluido' ? (
    <button type="button" className={classeBotaoPrimario} onClick={fechar}>Concluir</button>
  ) : (
    <>
      <button type="button" className={classeBotaoSecundario} onClick={etapa.tipo === 'cnpj' ? fechar : () => { setEtapa({ tipo: 'cnpj' }); setErro(null); }}>
        {etapa.tipo === 'cnpj' ? 'Cancelar' : 'Voltar'}
      </button>
      {etapa.tipo === 'cnpj' && <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={consultar}><Search className="w-4 h-4" aria-hidden="true" />{ocupado ? 'Consultando...' : 'Buscar empresa'}</button>}
      {etapa.tipo === 'encontrada' && !etapa.dados.situacao_vinculo && <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={solicitar}>{ocupado ? 'Enviando...' : 'Solicitar vínculo'}</button>}
      {etapa.tipo === 'nao_encontrada' && <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={convidar}>{ocupado ? 'Enviando...' : 'Enviar convite'}</button>}
    </>
  );

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo="Vincular empresa" descricao="Informe o CNPJ da empresa que você atende." rodape={rodape}>
      <div className="space-y-4">
        {erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        {etapa.tipo === 'cnpj' && (
          <div>
            <label htmlFor="vincular-cnpj" className="block text-sm font-semibold text-gray-900 mb-2">CNPJ da empresa</label>
            <input id="vincular-cnpj" inputMode="numeric" autoComplete="off" placeholder="00.000.000/0000-00" value={cnpj}
              onChange={(e) => setCnpj(mascaraCnpj(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && consultar()} className={campo} />
          </div>
        )}
        {etapa.tipo === 'encontrada' && (
          <>
            <div className="rounded-xl border border-gray-200 p-4 flex gap-3" data-testid="empresa-encontrada">
              <span className="w-11 h-11 shrink-0 rounded-full bg-blue-50 text-blue-600 inline-flex items-center justify-center"><Building2 className="w-5 h-5" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 break-words">{etapa.dados.nome}</p>
                <p className="text-sm text-gray-600">CNPJ {cnpj}</p>
                {(etapa.dados.cidade || etapa.dados.estado) && <p className="text-sm text-gray-600 inline-flex items-center gap-1"><MapPin className="w-4 h-4" aria-hidden="true" />{[etapa.dados.cidade, etapa.dados.estado].filter(Boolean).join('/')}</p>}
              </div>
            </div>
            {etapa.dados.situacao_vinculo === 'ativo' && <p className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">Você já está vinculado a esta empresa.</p>}
            {etapa.dados.situacao_vinculo === 'pendente' && <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">Já existe uma solicitação aguardando resposta.</p>}
            {!etapa.dados.situacao_vinculo && (
              <>
                <div>
                  <label htmlFor="vincular-funcao" className="block text-sm font-semibold text-gray-900 mb-2">Função pretendida</label>
                  <select id="vincular-funcao" value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)} className={campo}>
                    {Object.entries(FUNCOES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </div>
                <p className="text-xs text-gray-500">A empresa recebe a solicitação, define o que você poderá acessar e decide se aceita. Nada é liberado antes disso.</p>
              </>
            )}
          </>
        )}
        {etapa.tipo === 'nao_encontrada' && (
          <>
            <p className="text-sm text-gray-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              Não encontramos essa empresa no Unnify Conecta. Convide o empresário para criar sua conta e conectar-se ao seu escritório.
            </p>
            <p className="text-sm text-gray-600">CNPJ informado: <strong className="text-gray-900">{cnpj}</strong></p>
            <div>
              <label htmlFor="convite-email-empresario" className="block text-sm font-semibold text-gray-900 mb-2">E-mail do empresário</label>
              <input id="convite-email-empresario" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="convite-mensagem-empresario" className="block text-sm font-semibold text-gray-900 mb-2">Mensagem (opcional)</label>
              <textarea id="convite-mensagem-empresario" rows={3} maxLength={500} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </>
        )}
        {etapa.tipo === 'concluido' && (
          <p role="status" className={`text-sm rounded-lg px-3 py-3 flex gap-2 ${etapa.alerta ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'}`}>
            <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />{etapa.texto}
          </p>
        )}
      </div>
    </Modal>
  );
}
