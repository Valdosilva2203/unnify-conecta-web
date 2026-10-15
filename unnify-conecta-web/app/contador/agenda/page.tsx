'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useContadorAtual } from '@/components/contador/LayoutContador';
import { PaginaAgenda } from '@/components/agenda/PaginaAgenda';
import type { Permissao } from '@/lib/contabil';

interface EmpresaPainel { id_empresa: string; nome: string; permissoes: Permissao[] }

// Agenda do contador: a MESMA agenda do sistema (tabela e funções da Agenda), vista pelo contador.
// Empresas do filtro = vínculos ativos; só as com "Agenda compartilhada" aceitam compromissos compartilhados.
export default function AgendaContadorPage() {
  const contador = useContadorAtual();
  const [empresas, setEmpresas] = useState<EmpresaPainel[] | null>(null);
  useEffect(() => {
    if (!contador) return;
    createClient().rpc('painel_contador').then(({ data }) => setEmpresas((data ?? []) as EmpresaPainel[]));
  }, [contador]);
  if (!contador || empresas === null) return <div role="status" aria-label="Carregando agenda" className="h-64 rounded-2xl bg-white border border-gray-200 animate-pulse" />;
  const todas = empresas.map((e) => ({ id: e.id_empresa, nome: e.nome }));
  const comAgenda = empresas.filter((e) => e.permissoes.includes('gerenciar_agenda')).map((e) => ({ id: e.id_empresa, nome: e.nome }));
  return <PaginaAgenda modo="contador" usuarioId={contador.id} empresas={todas} empresasAgenda={comAgenda} />;
}
