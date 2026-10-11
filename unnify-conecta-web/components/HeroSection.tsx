'use client';

import Link from 'next/link';
import { ProductMockup } from './ProductMockup';

export function HeroSection() {
  return (
    <section className="bg-white pt-10 sm:pt-20 pb-16 sm:pb-28 px-4 sm:px-6 overflow-x-clip">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
        {/* Left Content */}
        <div className="min-w-0 flex flex-col justify-center order-2 md:order-1">
          {/* Label */}
          <p className="text-sm font-semibold text-orange-600 mb-4 tracking-wide uppercase">
            Organize. Entenda. Cresça.
          </p>

          {/* Main Title */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-black leading-tight mb-6">
            Sua empresa
            <br />
            no controle.
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg text-gray-700 mb-8 leading-relaxed max-w-md">
            Organize suas finanças, trabalhe conectado ao seu contador e tenha informações
            claras para tomar decisões melhores.
          </p>

          {/* CTA Button */}
          <div className="mb-8">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 min-h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-base font-semibold px-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
              Começar grátis
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Info Text */}
          <p className="text-sm text-gray-600">
            A partir de R$ 49,90/mês
            <span className="mx-2">•</span>
            Sem burocracia
            <span className="mx-2">•</span>
            Cancele quando quiser
          </p>
        </div>

        {/* Right Content - Mockup */}
        <div className="min-w-0 order-1 md:order-2 flex items-center justify-center" aria-hidden="true">
          <ProductMockup />
        </div>
      </div>
    </section>
  );
}
