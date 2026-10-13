'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Download, UserX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatarData } from '@/lib/conta';
import { mensagemDeErro } from '@/lib/contabil';
import { Modal, classeBotaoPerigo, classeBotaoSecundario } from '@/components/ui/Modal';
import { Aviso } from './Aviso';

interface Solicitacao {
  id: string;
  status: 'pendente' | 'em_analise' | 'concluida' | 'recusada' | 'cancelada';
  criado_em: string;
  resposta: string | null;
}

// Desabilitado por decisão do produto até definir o que a exclusão faz (desativar, anonimizar, prazos legais).
// Reativar junto com o GRANT de solicitar_exclusao_conta no banco (ver migration 000021).
const EXCLUSAO_HABILITADA = false;

const ROTULO_STATUS: Record<Solicitacao['status'], string> = {
  pendente: 'Aguardando análise',
  em_analise: 'Em análise',
  concluida: 'Concluída',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

export function Privacidade() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [exportando, setExportando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [retorno, setRetorno] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await createClient()
      .from('solicitacoes_privacidade')
      .select('id, status, criado_em, resposta')
      .eq('tipo', 'exclusao_conta')
      .order('criado_em', { ascending: false });
    setSolicitacoes((data ?? []) as Solicitacao[]);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aberta = solicitacoes.find((s) => s.status === 'pendente' || s.status === 'em_analise');

  const exportar = async () => {
    setExportando(true);
    setRetorno(null);
    const { data, error } = await createClient().rpc('exportar_meus_dados');
    setExportando(false);
    if (error || !data) return setRetorno({ tipo: 'erro', texto: 'Não foi possível gerar o arquivo. Tente novamente.' });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meus-dados-unnify-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setRetorno({ tipo: 'sucesso', texto: 'Arquivo com seus dados pessoais gerado.' });
  };

  const solicitarExclusao = async () => {
    setEnviando(true);
    const { error } = await createClient().rpc('solicitar_exclusao_conta', { p_motivo: motivo });
    setEnviando(false);
    setConfirmando(false);
    if (error) return setRetorno({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível registrar a solicitação.') });
    setMotivo('');
    setEntendi(false);
    await carregar();
    setRetorno({ tipo: 'info', texto: 'Solicitação registrada. A equipe do Unnify Conecta vai analisar e responder. Sua conta continua ativa até lá.' });
  };

  const cancelar = async (id: string) => {
    const { error } = await createClient().rpc('cancelar_solicitacao_privacidade', { p_id: id });
    if (error) return setRetorno({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível cancelar.') });
    await carregar();
    setRetorno({ tipo: 'sucesso', texto: 'Solicitação de exclusão cancelada.' });
  };

  return (
    <section aria-labelledby="titulo-privacidade" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-6">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-orange-100 text-orange-600 inline-flex items-center justify-center">
          <FileText className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="titulo-privacidade" className="text-lg font-bold text-gray-900">
            Privacidade e dados
          </h2>
          <p className="text-sm text-gray-600">Seus dados e solicitações.</p>
        </div>
      </div>

      <div className="text-sm text-gray-700 space-y-2">
        <h3 className="font-semibold text-gray-900">Como tratamos seus dados</h3>
        <p>Usamos seus dados pessoais (nome, e-mail, telefone e foto) para identificar você e permitir o acesso às empresas e escritórios aos quais você está vinculado. Não usamos seus dados para publicidade.</p>
        <p>Dados fiscais, contábeis e empresariais pertencem às empresas e podem precisar ser mantidos por obrigação legal, mesmo após o encerramento da sua conta.</p>
        <p className="text-gray-500">Os Termos de Uso e a Política de Privacidade estão em elaboração e serão publicados aqui.</p>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-sm font-semibold text-gray-900">Baixar meus dados</h3>
        <p className="text-sm text-gray-600 mt-1">Gera um arquivo com seus dados pessoais, preferências e a lista de vínculos da sua conta.</p>
        <button type="button" onClick={exportar} disabled={exportando} className={`${classeBotaoSecundario} mt-3 w-full sm:w-auto`}>
          <Download className="w-4 h-4" aria-hidden="true" />
          {exportando ? 'Gerando...' : 'Baixar meus dados'}
        </button>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-sm font-semibold text-gray-900">
          Encerrar conta
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Em breve</span>
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          A solicitação de exclusão de conta ainda não está disponível. Quando for liberada, será analisada pela equipe do Unnify Conecta, respeitando as obrigações de guarda de dados fiscais e contábeis.
        </p>
        {/* Exclusão desabilitada até a definição do processo (EXCLUSAO_HABILITADA). */}
        {!EXCLUSAO_HABILITADA ? (
          <button type="button" disabled aria-disabled="true" className={`${classeBotaoSecundario} mt-3 w-full sm:w-auto`}>
            <UserX className="w-4 h-4" aria-hidden="true" />
            Solicitar exclusão da conta
          </button>
        ) : aberta ? (
          <div className="mt-3">
            <Aviso tipo="info">
              <p>
                <strong>Solicitação de exclusão: {ROTULO_STATUS[aberta.status]}</strong> (enviada em {formatarData(aberta.criado_em)}).
              </p>
              {aberta.status === 'pendente' && (
                <button type="button" onClick={() => cancelar(aberta.id)} className="mt-2 min-h-11 font-semibold underline">
                  Cancelar solicitação
                </button>
              )}
            </Aviso>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmando(true)} className={`${classeBotaoSecundario} mt-3 w-full sm:w-auto text-red-700 border-red-200 hover:bg-red-50`}>
            <UserX className="w-4 h-4" aria-hidden="true" />
            Solicitar exclusão da conta
          </button>
        )}
        {solicitacoes.filter((s) => s !== aberta).length > 0 && (
          <ul className="mt-3 text-xs text-gray-500 space-y-1">
            {solicitacoes
              .filter((s) => s !== aberta)
              .map((s) => (
                <li key={s.id}>
                  {formatarData(s.criado_em)} — {ROTULO_STATUS[s.status]}
                  {s.resposta ? `: ${s.resposta}` : ''}
                </li>
              ))}
          </ul>
        )}
      </div>

      {retorno && <Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso>}

      <Modal
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo="Solicitar exclusão da conta"
        descricao="A solicitação será analisada pela equipe. Você será avisado da decisão."
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setConfirmando(false)}>
              Voltar
            </button>
            <button type="button" className={classeBotaoPerigo} disabled={!entendi || enviando} onClick={solicitarExclusao}>
              {enviando ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </>
        }
      >
        <label htmlFor="motivo-exclusao" className="block text-sm font-semibold text-gray-900 mb-2">
          Motivo (opcional)
        </label>
        <textarea
          id="motivo-exclusao"
          rows={3}
          maxLength={1000}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <label className="mt-3 flex items-start gap-2 min-h-11 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-orange-600" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
          Entendo que dados fiscais, contábeis e empresariais podem ser mantidos por obrigação legal.
        </label>
      </Modal>
    </section>
  );
}
