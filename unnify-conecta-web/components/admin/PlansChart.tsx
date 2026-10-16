'use client';

const CORES: Record<string, string> = { ATIVA: '#16a34a', PENDENTE: '#f59e0b', SUSPENSA: '#ef4444' };
const ROTULOS: Record<string, string> = { ATIVA: 'Ativas', PENDENTE: 'Pendentes', SUSPENSA: 'Suspensas' };

// Distribuição REAL das empresas por status de cadastro
export function PlansChart({ porStatus, titulo = 'Empresas por status' }: { porStatus: Record<string, number>; titulo?: string }) {
  const itens = Object.entries(porStatus).filter(([, v]) => v > 0);
  const total = itens.reduce((acc, [, v]) => acc + v, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-gray-900 mb-8">{titulo}</h3>
      {total === 0 ? (
        <p className="text-sm text-gray-500 text-center py-16">Ainda não há empresas cadastradas.</p>
      ) : (
        <div className="flex flex-col items-center gap-8">
          <div className="relative w-48 h-48">
            <svg viewBox="0 0 100 100" className="transform -rotate-90" role="img" aria-label={titulo}>
              {(() => {
                let atual = 0;
                return itens.map(([status, valor]) => {
                  const fatia = (valor / total) * 360;
                  if (itens.length === 1) return <circle key={status} cx="50" cy="50" r="40" fill={CORES[status] ?? '#9ca3af'} />;
                  const ini = (atual * Math.PI) / 180;
                  const fim = ((atual + fatia) * Math.PI) / 180;
                  const d = `M 50 50 L ${50 + 40 * Math.cos(ini)} ${50 + 40 * Math.sin(ini)} A 40 40 0 ${fatia > 180 ? 1 : 0} 1 ${50 + 40 * Math.cos(fim)} ${50 + 40 * Math.sin(fim)} Z`;
                  atual += fatia;
                  return <path key={status} d={d} fill={CORES[status] ?? '#9ca3af'} />;
                });
              })()}
              <circle cx="50" cy="50" r="22" fill="white" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-black text-gray-900">{total.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-gray-600">empresas</p>
            </div>
          </div>
          <div className="w-full space-y-3">
            {itens.map(([status, valor]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CORES[status] ?? '#9ca3af' }} />
                  <span className="text-gray-900 font-medium">{ROTULOS[status] ?? 'Sem status'}</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-900 font-semibold">{valor}</span>
                  <span className="text-gray-600 ml-2">{((valor / total) * 100).toFixed(1).replace('.', ',')}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
