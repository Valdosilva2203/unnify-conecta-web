'use client';

import { useState } from 'react';
import { adminMockData } from '@/lib/mockData/adminMockData';

const tabs = [
  { rotulo: 'Empresas', chave: 'companies' },
  { rotulo: 'Assinaturas', chave: 'subscriptions' },
  { rotulo: 'MRR', chave: 'mrr' },
] as const;

export function GrowthChart() {
  const [activeTab, setActiveTab] = useState<'companies' | 'subscriptions' | 'mrr'>('companies');

  const data = {
    companies: adminMockData.growthData.companies,
    subscriptions: adminMockData.growthData.subscriptions,
    mrr: adminMockData.growthData.mrr,
  };

  const currentData = data[activeTab];
  const maxValue = Math.max(...currentData.map((d) => d.value));
  const minValue = Math.min(...currentData.map((d) => d.value));
  const range = maxValue - minValue;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Crescimento da plataforma
        </h3>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Indicador do gráfico">
          {tabs.map((tab) => {
            const tabKey = tab.chave;
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tab.chave}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tabKey)}
                className={`min-h-11 px-4 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  isActive
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-56 sm:h-80 flex flex-col-reverse gap-2">
        {/* Chart */}
        <div className="flex items-end gap-1 sm:gap-2 flex-1">
          {currentData.map((item, index) => {
            const normalizedValue = (item.value - minValue) / (range || 1);
            const height = Math.max(normalizedValue * 100, 5);

            return (
              <div
                key={index}
                className="flex-1 flex flex-col items-center justify-end gap-2 group"
              >
                <div
                  className="w-full bg-gradient-to-t from-orange-600 to-orange-500 rounded-t opacity-80 hover:opacity-100 transition-all cursor-pointer group-hover:from-orange-700"
                  style={{ height: `${height}%` }}
                  title={`${item.month}: ${item.value}`}
                />
                <span className="text-xs text-gray-600">{item.month}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
