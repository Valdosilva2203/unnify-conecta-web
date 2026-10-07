'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProductMockup } from './ProductMockup';

export function HeroSection() {
  return (
    <section className="min-h-[90vh] bg-white pt-20 pb-20 px-6">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        {/* Left Content */}
        <div className="flex flex-col justify-center order-2 md:order-1">
          {/* Label */}
          <p className="text-sm font-semibold text-orange-600 mb-4 tracking-wide uppercase">
            Organize. Entenda. Cresça.
          </p>

          {/* Main Title */}
          <h1 className="text-5xl md:text-6xl font-black text-black leading-tight mb-6">
            Sua empresa
            <br />
            no controle.
          </h1>

          {/* Description */}
          <p className="text-lg text-gray-700 mb-8 leading-relaxed max-w-md">
            Organize suas finanças, trabalhe conectado ao seu contador e tenha informações
            claras para tomar decisões melhores.
          </p>

          {/* CTA Button */}
          <div className="mb-8">
            <Link href="/signup">
              <Button className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-base font-semibold px-8 py-3 flex items-center gap-2 h-auto">
                Começar grátis
                <span>→</span>
              </Button>
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
        <div className="order-1 md:order-2 flex items-center justify-center">
          <ProductMockup />
        </div>
      </div>
    </section>
  );
}
