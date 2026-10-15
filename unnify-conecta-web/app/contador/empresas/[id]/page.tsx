'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, ClipboardCheck, Inbox, ShieldCheck, Send } from 'lucide-react';
import { Indicador } from '@/components/financeiro/Indicador';
import { MODULOS, SEGMENTOS, rotaEmpresa, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { PERMISSOES } from '@/lib/contabil';

// Visão geral da empresa gerenciada: indicadores já existentes (painel_contador), permissões e atalhos para os módulos.
export default function VisaoGeralEmpresaPage() {
  const { empresa, pode } = useEspacoEmpresa();
  const router = useRouter();
  // Compatibilidade: links antigos /contador/empresas/<id>#impostos (inclusive notificações já enviadas) abrem o módulo
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (SEGMENTOS.has(h)) router.replace(rotaEmpresa(empresa.id_empresa, h));
  }, [empresa.id_empresa, router]);
  const n = (v: number | null) => (v === null ? 'Sem permissão' : String(v));
  const modulos = MODULOS.filter((m) => m.segmento && m.permitido(pode));
  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h2 className="text-xl font-black text-gray-900">Visão geral</h2>
        <p className="text-sm text-gray-600">Principais pendências da empresa e o que você pode acessar.</p>
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Solicitações para analisar" valor={n(empresa.solicitacoes_aguardando_analise)} icone={Inbox} cor="bg-blue-100 text-blue-600" detalhe="Documentos enviados pela empresa" />
        <Indicador titulo="Aguardando a empresa" valor={n(empresa.solicitacoes_aguardando_empresa)} icone={Send} cor="bg-purple-100 text-purple-600" detalhe="Pedidos ainda sem resposta" />
        <Indicador titulo="Obrigações abertas" valor={n(empresa.obrigacoes_abertas)} icone={ClipboardCheck} cor="bg-orange-100 text-orange-600"
          detalhe={empresa.obrigacoes_atrasadas ? `${empresa.obrigacoes_atrasadas} atrasadas` : undefined} />
        <Indicador titulo="Vencem em 7 dias" valor={n(empresa.obrigacoes_7_dias)} icone={CalendarClock} cor="bg-red-100 text-red-600" />
      </div>
      {!!empresa.obrigacoes_atrasadas && (
        <p role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />{empresa.obrigacoes_atrasadas} obrigação(ões) em atraso.
          <Link href={rotaEmpresa(empresa.id_empresa, 'obrigacoes')} className="font-semibold underline">Ver obrigações</Link>
        </p>
      )}
      <section aria-label="Acesso rápido" className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {modulos.map((m) => {
          const Icone = m.icone;
          return (
            <Link key={m.segmento} href={rotaEmpresa(empresa.id_empresa, m.segmento)} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 hover:border-orange-300 hover:bg-orange-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-orange-50 text-orange-600 inline-flex items-center justify-center"><Icone className="w-5 h-5" aria-hidden="true" /></span>
              <span className="min-w-0"><span className="block font-semibold text-gray-900">{m.titulo}</span><span className="block text-xs text-gray-500">{m.descricao}</span></span>
            </Link>
          );
        })}
      </section>
      <section aria-label="Permissões concedidas" className="bg-white rounded-2xl border border-gray-200 p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-gray-700"><ShieldCheck className="w-4 h-4 text-green-600" aria-hidden="true" />Permissões concedidas:</span>
        {empresa.permissoes.length ? empresa.permissoes.map((p) => <span key={p} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{PERMISSOES[p] ?? p}</span>)
          : <span className="text-gray-500">nenhuma — peça à empresa para liberar o que você precisa.</span>}
      </section>
    </div>
  );
}
