'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export function PricingSection() {
  const plans = [
    {
      name: 'Essencial',
      subtitle: 'Organize sua empresa.',
      price: 49.9,
      highlighted: false,
      features: [
        'Financeiro',
        'Contas a pagar/receber',
        'Fluxo de caixa',
        'Documentos',
        'Conexão com contador',
      ],
    },
    {
      name: 'Inteligente',
      subtitle: 'Entenda sua empresa.',
      price: 99.9,
      highlighted: true,
      badge: 'MAIS ESCOLHIDO',
      features: [
        'Tudo do plano Essencial',
        'Saúde Empresarial',
        'Indicadores avançados',
        'IA financeira',
        'Diagnósticos e recomendações',
      ],
    },
    {
      name: 'Performance',
      subtitle: 'Prepare sua empresa para crescer.',
      price: 149.9,
      highlighted: false,
      features: [
        'Tudo do plano Inteligente',
        'Preparação para Crédito',
        'Plano de melhoria',
        'Acompanhamento da evolução',
        'Dossiê Empresarial',
      ],
    },
  ];

  return (
    <section id="planos" className="py-20 px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-orange-600 mb-4 tracking-wide uppercase">
            Planos para sua empresa
          </p>
          <h2 className="text-5xl md:text-5xl font-black text-black mb-4">
            Comece no plano ideal.
          </h2>
          <p className="text-lg text-gray-700 max-w-2xl mx-auto">
            Escolha o plano que faz mais sentido para o seu momento. Você pode mudar depois.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
                plan.highlighted
                  ? 'md:scale-105 bg-white border-2 border-orange-600 shadow-2xl'
                  : 'bg-white border border-gray-200 hover:shadow-lg'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="bg-orange-600 text-white text-xs font-bold px-4 py-2 text-center">
                  {plan.badge}
                </div>
              )}

              {/* Card Content */}
              <div className="p-8">
                {/* Title */}
                <h3 className="text-2xl font-black text-black mb-1">
                  {plan.name}
                </h3>
                <p className="text-gray-600 text-sm mb-6">{plan.subtitle}</p>

                {/* Price */}
                <div className="mb-8">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-black">
                      R$ {plan.price.toFixed(2)}
                    </span>
                    <span className="text-gray-600 text-sm">/mês</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Link href="/signup" className="block">
                  <Button
                    className={`w-full py-3 rounded-lg font-semibold transition-all ${
                      plan.highlighted
                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Começar agora
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
