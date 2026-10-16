'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, ChevronRight, Clock, FileText, Fingerprint, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hojeBrasil } from '@/lib/financeiro';
import { DIAS_SEMANA, TIPOS_MARCACAO, diaDaSemana, horaLocal, type JornadaColaborador, type MarcacaoPonto } from '@/lib/portal-colaborador';
import { useColaborador } from '@/components/colaborador/LayoutColaborador';
import { Cartao, Carregando } from '@/components/colaborador/comum';

// Início do Portal do Colaborador
export default function InicioColaboradorPage() {
  const { vinculo } = useColaborador();
  const [hoje] = useState(hojeBrasil);
  const [marcacoes, setMarcacoes] = useState<MarcacaoPonto[] | null>(null);
  const [jornada, setJornada] = useState<JornadaColaborador | null>(null);

  useEffect(() => {
    const s = createClient();
    s.rpc('meu_ponto', { p_id_funcionario: vinculo.id_funcionario, p_de: hoje, p_ate: hoje }).then(({ data }) => setMarcacoes((data ?? []) as MarcacaoPonto[]));
    s.rpc('minha_jornada', { p_id_funcionario: vinculo.id_funcionario, p_competencia: `${hoje.slice(0, 7)}-01` }).then(({ data }) => setJornada((data ?? null) as JornadaColaborador | null));
  }, [vinculo.id_funcionario, hoje]);

  const escalaHoje = jornada?.jornada?.escala?.[String(diaDaSemana(hoje))] ?? [];
  const atalhos = [
    { href: '/colaborador/ponto', titulo: 'Meu ponto', texto: 'Registrar e consultar', icone: Clock },
    { href: '/colaborador/jornada', titulo: 'Minha jornada', texto: 'Escala e espelho de ponto', icone: CalendarDays },
    { href: '/colaborador/documentos', titulo: 'Meus documentos', texto: 'Holerites', icone: FileText },
    { href: '/colaborador/cadastro', titulo: 'Meu cadastro', texto: 'Dados pessoais', icone: UserRound },
  ];
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-gray-900">Olá, {vinculo.nome.split(' ')[0]}!</h1>
        <p className="text-gray-600">{vinculo.cargo ?? 'Colaborador(a)'} · {vinculo.empresa}</p>
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2.5 py-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />Vínculo ativo</p>
      </div>
      <Link href="/colaborador/ponto" className="flex items-center gap-4 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white p-5 shadow-sm">
        <span className="w-12 h-12 rounded-full bg-white/15 inline-flex items-center justify-center shrink-0"><Fingerprint className="w-6 h-6" aria-hidden="true" /></span>
        <span className="flex-1 min-w-0"><span className="block text-lg font-bold">Registrar ponto</span><span className="block text-sm text-orange-100">Marque sua entrada, intervalo e saída</span></span>
        <ChevronRight className="w-5 h-5 shrink-0" aria-hidden="true" />
      </Link>
      <Cartao titulo={`Hoje · ${DIAS_SEMANA[diaDaSemana(hoje)]}`} id="titulo-hoje">
        {marcacoes === null || jornada === null ? <Carregando rotulo="Carregando jornada de hoje" /> : (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Jornada prevista</p>
              <p className="font-semibold text-gray-900">{!jornada.jornada ? 'Ainda não configurada pelo RH' : escalaHoje.length ? escalaHoje.map(([a, b]) => `${a}–${b}`).join(' · ') : 'Descanso'}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Marcações de hoje</p>
              {marcacoes.length === 0 ? <p className="text-gray-700">Nenhuma marcação ainda.</p> : (
                <ul className="space-y-0.5">{marcacoes.map((m) => <li key={m.id} className={m.desconsiderada ? 'line-through text-gray-400' : 'text-gray-900'}><strong>{horaLocal(m.registrado_em)}</strong> · {TIPOS_MARCACAO[m.tipo]}</li>)}</ul>
              )}
            </div>
          </div>
        )}
      </Cartao>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {atalhos.map(({ href, titulo, texto, icone: Icone }) => (
          <Link key={href} href={href} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:border-orange-300 min-h-28">
            <Icone className="w-6 h-6 text-orange-600 mb-2" aria-hidden="true" />
            <span className="block font-bold text-gray-900">{titulo}</span><span className="block text-xs text-gray-500">{texto}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
