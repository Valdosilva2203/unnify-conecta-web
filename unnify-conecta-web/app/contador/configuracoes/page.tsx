'use client';

import Link from 'next/link';

export default function ConfiguracõesPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Configurações</h1>
        <p className="text-gray-600 mb-6">Esta página será implementada em breve.</p>
        <Link href="/contador" className="text-orange-600 hover:text-orange-700 font-medium">
          ← Voltar
        </Link>
      </div>
    </div>
  );
}
