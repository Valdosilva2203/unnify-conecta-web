'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useContadorAtual } from '@/components/contador/LayoutContador';
import { PERMISSOES, formatarCnpj, mensagemDeErro, type Permissao } from '@/lib/contabil';
import { hojeBrasil, inicioDoMes } from '@/lib/financeiro';
import { Abas, CabecalhoPagina, useAvisoEVersao } from '@/components/documentos/PaginaComAviso';
import { Solicitacoes } from '@/components/documentos/Solicitacoes';
import { BibliotecaDocumentos } from '@/components/documentos/BibliotecaDocumentos';
import { ModuloObrigacoes } from '@/components/obrigacoes/ModuloObrigacoes';
import { VisaoGeral } from '@/components/financeiro/VisaoGeral';
import { PainelSaude } from '@/components/saude/PainelSaude';

interface EmpresaPainel { id_empresa: string; nome: string; cnpj: string; permissoes: Permissao[] }
type Aba = 'solicitacoes' | 'documentos' | 'obrigacoes' | 'financeiro' | 'saude' | 'tarefas';

// Espaço de trabalho do contador numa empresa. Só existe para empresas com vínculo ATIVO (painel_contador);
// cada aba depende da permissão concedida, e o banco valida novamente cada consulta e ação.
function EspacoEmpresa() {
  const { id } = useParams<{ id: string }>();
  const contador = useContadorAtual();
  const { aviso, setAviso, versao, alterado } = useAvisoEVersao();
  const [empresa, setEmpresa] = useState<EmpresaPainel | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba | null>(null);
  const [periodo, setPeriodo] = useState('');

  useEffect(() => setPeriodo(inicioDoMes(hojeBrasil())), []);
  useEffect(() => {
    if (!contador) return;
    createClient().rpc('painel_contador').then(({ data, error }) => {
      if (error) return setErro(mensagemDeErro(error, 'Não foi possível carregar a empresa.'));
      setEmpresa(((data ?? []) as EmpresaPainel[]).find((e) => e.id_empresa === id) ?? null);
    });
  }, [contador, id]);

  const pode = (p: Permissao) => !!empresa?.permissoes.includes(p);
  const abas: { id: Aba; titulo: string }[] = empresa ? [
    ...(pode('ver_documentos') ? [{ id: 'solicitacoes' as Aba, titulo: 'Solicitações' }, { id: 'documentos' as Aba, titulo: 'Documentos' }] : []),
    ...(pode('gerenciar_obrigacoes') ? [{ id: 'obrigacoes' as Aba, titulo: 'Obrigações' }] : []),
    ...(pode('ver_financeiro') ? [{ id: 'financeiro' as Aba, titulo: 'Financeiro' }] : []),
    // Saúde Empresarial: mesma regra do banco (pode_ver_financeiro), somente leitura
    ...(pode('ver_financeiro') || pode('gerenciar_financeiro') ? [{ id: 'saude' as Aba, titulo: 'Saúde Empresarial' }] : []),
    { id: 'tarefas', titulo: 'Tarefas' },
  ] : [];

  useEffect(() => {
    if (!empresa || aba) return;
    const desejada = window.location.hash.slice(1) as Aba;
    setAba(abas.some((a) => a.id === desejada) ? desejada : abas[0]?.id ?? 'tarefas');
  }, [empresa, aba, abas]);

  if (!contador) return null;
  const voltar = <Link href="/contador" className="min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" aria-hidden="true" />Painel</Link>;

  if (erro) return <div className="space-y-4">{voltar}<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div></div>;
  if (empresa === undefined) return <div role="status" aria-label="Carregando" className="h-40 rounded-2xl bg-white border border-gray-200 animate-pulse" />;
  if (empresa === null) {
    return (
      <div className="space-y-4">
        {voltar}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <Lock className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
          <p className="font-semibold text-gray-900">Você não tem acesso a esta empresa.</p>
          <p className="text-sm text-gray-600 mt-1">O acesso existe só enquanto houver vínculo ativo com a empresa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-w-0">
      {voltar}
      <CabecalhoPagina titulo={empresa.nome} subtitulo={`CNPJ ${formatarCnpj(empresa.cnpj)}`} aviso={aviso} aoFecharAviso={() => setAviso(null)} />
      <section aria-label="Permissões concedidas" className="bg-white rounded-2xl border border-gray-200 p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-gray-700"><ShieldCheck className="w-4 h-4 text-green-600" aria-hidden="true" />Permissões concedidas:</span>
        {empresa.permissoes.length ? empresa.permissoes.map((p) => <span key={p} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{PERMISSOES[p] ?? p}</span>)
          : <span className="text-gray-500">nenhuma — peça à empresa para liberar o que você precisa.</span>}
      </section>
      {aba && <Abas rotulo="Espaço da empresa" atual={aba} aoMudar={(a) => { setAba(a); window.history.replaceState(null, '', `#${a}`); }} abas={abas} />}
      {aba === 'solicitacoes' && <Solicitacoes idEmpresa={empresa.id_empresa} papel="contador" versao={versao} aoAlterar={alterado} />}
      {aba === 'documentos' && <BibliotecaDocumentos idEmpresa={empresa.id_empresa} papel="contador" podeEnviar={pode('enviar_documentos')} idUsuario={contador.id} versao={versao} aoAlterar={alterado} />}
      {aba === 'obrigacoes' && <ModuloObrigacoes idEmpresa={empresa.id_empresa} papel="contador" versao={versao} aoAlterar={alterado} />}
      {aba === 'financeiro' && periodo && <VisaoGeral idEmpresa={empresa.id_empresa} periodo={periodo} versao={versao} />}
      {aba === 'saude' && <PainelSaude idEmpresa={empresa.id_empresa} papel="contador" />}
      {aba === 'tarefas' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-gray-700 space-y-2">
          <p>As tarefas internas da empresa pertencem à equipe dela. Organize o trabalho do seu escritório em <Link href="/contador/tarefas" className="font-semibold text-orange-600 hover:underline">Tarefas</Link>.</p>
          <p className="text-gray-500">Quando a empresa transforma uma obrigação em tarefa, o vínculo aparece na própria obrigação.</p>
        </section>
      )}
    </div>
  );
}

// useParams em rota dinâmica precisa de <Suspense> (cacheComponents).
export default function EspacoEmpresaPage() {
  return (
    <Suspense fallback={<div role="status" aria-label="Carregando" className="h-40 rounded-2xl bg-white border border-gray-200 animate-pulse" />}>
      <EspacoEmpresa />
    </Suspense>
  );
}
