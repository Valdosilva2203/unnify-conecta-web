'use client';

import Image from 'next/image';

export function OnboardingHeader() {
  return (
    <div className="flex flex-col items-center mb-12">
      {/* Logo */}
      <div className="mb-8">
        <Image
          src="/brand/unnify-logo.png"
          alt="Unnify Conecta"
          width={200}
          height={67}
          priority
          className="h-10 w-auto"
        />
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-md mb-8">
        <div className="flex gap-1">
          {/* Step 1 - Active */}
          <div className="flex-1 h-1.5 bg-orange-600 rounded-full" />
          {/* Step 2 - Inactive */}
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full" />
          {/* Step 3 - Inactive */}
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full" />
        </div>
        <p className="text-sm text-gray-600 mt-3 text-center">
          Etapa 1 de 3
        </p>
      </div>

      {/* Title and Subtitle */}
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-black text-black mb-4 leading-tight">
          Como você vai usar
          <br />
          o Unnify Conecta?
        </h1>
        <p className="text-base md:text-lg text-gray-600 leading-relaxed">
          Escolha o perfil que melhor representa você para
          <br />
          personalizarmos sua experiência.
        </p>
      </div>
    </div>
  );
}
