'use client';

export function WelcomeBanner() {
  return (
    <div className="bg-gradient-to-r from-orange-50 to-orange-100/50 rounded-2xl p-8 md:p-10 border border-orange-200 overflow-hidden relative">
      {/* Decorative elements */}
      <div className="absolute top-4 right-4 w-20 h-20 bg-orange-200/30 rounded-full blur-2xl" />
      <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-orange-300/10 rounded-full blur-3xl" />

      <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Content */}
        <div>
          <p className="text-sm font-semibold text-orange-600 mb-2 uppercase tracking-wide">
            Unnify
          </p>
          <h2 className="text-3xl md:text-4xl font-black text-black mb-3">
            Seu ambiente está pronto!
          </h2>
          <p className="text-gray-700 leading-relaxed">
            Aqui você pode gerenciar seus clientes, documentos, obrigações, agenda e muito mais, tudo em um só lugar.
          </p>
        </div>

        {/* Cube Icon - Right side */}
        <div className="hidden md:flex justify-end">
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* Simplified cube using SVG approach with pure element */}
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full text-orange-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {/* Top face */}
              <polygon points="60,20 85,35 60,50 35,35" fill="currentColor" opacity="0.8" />
              {/* Left face */}
              <polygon points="35,35 35,80 60,95 60,50" fill="currentColor" opacity="0.6" />
              {/* Right face */}
              <polygon points="60,50 60,95 85,80 85,35" fill="currentColor" opacity="0.9" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
