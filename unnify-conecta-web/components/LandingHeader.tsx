'use client';

import Image from 'next/image';
import Link from 'next/link';

export function LandingHeader() {
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
        {/* Logo */}
        <div>
          <Image
            src="/brand/unnify-logo.png"
            alt="Unnify Conecta"
            width={200}
            height={67}
            priority
            className="h-7 sm:h-8 w-auto"
          />
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-12">
          <a
            href="#beneficios"
            onClick={(e) => handleNavClick(e, 'beneficios')}
            className="text-sm text-gray-700 hover:text-black transition-colors"
          >
            Para sua empresa
          </a>
          <a
            href="#"
            className="text-sm text-gray-700 hover:text-black transition-colors"
          >
            Para contadores
          </a>
          <a
            href="#planos"
            onClick={(e) => handleNavClick(e, 'planos')}
            className="text-sm text-gray-700 hover:text-black transition-colors"
          >
            Planos
          </a>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-1 sm:gap-4 shrink-0">
          <Link
            href="/login"
            className="inline-flex items-center min-h-11 px-3 text-sm text-gray-700 hover:text-black rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 min-h-11 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium px-4 sm:px-6 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            Começar agora
            <span aria-hidden="true" className="hidden sm:inline">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
