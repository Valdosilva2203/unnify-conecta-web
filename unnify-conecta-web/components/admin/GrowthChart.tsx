'use client';

import { useState } from 'react';
import type { PontoCrescimento } from '@/lib/admin-dashboard';

const tabs = [
  { rotulo: 'Empresas', chave: 'empresas' },
  { rotulo: 'Escritórios', chave: 'escritorios' },
] as const;

// Crescimento REAL: total acumulado de cadastros por mês (a base das barras é zero, sem exagerar a variação)
export function GrowthChart({ series }: { series: { empresas: PontoCrescimento[]; escritorios: PontoCrescimento[] } }) {
  const [activeTab, setActiveTab] = useState<'empresas' | 'escritorios'>('empresas');
  const currentData = series[activeTab];
  const maxValue = Math.max(...currentData.map((d) => d.valor), 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Crescimento da plataforma</h3>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Indicador do gráfico">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.chave;
            return (
              <button
                key={tab.chave}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.chave)}
                className={`min-h-11 px-4 text-sm font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  isActive ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {maxValue === 0 ? (
        <p className="h-56 sm:h-80 flex items-center justify-center text-sm text-gray-500">Ainda não há cadastros para mostrar.</p>
      ) : (
        <div className="h-56 sm:h-80 flex items-end gap-1 sm:gap-2" role="img" aria-label={`Total acumulado de ${activeTab} por mês`}>
          {currentData.map((item, index) => (
            <div key={index} className="flex-1 h-full flex flex-col items-center justify-end gap-2 group">
              <span className="text-[11px] font-semibold text-gray-700">{item.valor}</span>
              <div
                className="w-full bg-gradient-to-t from-orange-600 to-orange-500 rounded-t opacity-80 group-hover:opacity-100 transition-opacity"
                style={{ height: `${Math.max((item.valor / maxValue) * 80, item.valor > 0 ? 3 : 0)}%` }}
                title={`${item.mes}: ${item.valor}`}
              />
              <span className="text-xs text-gray-600">{item.mes}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
