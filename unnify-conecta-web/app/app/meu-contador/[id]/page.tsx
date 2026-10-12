'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, MapPin, Monitor, CheckCircle2, Link2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { FotoPerfil } from '@/components/contabil/FotoPerfil';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { FUNCOES, descreverModalidades, mensagemDeErro, type Funcao } from '@/lib/contabil';

interface Perfil {
  id: string;
  tipo: 'contador' | 'escritorio';
  nome_profissional: string;
  crc: string | null;
  cidade: string | null;
  estado: string | null;
  especialidades: string[];
  servicos: string[];
  descricao: string | null;
  modalidades_atendimento: string[];
  foto_caminho: string | null;
}

function PerfilContador() {
  const { id } = useParams<{ id: string }>();
  const { empresa } = useEmpresaAtual();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [solicitando, setSolicitando] = useState(false);
  const [funcao, setFuncao] = useState<Funcao>('principal');
  const [temPrincipal, setTemPrincipal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    if (!empresa || !id) return;
    const supabase = createClient();
    (async () => {
      const [{ data, error }, { data: vinculos }] = await Promise.all([
        supabase.rpc('perfil_do_catalogo', { p_id_perfil: id }),
        supabase.rpc('vinculos_da_empresa', { p_id_empresa: empresa.id, p_status: 'ativo' }),
      ]);
      if (error || !data?.length) {
        setNaoEncontrado(true);
      } else {
        setPerfil(data[0] as Perfil);
      }
      const principalAtivo = (vinculos ?? []).some((v: { funcao: string }) => v.funcao === 'principal');
      setTemPrincipal(principalAtivo);
      setFuncao(principalAtivo ? 'auxiliar' : 'principal');
      setCarregando(false);
    })();
  }, [empresa, id]);

  const solicitar = async () => {
    if (!empresa || !perfil) return;
    setEnviando(true);
    setErro(null);
    const { error } = await createClient().rpc('solicitar_vinculo_pelo_catalogo', {
      p_id_empresa: empresa.id,
      p_id_perfil: perfil.id,
      p_funcao: funcao,
    });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error, 'Não foi possível enviar a solicitação.'));
      return;
    }
    setSolicitando(false);
    setEnviado(true);
  };

  if (!empresa) return null;

  if (carregando) {
    return <div role="status" aria-label="Carregando" className="h-96 rounded-2xl bg-white border border-gray-100 animate-pulse" />;
  }

  if (naoEncontrado || !perfil) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 px-5 py-12 text-center">
        <p className="font-semibold text-gray-900">Perfil não disponível.</p>
        <p className="text-sm text-gray-600 mt-1">Ele pode ter sido despublicado pelo profissional.</p>
        <Link href="/app/meu-contador/buscar" className={`${classeBotaoSecundario} mt-5`}>
          Voltar ao catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Navegação estrutural" className="flex items-center gap-1 text-sm text-gray-600">
        <Link href="/app/meu-contador/buscar" className="min-h-11 inline-flex items-center hover:text-orange-600">
          Contadores
        </Link>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
        <span className="text-gray-900 truncate" aria-current="page">
          {perfil.nome_profissional}
        </span>
      </nav>

      {enviado && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Solicitação enviada! Você será avisado quando {perfil.tipo === 'escritorio' ? 'o escritório' : 'o contador'} responder.{' '}
          <Link href="/app/meu-contador" className="font-semibold underline">
            Ver meus contadores
          </Link>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col md:flex-row gap-5 md:gap-8">
          <FotoPerfil
            caminho={perfil.foto_caminho}
            nome={perfil.nome_profissional}
            escritorio={perfil.tipo === 'escritorio'}
            className="w-full max-w-[240px] aspect-square md:w-60 text-5xl self-center md:self-start"
            arredondado="rounded-2xl"
          />
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 break-words">{perfil.nome_profissional}</h1>
                <p className="text-gray-600 mt-1">
                  {perfil.tipo === 'escritorio' ? 'Escritório contábil' : 'Contador(a)'}
                  {perfil.crc ? ` · CRC ${perfil.crc}` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={enviado}
                onClick={() => {
                  setErro(null);
                  setSolicitando(true);
                }}
                className={`${classeBotaoPrimario} self-start`}
              >
                <Link2 className="w-4 h-4" aria-hidden="true" />
                {enviado ? 'Solicitação enviada' : 'Solicitar vínculo'}
              </button>
            </div>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                {[perfil.cidade, perfil.estado].filter(Boolean).join('/')}
              </li>
              <li className="flex items-start gap-2">
                <Monitor className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" aria-hidden="true" />
                <span>{descreverModalidades(perfil.modalidades_atendimento)}</span>
              </li>
              <li className="flex items-center gap-2 text-gray-500">
                <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                Contatos comerciais liberados após a aprovação do vínculo.
              </li>
            </ul>
            {perfil.especialidades.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-900 mb-2">Especialidades</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {perfil.especialidades.map((e) => (
                    <li key={e} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <h2 className="font-bold text-gray-900 mb-2">Sobre</h2>
          <p className="text-sm text-gray-700 whitespace-pre-line">{perfil.descricao || 'O profissional ainda não escreveu uma apresentação.'}</p>
        </section>
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <h2 className="font-bold text-gray-900 mb-2">Serviços oferecidos</h2>
          {perfil.servicos.length ? (
            <ul className="space-y-1.5">
              {perfil.servicos.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 shrink-0" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Nenhum serviço informado.</p>
          )}
        </section>
      </div>

      <Modal
        aberto={solicitando}
        aoFechar={() => setSolicitando(false)}
        titulo="Solicitar vínculo"
        descricao={`${perfil.nome_profissional} receberá sua solicitação e poderá aceitar ou recusar.`}
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setSolicitando(false)}>
              Cancelar
            </button>
            <button type="button" disabled={enviando} className={classeBotaoPrimario} onClick={solicitar}>
              {enviando ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </>
        }
      >
        <label htmlFor="funcao-solicitacao" className="block text-sm font-semibold text-gray-900 mb-2">
          Função deste profissional na sua empresa
        </label>
        <select
          id="funcao-solicitacao"
          value={funcao}
          onChange={(e) => setFuncao(e.target.value as Funcao)}
          className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {Object.entries(FUNCOES).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        {temPrincipal && funcao === 'principal' && (
          <p className="text-xs text-orange-700 mt-2">
            Sua empresa já tem um contador principal ativo. A solicitação só poderá ser aceita depois que o atual for encerrado ou mudar de função.
          </p>
        )}
        <p className="text-xs text-gray-500 mt-3">
          Após a aprovação você poderá ajustar a função e as permissões em “Meu contador”.
        </p>
        {erro && (
          <p role="alert" className="text-sm text-red-700 mt-3">
            {erro}
          </p>
        )}
      </Modal>
    </div>
  );
}

// useParams em rota dinâmica precisa de <Suspense> (cacheComponents).
export default function PerfilContadorPage() {
  return (
    <Suspense fallback={<div role="status" aria-label="Carregando" className="h-96 rounded-2xl bg-white border border-gray-100 animate-pulse" />}>
      <PerfilContador />
    </Suspense>
  );
}
