'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { adminMockData } from '@/lib/mockData/adminMockData';

export function RecentActivity() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900">Atividade recente</h3>
        <Link
          href="#"
          className="text-orange-600 hover:text-orange-700 text-sm font-semibold flex items-center gap-1"
        >
          Ver todas <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Activity List */}
      <div className="space-y-4">
        {adminMockData.recentActivity.map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-4 pb-4 border-b border-gray-200 last:pb-0 last:border-b-0"
          >
            {/* Icon */}
            <div className="text-2xl flex-shrink-0 mt-1">
              {activity.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {activity.title}
              </p>
              <p className="text-xs text-gray-600 truncate mt-1">
                {activity.detail}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {activity.date}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
