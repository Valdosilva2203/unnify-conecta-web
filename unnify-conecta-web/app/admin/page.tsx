'use client';

import { Building2, FileText, CreditCard, DollarSign } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/admin/StatCard';
import { GrowthChart } from '@/components/admin/GrowthChart';
import { PlansChart } from '@/components/admin/PlansChart';
import { RecentCompanies } from '@/components/admin/RecentCompanies';
import { RecentOffices } from '@/components/admin/RecentOffices';
import { RecentActivity } from '@/components/admin/RecentActivity';
import { AttentionPanel } from '@/components/admin/AttentionPanel';
import { adminMockData } from '@/lib/mockData/adminMockData';

export default function AdminDashboard() {
  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 mb-2">
          Visão geral da plataforma
        </h1>
        <p className="text-gray-600 mb-4">
          Acompanhe o desempenho do Unnify Conecta em tempo real.
        </p>

        {/* Period Selector */}
        <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-600">📅</span>
          <span className="text-sm font-medium text-gray-900">
            {adminMockData.period.start} - {adminMockData.period.end}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<Building2 className="w-6 h-6 text-orange-600" />}
          label="Empresas"
          value={adminMockData.stats.companies.value}
          change={adminMockData.stats.companies.change}
          period={adminMockData.stats.companies.period}
        />
        <StatCard
          icon={<FileText className="w-6 h-6 text-orange-600" />}
          label="Escritórios"
          value={adminMockData.stats.offices.value}
          change={adminMockData.stats.offices.change}
          period={adminMockData.stats.offices.period}
        />
        <StatCard
          icon={<CreditCard className="w-6 h-6 text-orange-600" />}
          label="Assinaturas ativas"
          value={adminMockData.stats.activeSubscriptions.value}
          percentage={adminMockData.stats.activeSubscriptions.percentage}
          percentageLabel={adminMockData.stats.activeSubscriptions.label}
        />
        <StatCard
          icon={<DollarSign className="w-6 h-6 text-orange-600" />}
          label="MRR"
          value={`R$ ${adminMockData.stats.mrr.value.toLocaleString('pt-BR')}`}
          change={adminMockData.stats.mrr.change}
          period={adminMockData.stats.mrr.period}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <GrowthChart />
        </div>
        <div>
          <PlansChart />
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <RecentCompanies />
        <RecentOffices />
        <RecentActivity />
      </div>

      {/* Attention Panel */}
      <AttentionPanel />
    </AdminLayout>
  );
}
