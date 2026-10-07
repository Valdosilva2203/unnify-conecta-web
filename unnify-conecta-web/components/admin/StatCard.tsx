'use client';

import { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  change?: number;
  period?: string;
  percentage?: number;
  percentageLabel?: string;
}

export function StatCard({
  icon,
  label,
  value,
  change,
  period,
  percentage,
  percentageLabel,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      {/* Icon and Label */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
          {icon}
        </div>
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>

      {/* Value */}
      <div className="mb-4">
        <p className="text-3xl font-black text-gray-900">
          {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </p>
      </div>

      {/* Change or Percentage */}
      {change !== undefined && period ? (
        <div className="flex items-center gap-1 text-sm">
          <TrendingUp className="w-4 h-4 text-green-600" />
          <span className="text-green-600 font-semibold">+{change}</span>
          <span className="text-gray-600">{period}</span>
        </div>
      ) : percentage !== undefined ? (
        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-900 font-semibold">
            {percentage.toFixed(1)}%
          </span>
          <span className="text-gray-600">{percentageLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
