'use client';

import { LucideIcon } from 'lucide-react';

interface QuickAccessCardProps {
  icon: LucideIcon;
  label: string;
  status: string;
  iconColor: 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'yellow';
}

const colorMap = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  orange: 'bg-orange-100 text-orange-600',
  purple: 'bg-purple-100 text-purple-600',
  pink: 'bg-pink-100 text-pink-600',
  yellow: 'bg-yellow-100 text-yellow-600',
};

export function QuickAccessCard({ icon: Icon, label, status, iconColor }: QuickAccessCardProps) {
  const colorClass = colorMap[iconColor];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:border-gray-300 transition-colors cursor-pointer group">
      <div className="flex items-start justify-between mb-4">
        <div className={`${colorClass} p-3 rounded-lg`}>
          <Icon className="w-6 h-6" />
        </div>
        <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{label}</h3>
      <p className="text-sm text-gray-600">{status}</p>
    </div>
  );
}
