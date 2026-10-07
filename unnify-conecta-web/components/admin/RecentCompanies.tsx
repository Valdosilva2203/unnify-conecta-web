'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { adminMockData } from '@/lib/mockData/adminMockData';

export function RecentCompanies() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900">Novas empresas</h3>
        <Link
          href="#"
          className="text-orange-600 hover:text-orange-700 text-sm font-semibold flex items-center gap-1"
        >
          Ver todas <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* List */}
      <div className="space-y-1">
        {adminMockData.recentCompanies.map((company) => (
          <div
            key={company.id}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg flex-shrink-0">{company.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {company.name}
                </p>
                <p className="text-xs text-gray-600">{company.date}</p>
              </div>
            </div>
            <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 flex-shrink-0">
              {company.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
