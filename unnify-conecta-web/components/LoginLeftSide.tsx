'use client';

import Image from 'next/image';
import { CheckCircle2 } from 'lucide-react';
import { ProductMockup } from './ProductMockup';

export function LoginLeftSide() {
  const benefits = [
    'Suas informações em um só lugar',
    'Conectado ao seu contador',
    'Acompanhe a saúde da sua empresa',
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

      {/* Eyebrow */}
      <p className="text-xs font-semibold text-orange-600 mb-2 tracking-wide uppercase">
        Bem-vindo de volta
      </p>

      {/* Title */}
      <h1 className="text-3xl lg:text-4xl font-black text-black leading-tight mb-4">
        Continue no
        <br />
        controle da
        <br />
        sua empresa.
      </h1>

      {/* Description */}
      <p className="text-xs lg:text-sm text-gray-700 mb-5 leading-relaxed max-w-sm">
        Acesse sua conta e continue acompanhando suas finanças, documentos e informações do seu negócio.
      </p>

      {/* Benefits */}
      <div className="space-y-2.5 mb-8">
        {benefits.map((benefit, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700 text-xs">{benefit}</span>
          </div>
        ))}
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
