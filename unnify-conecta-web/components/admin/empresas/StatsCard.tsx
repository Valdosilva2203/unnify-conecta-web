import { ReactNode } from 'react';

interface StatsCardProps {
  icon?: ReactNode;
  label: string;
  value: number | string;
  change?: string;
  percentage?: string;
  percentageLabel?: string;
  color?: 'orange' | 'green' | 'gray';
}

export function StatsCard({
  icon,
  label,
  value,
  change,
  percentage,
  percentageLabel,
  color = 'orange',
}: StatsCardProps) {
  const colorMap = {
    orange: {
      badge: 'bg-orange-50 text-orange-700',
      icon: 'text-orange-600',
      percentage: 'text-orange-600',
    },
    green: {
      badge: 'bg-green-50 text-green-700',
      icon: 'text-green-600',
      percentage: 'text-green-600',
    },
    gray: {
      badge: 'bg-gray-50 text-gray-700',
      icon: 'text-gray-600',
      percentage: 'text-gray-600',
    },
  };

  const colors = colorMap[color];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {icon && (
        <div className={`w-12 h-12 ${colors.badge} rounded-lg flex items-center justify-center mb-4`}>
          {icon}
        </div>
      )}
      <p className="text-sm text-gray-600 mb-2">{label}</p>
      <p className="text-3xl font-black text-gray-900 mb-3">{value}</p>
      {change && <p className="text-xs text-green-600">{change}</p>}
      {percentage && (
        <div>
          <p className={`text-lg font-bold ${colors.percentage} mb-1`}>
            {percentage}
          </p>
          <p className="text-xs text-gray-600">{percentageLabel}</p>
        </div>
      )}
    </div>
  );
}
