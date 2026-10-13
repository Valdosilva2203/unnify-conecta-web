'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { ICONES_CATEGORIA } from '@/components/financeiro/IconeCategoria';
import { corSobre } from '@/lib/cores';

const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Seletor de ícone de categoria (lista fixa e validada no banco), com busca. Usado no Financeiro e nas Tarefas.
export function SeletorIcone({ valor, aoMudar, cor }: { valor: string; aoMudar: (icone: string) => void; cor: string }) {
  const [busca, setBusca] = useState('');
  const termo = semAcento(busca.trim());
  const lista = ICONES_CATEGORIA.filter((i) => !termo || semAcento(`${i.nome} ${i.termos} ${i.id}`).includes(termo));

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-900 mb-1.5">Ícone</legend>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar ícone (ex.: energia, aluguel, vendas)"
          aria-label="Buscar ícone"
          className="w-full h-11 pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">Nenhum ícone encontrado.</p>
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5 max-h-48 overflow-y-auto pr-1">
          {lista.map(({ id, Icone, nome }) => (
            <button
              key={id}
              type="button"
              onClick={() => aoMudar(id)}
              aria-label={`Ícone ${nome}`}
              aria-pressed={valor === id}
              title={nome}
              className={`h-11 rounded-lg border inline-flex items-center justify-center transition ${valor === id ? 'border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
              style={valor === id ? { backgroundColor: cor, color: corSobre(cor) } : undefined}
            >
              <Icone className="w-5 h-5" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
