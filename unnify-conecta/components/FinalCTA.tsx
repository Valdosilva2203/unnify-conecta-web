'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function FinalCTA() {
  return (
    <section className="py-20 px-6 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="relative bg-white rounded-3xl overflow-hidden shadow-xl">
          <div className="grid md:grid-cols-2 gap-0 items-center min-h-96">
            {/* Left - Image Placeholder */}
            <div className="hidden md:block bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-48 h-48 bg-gray-300 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-gray-500 text-sm">
                      [Imagem do empresário]
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Espaço reservado para foto profissional
                  </p>
                </div>
              </div>
            </div>

            {/* Right - Content */}
            <div className="p-8 md:p-12 flex flex-col justify-center relative">
              {/* Label */}
              <p className="text-sm font-semibold text-orange-600 mb-4 tracking-wide uppercase">
                Sem complicação
              </p>

              {/* Title */}
              <h2 className="text-4xl md:text-5xl font-black text-black mb-8 leading-tight">
                Comece hoje e veja a diferença na gestão da sua empresa.
              </h2>

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
              <p className="text-sm text-gray-600 mb-8">
                A partir de R$ 49,90/mês
                <span className="mx-2">•</span>
                Cancele quando quiser
              </p>

              {/* Handwritten Note */}
              <div className="absolute bottom-8 right-8 md:bottom-12 md:right-12 text-right">
                <div className="relative">
                  {/* Text */}
                  <p
                    className="text-gray-600 text-sm leading-relaxed"
                    style={{ fontFamily: 'cursive' }}
                  >
                    Mais tempo
                    <br />
                    para o que
                    <br />
                    realmente importa.
                  </p>
                  {/* Arrow */}
                  <svg
                    className="absolute -top-8 -right-16 w-20 h-20 text-gray-400"
                    viewBox="0 0 100 100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M 80 20 Q 40 40, 20 80" />
                    <polygon points="20,80 25,65 10,70" fill="currentColor" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
