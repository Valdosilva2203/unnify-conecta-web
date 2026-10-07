'use client';

import { useState } from 'react';
import { adminMockData } from '@/lib/mockData/adminMockData';

const tabs = ['Empresas', 'Assinaturas', 'MRR'];

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
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Crescimento da plataforma
        </h3>

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const tabKey = tab.toLowerCase() as 'companies' | 'subscriptions' | 'mrr';
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tabKey)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-80 flex flex-col-reverse gap-2">
        {/* Chart */}
        <div className="flex items-flex-end gap-2 flex-1">
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
