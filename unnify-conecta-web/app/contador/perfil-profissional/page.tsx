'use client';

import { useState } from 'react';
import { useContadorAtual } from '@/components/contador/LayoutContador';
import { FormPerfilProfissional } from '@/components/contador/FormPerfilProfissional';

export default function PerfilProfissionalPage() {
  const contador = useContadorAtual();
  const [aba, setAba] = useState<'contador' | 'escritorio'>('contador');

  if (!contador) return null;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Perfil profissional</h1>
        <p className="text-gray-600 mt-1">
          Estas informações aparecem no catálogo “Encontre seu contador” somente quando você ativa a exibição.
        </p>
      </div>

      {contador.escritorio && (
        <div role="tablist" aria-label="Perfil" className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
          {(
            [
              ['contador', 'Meu perfil'],
              ['escritorio', 'Perfil do escritório'],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => setAba(valor)}
              className={`min-h-11 px-4 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                aba === valor ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      {aba === 'escritorio' && contador.escritorio ? (
        <FormPerfilProfissional
          key="escritorio"
          dono={{ tipo: 'escritorio', id: contador.escritorio.id, nomePadrao: contador.escritorio.nome }}
        />
      ) : (
        <FormPerfilProfissional key="contador" dono={{ tipo: 'contador', id: contador.id, nomePadrao: contador.nome }} />
      )}
    </div>
  );
}
