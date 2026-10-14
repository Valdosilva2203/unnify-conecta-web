'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Handshake, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { SeletorPermissoes } from '@/components/convites/SeletorPermissoes';
import { FUNCOES, mensagemDeErro, type Funcao, type Permissao } from '@/lib/contabil';
import { SITUACAO_CONVITE, dispararNotificacoes, esquecerTokenConvite, guardarTokenConvite, lerTokenConvite, mascaraCnpj, type DadosConvite } from '@/lib/convites';

type Usuario = { tipo: 'empresa' | 'contador' | null; empresaCompativel: string | null; email: string } | null;
type Estado = { fase: 'carregando' } | { fase: 'invalido' } | { fase: 'ok'; token: string; dados: DadosConvite; usuario: Usuario };

// Página pública do convite. O token chega no FRAGMENTO (#…): não vai a servidores nem a logs; é guardado só neste
// navegador para o cadastro/onboarding e removido da barra de endereço. Nada é criado aqui sem o aceite explícito.
export default function ConvitePage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<string | null>(null);

  useEffect(() => {
    const doLink = window.location.hash.slice(1);
    if (doLink) { guardarTokenConvite(doLink); window.history.replaceState(null, '', window.location.pathname); }
    const token = doLink || lerTokenConvite();
    if (!token) { setEstado({ fase: 'invalido' }); return; }
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('dados_convite', { p_token: token });
      const dados = (data as DadosConvite[] | null)?.[0];
      if (!dados) { setEstado({ fase: 'invalido' }); return; }
      setPermissoes(dados.permissoes as Permissao[]);
      const { data: { session } } = await supabase.auth.getSession();
      let usuario: Usuario = null;
      if (session?.user) {
        const { data: perfil } = await supabase.from('perfis').select('tipo_usuario').eq('id_usuario', session.user.id).maybeSingle();
        let empresaCompativel: string | null = null;
        if (dados.sentido === 'contador_para_empresa') {
          const { data: vinc } = await supabase.from('usuarios_empresas').select('id_empresa, empresas(cnpj)').eq('id_usuario', session.user.id).eq('ativo', true);
          const alvo = (vinc ?? []).find((v) => String((v.empresas as unknown as { cnpj: string } | null)?.cnpj ?? '').replace(/\D/g, '') === dados.cnpj_convidado);
          empresaCompativel = alvo?.id_empresa ?? null;
        }
        usuario = { tipo: (perfil?.tipo_usuario as 'empresa' | 'contador' | null) ?? null, empresaCompativel, email: session.user.email ?? '' };
      }
      setEstado({ fase: 'ok', token, dados, usuario });
    })();
  }, []);

  // Convite aberto num navegador com OUTRA conta logada (ex.: a do empresário que enviou): sai e segue como destinatário
  const sairDaConta = async () => {
    setOcupado(true);
    await createClient().auth.signOut();
    setOcupado(false);
    setErro(null);
    setEstado((e) => (e.fase === 'ok' ? { ...e, usuario: null } : e));
  };

  const responder = async (aceitar: boolean) => {
    if (estado.fase !== 'ok') return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('aceitar_convite_vinculo', {
      p_token: estado.token, p_aceitar: aceitar, p_id_empresa: estado.usuario?.empresaCompativel ?? null,
      p_permissoes: estado.dados.sentido === 'contador_para_empresa' ? permissoes : null,
    });
    setOcupado(false);
    if (error) { setErro(mensagemDeErro(error, 'Não foi possível responder ao convite.')); return; }
    esquecerTokenConvite();
    dispararNotificacoes();
    setConcluido(aceitar ? 'Convite aceito: vínculo ativado.' : 'Convite recusado. Nenhum vínculo foi criado.');
  };

  const conteudo = () => {
    if (estado.fase === 'carregando') return <div role="status" aria-label="Carregando" className="h-40 rounded-xl bg-gray-50 animate-pulse" />;
    if (estado.fase === 'invalido') {
      return (
        <div className="text-center py-6">
          <Lock className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
          <h1 className="text-xl font-bold text-gray-900">Convite inválido</h1>
          <p className="text-sm text-gray-600 mt-1">O link está incompleto ou foi substituído por um novo envio. Peça um novo convite a quem enviou.</p>
        </div>
      );
    }
    const { dados, usuario } = estado;
    const deContador = dados.sentido === 'contador_para_empresa';
    const quem = deContador ? `${dados.remetente ?? 'Um contador'}${dados.escritorio ? ` (${dados.escritorio})` : ''}` : dados.remetente ?? 'Uma empresa';
    const situacao = SITUACAO_CONVITE[dados.situacao];
    const podeResponder = !!usuario && (deContador ? usuario.tipo === 'empresa' && !!usuario.empresaCompativel : usuario.tipo === 'contador');
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="w-12 h-12 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><Handshake className="w-6 h-6" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">Você recebeu um convite</h1>
            <p className="text-sm text-gray-700 mt-1">
              <strong>{quem}</strong> {deContador
                ? <>convidou você a conectar a empresa de CNPJ <strong>{mascaraCnpj(dados.cnpj_convidado ?? '')}</strong> ao escritório no Unnify Conecta.</>
                : <>convidou você para atuar como <strong>{FUNCOES[dados.funcao as Funcao] ?? 'contador'}</strong> da empresa no Unnify Conecta.</>}
            </p>
          </div>
        </div>
        {dados.mensagem && <p className="text-sm text-gray-700 italic border-l-2 border-orange-400 pl-3">“{dados.mensagem}”</p>}
        <p className="text-xs text-gray-500">Enviado para {dados.email_mascarado} · {dados.situacao === 'pendente' ? `válido até ${new Date(dados.expira_em).toLocaleDateString('pt-BR')}` : situacao.texto}</p>

        {concluido ? (
          <div className="space-y-3">
            <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{concluido}</p>
            <Link href={usuario?.tipo === 'contador' ? '/contador' : '/app/meu-contador'} className={classeBotaoPrimario}>Ir para o painel</Link>
          </div>
        ) : dados.situacao !== 'pendente' ? (
          <p role="status" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700" data-testid="situacao-convite">
            {dados.situacao === 'expirado' ? 'Este convite expirou. Peça um novo convite a quem enviou.'
              : dados.situacao === 'cancelado' ? 'Este convite foi cancelado por quem enviou.'
              : dados.situacao === 'aceito' ? 'Este convite já foi aceito.' : 'Este convite foi recusado.'}
          </p>
        ) : !usuario ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Crie sua conta usando <strong>o mesmo e-mail que recebeu o convite</strong>, confirme o e-mail e conclua o cadastro {deContador ? 'da empresa' : 'profissional'}. Você poderá aceitar ou recusar o vínculo durante o cadastro.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link href="/signup" className={classeBotaoPrimario}>Criar minha conta</Link>
              <Link href="/login" className={classeBotaoSecundario}>Já tenho conta</Link>
            </div>
          </div>
        ) : !usuario.tipo ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Conclua o seu cadastro para responder ao convite.</p>
            <Link href="/onboarding" className={classeBotaoPrimario}>Continuar cadastro</Link>
          </div>
        ) : !podeResponder ? (
          <div className="space-y-3" data-testid="conta-incompativel">
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Você está conectado como <strong className="break-all">{usuario.email}</strong>.{' '}
              {deContador ? (usuario.tipo === 'empresa' ? 'Nenhuma empresa sua corresponde ao CNPJ deste convite. Cadastre a empresa com esse CNPJ para aceitar.' : 'Este convite é para uma conta de empresa.')
                : 'Este convite é para uma conta de contador.'}
            </p>
            <p className="text-sm text-gray-700">Se o convite é para você, saia desta conta e entre (ou crie sua conta) com o e-mail que recebeu o convite.</p>
            <button type="button" disabled={ocupado} onClick={sairDaConta} className={classeBotaoPrimario}>
              {ocupado ? 'Saindo...' : deContador ? 'Sair e continuar como empresa' : 'Sair e continuar como contador'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-3">
              <SeletorPermissoes prefixo="convite" permissoes={permissoes} aoMudarPermissoes={setPermissoes} somenteLeitura={!deContador} />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" disabled={ocupado} className={classeBotaoSecundario} onClick={() => responder(false)}>Recusar</button>
              <button type="button" disabled={ocupado || permissoes.length === 0} className={classeBotaoPrimario} onClick={() => responder(true)}>{ocupado ? 'Enviando...' : 'Aceitar vínculo'}</button>
            </div>
          </div>
        )}
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        <p className="text-xs text-gray-400">Se você não reconhece este convite, ignore-o. Nenhum vínculo é criado sem a sua aceitação.</p>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-14">
      <div className="max-w-xl mx-auto space-y-6">
        <Link href="/" aria-label="Unnify Conecta — início" className="inline-block"><Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={150} height={50} className="h-8 w-auto" /></Link>
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-8">{conteudo()}</section>
      </div>
    </main>
  );
}
