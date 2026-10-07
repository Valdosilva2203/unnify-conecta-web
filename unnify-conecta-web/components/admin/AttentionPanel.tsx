'use client';

import { ChevronRight, AlertCircle } from 'lucide-react';
import { adminMockData } from '@/lib/mockData/adminMockData';

export function AttentionPanel() {
  return (
    <div className="border-t border-gray-200 mt-8 pt-8">
      <div className="flex items-center gap-2 mb-6">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <h3 className="text-lg font-bold text-red-600">Requer atenção</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {adminMockData.attention.map((item) => (
          <button
            key={item.id}
            className="bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 transition-colors text-left group"
          >
            <div className="flex items-start justify-between mb-2">
              <p className="text-2xl font-black text-red-600">
                {item.count}
              </p>
              <ChevronRight className="w-5 h-5 text-red-400 group-hover:text-red-600 transition-colors" />
            </div>
            <p className="text-sm font-semibold text-red-900 mb-1">
              {item.title}
            </p>
            <p className="text-xs text-red-700">
              {item.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
