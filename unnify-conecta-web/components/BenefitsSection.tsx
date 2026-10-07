'use client';

import { BarChart3, Zap, Target } from 'lucide-react';

export function BenefitsSection() {
  const benefits = [
    {
      icon: BarChart3,
      title: 'Organize',
      description:
        'Controle receitas, despesas, contas a pagar e receber em um só lugar.',
    },
    {
      icon: Zap,
      title: 'Entenda',
      description:
        'Transforme seus números em informações simples e fáceis de entender.',
    },
    {
      icon: Target,
      title: 'Cresça',
      description:
        'Saiba o que melhorar e prepare sua empresa para novas oportunidades.',
    },
  ];

  return (
    <section id="beneficios" className="py-20 px-6 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-orange-600 mb-4 tracking-wide uppercase">
            Tudo o que você precisa
          </p>
          <h2 className="text-5xl md:text-5xl font-black text-black mb-4 leading-tight">
            Mais clareza para o{' '}
            <span className="text-orange-600">seu negócio</span>.
          </h2>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-3 gap-12">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div key={index} className="flex flex-col items-center md:items-start text-center md:text-left">
                {/* Icon */}
                <div className="mb-6 p-4 rounded-lg bg-orange-50">
                  <Icon className="w-8 h-8 text-orange-600" />
                </div>

                {/* Title */}
                <h3 className="text-2xl font-black text-black mb-3">
                  {benefit.title}
                </h3>

                {/* Description */}
                <p className="text-gray-700 leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
