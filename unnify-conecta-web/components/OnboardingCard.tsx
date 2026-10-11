'use client';

import { ReactNode } from 'react';
import Image from 'next/image';

interface OnboardingCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  buttonOnClick: () => void;
  imageSrc: string;
  imageAlt: string;
  isLoading?: boolean;
}

export function OnboardingCard({
  icon,
  title,
  description,
  buttonLabel,
  buttonOnClick,
  imageSrc,
  imageAlt,
  isLoading = false,
}: OnboardingCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      {/* Image Section */}
      <div className="relative w-full h-64 bg-gray-100">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
          priority
        />
      </div>

      {/* Content Section */}
      <div className="p-8">
        {/* Icon */}
        <div className="mb-6 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
          {icon}
        </div>

        {/* Title */}
        <h3 className="text-2xl font-black text-black mb-3">
          {title}
        </h3>

        {/* Description */}
        <p className="text-base text-gray-700 mb-8 leading-relaxed">
          {description}
        </p>

        {/* Button */}
        <button
          onClick={buttonOnClick}
          disabled={isLoading}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-lg transition-all text-base flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Carregando...
            </>
          ) : (
            <>
              {buttonLabel}
              <span>→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
