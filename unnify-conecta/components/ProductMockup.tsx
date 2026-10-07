'use client';

import { BarChart3, FileText, TrendingUp, Zap } from 'lucide-react';

export function ProductMockup() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Desktop Mockup */}
      <div className="relative w-full max-w-2xl">
        {/* Notebook bezel/frame */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-12 border-gray-900">
          {/* Screen */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 aspect-video flex">
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
              {/* Logo */}
              <div className="flex items-center gap-1 mb-8">
                <span className="text-lg font-bold text-orange-600">U</span>
                <span className="text-xs text-gray-600">nnify</span>
              </div>

              {/* Menu Items */}
              <nav className="space-y-3 flex-1">
                {[
                  { icon: <Zap className="w-4 h-4" />, label: 'Início', active: true },
                  { icon: <TrendingUp className="w-4 h-4" />, label: 'Financeiro' },
                  { icon: <FileText className="w-4 h-4" />, label: 'Documentos' },
                  { icon: <FileText className="w-4 h-4" />, label: 'Obrigações' },
                  { icon: <BarChart3 className="w-4 h-4" />, label: 'Relatórios' },
                  { icon: <TrendingUp className="w-4 h-4" />, label: 'Meu contador' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                      item.active
                        ? 'bg-orange-50 text-orange-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-orange-600">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </div>
                ))}
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    EE
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Olá, Empresa Exemplo 👋
                    </h3>
                    <p className="text-xs text-gray-500">
                      Acompanhe o resumo do seu mês
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Setembro/2026</p>
                </div>
              </div>

              {/* Cards Row */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Receita', value: '48.750', change: '+12,4%', color: 'text-green-600' },
                  { label: 'Despesas', value: '31.420', change: '+4,8%', color: 'text-red-600' },
                  { label: 'Resultado', value: '17.330', change: '+27,3%', color: 'text-green-600' },
                ].map((card, i) => (
                  <div key={i} className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-600 mb-2">{card.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-bold text-gray-900">R$ {card.value}</p>
                      <span className={`text-xs font-medium ${card.color}`}>
                        ↑ {card.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
                <p className="text-sm font-semibold text-gray-900 mb-4">Fluxo de caixa</p>
                <div className="flex items-end justify-between gap-1 h-24">
                  {[
                    45, 65, 55, 72, 68, 58, 75, 82, 70,
                  ].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-green-500 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                      style={{ height: `${(h / 82) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
                  <span>Jan</span>
                  <span>Set</span>
                </div>
              </div>

              {/* Health Score */}
              <div className="bg-white rounded-lg p-4 border border-gray-200 flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <p className="text-xs text-gray-600 mb-1">Saúde da sua empresa</p>
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-xl">
                    78
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm mb-1">Saudável</p>
                  <p className="text-xs text-gray-600">
                    Sua empresa está em um bom momento financeiro. Continue acompanhando.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Mockup (Overlaid) */}
        <div className="absolute -bottom-12 -right-8 w-48 bg-black rounded-3xl border-8 border-black shadow-2xl overflow-hidden">
          <div className="bg-white aspect-video flex flex-col p-3">
            {/* Mobile Header */}
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="font-bold text-orange-600">U</span>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-orange-600" />
                <div className="w-3 h-3 rounded-full bg-orange-600" />
              </div>
            </div>

            {/* Mobile Content */}
            <div className="flex-1 overflow-hidden text-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 bg-orange-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  E
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Olá!</p>
                  <p className="text-gray-600">Empresa Exemplo</p>
                </div>
              </div>

              {/* Mini Cards */}
              <div className="space-y-1">
                {[
                  { label: 'Receita', value: '48.750', color: 'text-green-600' },
                  { label: 'Despesas', value: '31.420', color: 'text-red-600' },
                  { label: 'Resultado', value: '17.330', color: 'text-green-600' },
                ].map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded p-1">
                    <p className="text-xs text-gray-600">{c.label}</p>
                    <p className={`font-bold ${c.color}`}>R$ {c.value}</p>
                  </div>
                ))}
              </div>

              {/* Mini Chart */}
              <div className="flex items-end gap-0.5 h-8 mt-2">
                {[35, 45, 40, 50, 48].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-green-500 rounded-t"
                    style={{ height: `${(h / 50) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Notch */}
          <div className="h-6 bg-black flex justify-center pt-1">
            <div className="w-20 h-4 bg-black rounded-b-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
