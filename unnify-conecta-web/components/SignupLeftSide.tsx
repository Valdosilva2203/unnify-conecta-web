'use client';

import Image from 'next/image';
import { BarChart3, Zap, Users, Target } from 'lucide-react';
import { ProductMockup } from './ProductMockup';

export function SignupLeftSide() {
  const benefits = [
    { icon: BarChart3, text: 'Organize suas finanças' },
    { icon: Zap, text: 'Tenha mais clareza nos números' },
    { icon: Users, text: 'Trabalhe conectado ao seu contador' },
    { icon: Target, text: 'Prepare sua empresa para crescer' },
  ];

  return (
    <div className="hidden md:flex flex-col p-6 lg:p-8 bg-gradient-to-br from-orange-50 via-white to-orange-50 overflow-y-auto justify-center">
      {/* Logo */}
      <div className="mb-6">
        <Image
          src="/brand/unnify-logo.png"
          alt="Unnify Conecta"
          width={200}
          height={67}
          priority
          className="h-12 w-auto"
        />
      </div>

      {/* Label */}
      <p className="text-xs font-semibold text-orange-600 mb-2 tracking-wide uppercase">
        Organize. Entenda. Cresça.
      </p>

      {/* Title */}
      <h1 className="text-3xl lg:text-4xl font-black text-black leading-tight mb-4">
        Comece agora
        <br />
        a transformar
        <br />
        o seu negócio.
      </h1>

      {/* Description */}
      <p className="text-xs lg:text-sm text-gray-700 mb-5 leading-relaxed max-w-sm">
        Crie sua conta grátis e tenha acesso a uma plataforma completa para organizar suas finanças.
      </p>

      {/* Benefits */}
      <div className="space-y-2.5 mb-8">
        {benefits.map((benefit, i) => {
          const Icon = benefit.icon;
          return (
            <div key={i} className="flex items-start gap-1.5">
              <div className="p-1.5 bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-orange-600" />
              </div>
              <span className="text-gray-700 text-xs">{benefit.text}</span>
            </div>
          );
        })}
      </div>

      {/* Mockup */}
      <div className="flex-shrink-0">
        <div className="scale-75 lg:scale-85 origin-top-left">
          <ProductMockup />
        </div>
      </div>
    </div>
  );
}
