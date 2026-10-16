'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, FileText, LayoutDashboard, RefreshCw, UserCheck, Users } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { CabecalhoModulo } from '@/components/navegacao/NavegacaoModulos';
import { StatCard } from '@/components/admin/StatCard';
import { GrowthChart } from '@/components/admin/GrowthChart';
import { PlansChart } from '@/components/admin/PlansChart';
import { RecentCompanies } from '@/components/admin/RecentCompanies';
import { RecentOffices } from '@/components/admin/RecentOffices';
import { RecentActivity } from '@/components/admin/RecentActivity';
import { AttentionPanel } from '@/components/admin/AttentionPanel';
import { carregarPainelAdmin, type PainelAdmin } from '@/lib/admin-dashboard';

// Visão geral da plataforma: SOMENTE dados reais do banco (empresas, escritórios, usuários e auditoria).
// Assinaturas, planos e MRR não aparecem porque o sistema ainda não tem esses dados.
export default function AdminDashboard() {
  const [painel, setPainel] = useState<PainelAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    setErro(null);
    carregarPainelAdmin().then((p) => { if (ativo) setPainel(p); }).catch((e: Error) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [versao]);

  return (
    <AdminLayout>
      <div className="space-y-6 min-w-0">
        <CabecalhoModulo icone={LayoutDashboard} titulo="Visão geral da plataforma" descricao="Acompanhe o Unnify Conecta com os dados reais cadastrados." barra={false} />

        {erro ? (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex flex-wrap items-center justify-between gap-3">
            {erro}
            <button type="button" onClick={recarregar} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button>
          </div>
        ) : !painel ? (
          <div role="status" aria-label="Carregando" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-36 rounded-lg bg-white border border-gray-200 animate-pulse" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <StatCard icon={<Building2 className="w-6 h-6 text-orange-600" />} label="Empresas" value={painel.empresas.total}
                change={painel.empresas.novasNoMes || undefined} period={painel.empresas.novasNoMes ? 'este mês' : undefined} />
              <StatCard icon={<FileText className="w-6 h-6 text-orange-600" />} label="Escritórios" value={painel.escritorios.total}
                change={painel.escritorios.novosNoMes || undefined} period={painel.escritorios.novosNoMes ? 'este mês' : undefined} />
              <StatCard icon={<UserCheck className="w-6 h-6 text-orange-600" />} label="Contadores" value={painel.contadores} />
              <StatCard icon={<Users className="w-6 h-6 text-orange-600" />} label="Usuários" value={painel.usuarios} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2"><GrowthChart series={painel.crescimento} /></div>
              <div><PlansChart porStatus={painel.empresas.porStatus} /></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <RecentCompanies itens={painel.recentesEmpresas} />
              <RecentOffices itens={painel.recentesEscritorios} />
              <RecentActivity itens={painel.atividade} />
            </div>

            <AttentionPanel itens={painel.atencao} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
