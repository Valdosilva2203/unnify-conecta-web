'use client';

import { useEffect, useState } from 'react';
import { Handshake } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FUNCOES, mensagemDeErro, type Funcao, type Permissao } from '@/lib/contabil';
import { dispararNotificacoes, esquecerTokenConvite, lerTokenConvite, mascaraCnpj, type DadosConvite } from '@/lib/convites';
import { SeletorPermissoes } from './SeletorPermissoes';

// Convite guardado neste navegador (vindo de /convite) que ainda pode ser respondido
export function useConvitePendente(sentido: DadosConvite['sentido']) {
  const [convite, setConvite] = useState<{ token: string; dados: DadosConvite } | null>(null);
  useEffect(() => {
    const token = lerTokenConvite();
    if (!token) return;
    createClient().rpc('dados_convite', { p_token: token }).then(({ data }) => {
      const d = (data as DadosConvite[] | null)?.[0];
      if (d && d.sentido === sentido && d.situacao === 'pendente') setConvite({ token, dados: d });
    });
  }, [sentido]);
  return convite;
}

export type DecisaoConvite = 'aceitar' | 'recusar' | null;

// Bloco do onboarding: mostra quem convidou e pede o aceite EXPLÍCITO (nada é marcado por padrão)
export function CartaoConviteOnboarding({ dados, decisao, aoDecidir, permissoes, aoMudarPermissoes, erro }: {
  dados: DadosConvite; decisao: DecisaoConvite; aoDecidir: (d: DecisaoConvite) => void;
  permissoes: Permissao[]; aoMudarPermissoes: (p: Permissao[]) => void; erro?: string;
}) {
  const deContador = dados.sentido === 'contador_para_empresa';
  const quem = deContador ? `${dados.remetente ?? 'Um contador'}${dados.escritorio ? ` (${dados.escritorio})` : ''}` : dados.remetente ?? 'Uma empresa';
  return (
    <fieldset className="rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-4 sm:p-5 space-y-3" aria-describedby="convite-onboarding-texto">
      <legend className="px-1 font-bold text-gray-900 inline-flex items-center gap-2"><Handshake className="w-5 h-5 text-orange-600" aria-hidden="true" />Convite de vínculo</legend>
      <p id="convite-onboarding-texto" className="text-sm text-gray-700">
        <strong>{quem}</strong> convidou você para se conectar no Unnify Conecta
        {deContador && dados.cnpj_convidado ? <> — empresa de CNPJ <strong>{mascaraCnpj(dados.cnpj_convidado)}</strong></> : <> como <strong>{FUNCOES[dados.funcao as Funcao] ?? 'contador'}</strong></>}.
      </p>
      {dados.mensagem && <p className="text-sm text-gray-700 italic border-l-2 border-orange-400 pl-3">“{dados.mensagem}”</p>}
      <div className="space-y-2">
        <label className="flex items-start gap-3 min-h-11 cursor-pointer">
          <input type="radio" name="decisao-convite" className="w-5 h-5 mt-0.5 accent-orange-600" checked={decisao === 'aceitar'} onChange={() => aoDecidir('aceitar')} />
          <span className="text-sm text-gray-900">Aceito o vínculo{deContador ? ' e autorizo os acessos abaixo' : ' com os acessos autorizados pela empresa'}</span>
        </label>
        <label className="flex items-start gap-3 min-h-11 cursor-pointer">
          <input type="radio" name="decisao-convite" className="w-5 h-5 mt-0.5 accent-orange-600" checked={decisao === 'recusar'} onChange={() => aoDecidir('recusar')} />
          <span className="text-sm text-gray-900">Não quero me vincular agora (concluir o cadastro sem vínculo)</span>
        </label>
      </div>
      {decisao === 'aceitar' && (
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <SeletorPermissoes prefixo="convite-onboarding" permissoes={permissoes} aoMudarPermissoes={aoMudarPermissoes} somenteLeitura={!deContador} />
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
    </fieldset>
  );
}

// Executa a decisão depois que o cadastro foi concluído. Resultado guardado para a tela de conclusão.
export async function responderConviteOnboarding(token: string, decisao: DecisaoConvite, idEmpresa: string | null, permissoes: Permissao[] | null) {
  if (!decisao) return;
  const { error } = await createClient().rpc('aceitar_convite_vinculo', {
    p_token: token, p_aceitar: decisao === 'aceitar', p_id_empresa: idEmpresa, p_permissoes: permissoes,
  });
  const texto = error
    ? `Cadastro concluído, mas o vínculo não foi criado: ${mensagemDeErro(error, 'tente pelo link do convite.')}`
    : decisao === 'aceitar' ? 'Convite aceito: vínculo ativado.' : 'Convite recusado. Nenhum vínculo foi criado.';
  try { sessionStorage.setItem('unnify:resultado-convite', JSON.stringify({ ok: !error, texto })); } catch { /* sem armazenamento */ }
  if (!error) { esquecerTokenConvite(); dispararNotificacoes(); }
}
