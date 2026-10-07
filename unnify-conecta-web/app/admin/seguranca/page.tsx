'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';

export default function SegurancaPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-6">
          <Lock className="w-8 h-8 text-orange-600" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Segurança da Conta</h1>
        <p className="text-gray-600 mb-6">
          Senha, sessões e autenticação.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Esta funcionalidade estará disponível em breve.
        </p>
        <Link
          href="/admin"
          className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          ← Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
