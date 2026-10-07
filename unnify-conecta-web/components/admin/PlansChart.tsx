'use client';

import { adminMockData } from '@/lib/mockData/adminMockData';

const colors = ['#EA4335', '#FF8A65', '#FFAB91'];

export function PlansChart() {
  const totalSubscriptions = adminMockData.plansDistribution.reduce(
    (acc, plan) => acc + plan.value,
    0
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-gray-900 mb-8">
        Planos mais utilizados
      </h3>

      <div className="flex flex-col items-center gap-8">
        {/* Donut Chart */}
        <div className="relative w-48 h-48">
          <svg viewBox="0 0 100 100" className="transform -rotate-90">
            {(() => {
              let currentAngle = 0;

              return adminMockData.plansDistribution.map((plan, index) => {
                const sliceAngle = (plan.value / totalSubscriptions) * 360;
                const startAngle = currentAngle;
                const endAngle = currentAngle + sliceAngle;

                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;

                const x1 = 50 + 40 * Math.cos(startRad);
                const y1 = 50 + 40 * Math.sin(startRad);
                const x2 = 50 + 40 * Math.cos(endRad);
                const y2 = 50 + 40 * Math.sin(endRad);

                const largeArc = sliceAngle > 180 ? 1 : 0;

                const path = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;

                const result = (
                  <path
                    key={plan.name}
                    d={path}
                    fill={colors[index]}
                    className="hover:opacity-80 transition-opacity cursor-pointer"
                  />
                );

                currentAngle = endAngle;
                return result;
              });
            })()}
          </svg>

          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-black text-gray-900">
              {totalSubscriptions.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-gray-600">assinaturas</p>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-3">
          {adminMockData.plansDistribution.map((plan, index) => (
            <div key={plan.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colors[index] }}
                />
                <span className="text-gray-900 font-medium">{plan.name}</span>
              </div>
              <div className="text-right">
                <span className="text-gray-900 font-semibold">
                  {plan.value}
                </span>
                <span className="text-gray-600 ml-2">{plan.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
