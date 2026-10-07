'use client';

import { Suspense } from 'react';
import ResetPasswordContent from './reset-password-content';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center p-4 md:p-6 bg-white md:bg-gray-50 min-h-screen">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Carregando...</p>
      </div>
    </div>
  );
}
