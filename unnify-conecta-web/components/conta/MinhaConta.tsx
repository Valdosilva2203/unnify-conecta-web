'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, LogOut, Mail, ShieldCheck, Bell, SlidersHorizontal, FileText, User as IconeUsuario, UserCircle2, CalendarDays, CircleCheck, UserCog } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { PREFERENCIAS_PADRAO, formatarData, formatarDataHora, rotuloDoPerfil, type PerfilPessoal, type Preferencias, type Secao } from '@/lib/conta';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { AvatarUsuario } from './AvatarUsuario';
import { DadosPessoais } from './DadosPessoais';
import { SecaoSeguranca } from './SecaoSeguranca';
import { Notificacoes, PreferenciasExibicao } from './SecoesPreferencias';
import { Privacidade } from './Privacidade';
import { CabecalhoModulo } from '@/components/navegacao/NavegacaoModulos';

const SECOES: { id: Secao; titulo: string; descricao: string; icone: typeof IconeUsuario; cor: string }[] = [
  { id: 'dados', titulo: 'Dados pessoais', descricao: 'Nome, foto e telefone', icone: IconeUsuario, cor: 'bg-orange-100 text-orange-600' },
  { id: 'seguranca', titulo: 'Segurança da conta', descricao: 'E-mail, senha e autenticação', icone: ShieldCheck, cor: 'bg-green-100 text-green-700' },
  { id: 'notificacoes', titulo: 'Notificações', descricao: 'Alertas e comunicados', icone: Bell, cor: 'bg-amber-100 text-amber-700' },
  { id: 'preferencias', titulo: 'Preferências', descricao: 'Tema e visualização', icone: SlidersHorizontal, cor: 'bg-violet-100 text-violet-700' },
  { id: 'privacidade', titulo: 'Privacidade e dados', descricao: 'Seus dados e solicitações', icone: FileText, cor: 'bg-rose-100 text-rose-700' },
];

const ehSecao = (v: string): v is Secao => SECOES.some((s) => s.id === v);

// Minha conta: identidade PESSOAL do usuário (igual para empresário, contador, escritório e administradores).
// Dados de empresa, escritório, perfil profissional e configurações da plataforma ficam nos próprios módulos.
export function MinhaConta({ secaoInicial }: { secaoInicial?: Secao }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<PerfilPessoal | null>(null);
  const [preferencias, setPreferencias] = useState<Preferencias>(PREFERENCIAS_PADRAO);
  const [temEscritorio, setTemEscritorio] = useState(false);
  const [erro, setErro] = useState(false);
  const [secao, setSecao] = useState<Secao>(secaoInicial ?? 'dados');
  const [listaNoCelular, setListaNoCelular] = useState(!secaoInicial);
  const [focarNome, setFocarNome] = useState(0);
  const [saindo, setSaindo] = useState(false);

  // A seção acompanha o #endereço (links diretos, voltar/avançar do navegador).
  useEffect(() => {
    const sincronizar = () => {
      const doEndereco = window.location.hash.slice(1);
      if (ehSecao(doEndereco)) {
        setSecao(doEndereco);
        setListaNoCelular(false);
      }
    };
    sincronizar();
    window.addEventListener('hashchange', sincronizar);
    return () => window.removeEventListener('hashchange', sincronizar);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setErro(true);
      const [{ data: dadosPerfil, error: erroPerfil }, { data: pref }, { data: vinculos }] = await Promise.all([
        supabase.from('perfis').select('nome_completo, telefone, url_avatar, funcao_global, tipo_usuario, status').eq('id_usuario', user.id).single(),
        supabase.from('preferencias_usuario').select('notificacoes, reduzir_animacoes').eq('id_usuario', user.id).maybeSingle(),
        supabase.from('usuarios_empresas').select('empresas(tipo_empresa)').eq('id_usuario', user.id).eq('ativo', true),
      ]);
      if (erroPerfil || !dadosPerfil) return setErro(true);
      setUsuario(user);
      setPerfil(dadosPerfil as PerfilPessoal);
      if (pref) setPreferencias({ notificacoes: (pref.notificacoes ?? {}) as Preferencias['notificacoes'], reduzir_animacoes: !!pref.reduzir_animacoes });
      setTemEscritorio(
        (vinculos ?? []).some((v) => {
          const e = v.empresas as { tipo_empresa?: string } | { tipo_empresa?: string }[] | null;
          return (Array.isArray(e) ? e : [e]).some((x) => x?.tipo_empresa === 'escritorio_contabil');
        })
      );
    })().catch(() => setErro(true));
  }, []);

  const abrir = (s: Secao) => {
    setSecao(s);
    setListaNoCelular(false);
    if (window.location.hash !== `#${s}`) window.history.pushState(null, '', `#${s}`);
  };

  const sair = async () => {
    setSaindo(true);
    await createClient().auth.signOut();
    // Recarrega a página de login para não deixar dados da conta na memória do navegador.
    window.location.replace('/login');
  };

  if (erro) {
    return (
      <div role="alert" className="bg-white rounded-2xl border border-red-200 p-6 text-red-700">
        Não foi possível carregar sua conta. Atualize a página ou entre novamente.
      </div>
    );
  }

  if (!usuario || !perfil) {
    return (
      <div className="space-y-5" role="status" aria-label="Carregando">
        <div className="h-10 w-48 rounded-lg bg-gray-200 animate-pulse" />
        <div className="h-36 rounded-2xl bg-white border border-gray-100 animate-pulse" />
        <div className="h-64 rounded-2xl bg-white border border-gray-100 animate-pulse" />
      </div>
    );
  }

  const nome = perfil.nome_completo || usuario.email?.split('@')[0] || 'Usuário';
  const ativa = perfil.status === 'active';
  const rotulo = rotuloDoPerfil(perfil, temEscritorio);
  const atual = SECOES.find((s) => s.id === secao)!;

  const conteudo =
    secao === 'dados' ? (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DadosPessoais idUsuario={usuario.id} perfil={perfil} focarNome={focarNome} aoAtualizar={(p) => setPerfil((atualPerfil) => (atualPerfil ? { ...atualPerfil, ...p } : atualPerfil))} />
        <section aria-labelledby="titulo-info-conta" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 h-fit">
          <h2 id="titulo-info-conta" className="text-lg font-bold text-gray-900 mb-4">
            Informações da conta
          </h2>
          <dl className="space-y-4 text-sm">
            <div className="flex gap-3">
              <Mail className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-gray-500">E-mail</dt>
                <dd className="font-medium text-gray-900 break-all">{usuario.email}</dd>
                {usuario.email_confirmed_at && <dd className="text-xs text-green-700 mt-0.5">✓ Verificado</dd>}
              </div>
            </div>
            <div className="flex gap-3">
              <UserCircle2 className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="text-gray-500">Perfil</dt>
                <dd className="font-medium text-gray-900">{rotulo}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <CalendarDays className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="text-gray-500">Membro desde</dt>
                <dd className="font-medium text-gray-900">{formatarData(usuario.created_at)}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <CircleCheck className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="text-gray-500">Status da conta</dt>
                <dd className={`font-medium ${ativa ? 'text-green-700' : 'text-gray-700'}`}>{ativa ? 'Ativa' : 'Inativa'}</dd>
              </div>
            </div>
          </dl>
          <button type="button" disabled aria-disabled="true" className="mt-5 w-full min-h-11 rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-sm font-semibold cursor-not-allowed">
            Encerrar conta · em breve
          </button>
        </section>
      </div>
    ) : secao === 'seguranca' ? (
      <SecaoSeguranca ultimoAcesso={usuario.last_sign_in_at ?? null} />
    ) : secao === 'notificacoes' ? (
      <Notificacoes idUsuario={usuario.id} preferencias={preferencias} aoSalvar={setPreferencias} />
    ) : secao === 'preferencias' ? (
      <PreferenciasExibicao idUsuario={usuario.id} preferencias={preferencias} aoSalvar={setPreferencias} />
    ) : (
      <Privacidade />
    );

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={UserCog} titulo="Minha conta" descricao="Gerencie suas informações pessoais, segurança e preferências." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="Resumo da conta" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <AvatarUsuario caminho={perfil.url_avatar} nome={nome} className="w-16 h-16 sm:w-20 sm:h-20 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg sm:text-xl font-bold text-gray-900 break-words">{nome}</p>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${ativa ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{ativa ? 'Conta ativa' : 'Conta inativa'}</span>
            </div>
            <p className="text-sm text-gray-600 break-all flex items-center gap-1.5 mt-1">
              <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
              {usuario.email}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{rotulo}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              abrir('dados');
              setFocarNome((n) => n + 1);
            }}
            className={`${classeBotaoPrimario} w-full sm:w-auto`}
          >
            Editar perfil
          </button>
        </section>
        <section aria-label="Último acesso" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 flex items-center gap-3">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-sky-50 text-sky-600 inline-flex items-center justify-center">
            <Clock className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="text-sm">
            <p className="text-gray-500">Último acesso</p>
            <p className="font-semibold text-gray-900">{formatarDataHora(usuario.last_sign_in_at)}</p>
          </div>
        </section>
      </div>

      {/* Computador e tablet: abas */}
      <nav aria-label="Seções de Minha conta" className="hidden md:grid md:grid-cols-3 xl:grid-cols-5 gap-3">
        {SECOES.map((s) => {
          const Icone = s.icone;
          const ativo = s.id === secao;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => abrir(s.id)}
              aria-current={ativo ? 'page' : undefined}
              className={`text-left min-h-11 rounded-xl border bg-white px-3 py-3 flex items-center gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                ativo ? 'border-orange-300 ring-1 ring-orange-200 shadow-sm' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`w-9 h-9 shrink-0 rounded-lg inline-flex items-center justify-center ${s.cor}`}>
                <Icone className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${ativo ? 'text-orange-600' : 'text-gray-900'}`}>{s.titulo}</span>
                <span className="block text-xs text-gray-500 truncate">{s.descricao}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Celular: lista de seções */}
      {listaNoCelular && (
        <nav aria-label="Seções de Minha conta" className="md:hidden bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
          {SECOES.map((s) => {
            const Icone = s.icone;
            return (
              <button key={s.id} type="button" onClick={() => abrir(s.id)} className="w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50">
                <span className={`w-10 h-10 shrink-0 rounded-xl inline-flex items-center justify-center ${s.cor}`}>
                  <Icone className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{s.titulo}</span>
                  <span className="block text-xs text-gray-500">{s.descricao}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-gray-400" aria-hidden="true" />
              </button>
            );
          })}
          <button type="button" onClick={sair} disabled={saindo} className="w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left bg-red-50/50 hover:bg-red-50">
            <span className="w-10 h-10 shrink-0 rounded-xl inline-flex items-center justify-center bg-red-100 text-red-600">
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-red-700">{saindo ? 'Saindo...' : 'Sair da conta'}</span>
              <span className="block text-xs text-gray-500">Encerrar sua sessão</span>
            </span>
          </button>
        </nav>
      )}

      <div className={listaNoCelular ? 'hidden md:block' : ''}>
        <button type="button" onClick={() => setListaNoCelular(true)} className="md:hidden mb-3 min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Todas as seções
        </button>
        <p className="sr-only" aria-live="polite">
          Seção atual: {atual.titulo}
        </p>
        {conteudo}
      </div>

      <div className="hidden md:flex justify-end">
        <button type="button" onClick={sair} disabled={saindo} className={`${classeBotaoSecundario} text-red-700`}>
          <LogOut className="w-4 h-4" aria-hidden="true" />
          {saindo ? 'Saindo...' : 'Sair da conta'}
        </button>
      </div>
    </div>
  );
}
