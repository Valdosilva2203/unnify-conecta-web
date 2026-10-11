'use client';

import Image from 'next/image';
import Link from 'next/link';

export function FinalCTA() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="relative bg-white rounded-3xl overflow-hidden shadow-xl">
          <div className="grid md:grid-cols-2 gap-0 items-stretch md:min-h-96">
            {/* Left - Professional Image */}
            <div className="hidden md:block relative overflow-hidden bg-gray-100 w-full">
              <Image
                src="/images/empresario.png"
                alt="Empresário usando Unnify Conecta"
                fill
                sizes="50vw"
                className="object-cover"
                priority
              />
            </div>

            {/* Right - Content */}
            <div className="p-6 sm:p-8 md:p-12 flex flex-col justify-center relative">
              {/* Label */}
              <p className="text-sm font-semibold text-orange-600 mb-4 tracking-wide uppercase">
                Sem complicação
              </p>

              {/* Title */}
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-black mb-8 leading-tight">
                Comece hoje e veja a diferença na gestão da sua empresa.
              </h2>

              {/* CTA Button */}
              <div className="mb-8">
                <Link href="/signup" className="inline-flex items-center justify-center gap-2 min-h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-base font-semibold px-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
                  Começar grátis
                  <span aria-hidden="true">→</span>
                </Link>
              </div>

              {/* Info Text */}
              <p className="text-sm text-gray-600 mb-8">
                A partir de R$ 49,90/mês
                <span className="mx-2">•</span>
                Cancele quando quiser
              </p>

              {/* Handwritten Note */}
              <div className="md:absolute md:bottom-12 md:right-12 text-right">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
