'use client';

import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { corSobre, normalizarCor, type OpcaoCor } from '@/lib/cores';

// Seletor de cor padrão do Unnify: cores prontas + "Cor personalizada" (círculo cromático do sistema
// e código #RRGGBB). Usar em TODA tela que escolhe cor.
export function SeletorCor({ rotulo, valor, aoMudar, cores }: { rotulo: string; valor: string; aoMudar: (cor: string) => void; cores: OpcaoCor[] }) {
  const id = useId();
  const personalizada = !cores.some((c) => c.valor === valor);
  const [codigo, setCodigo] = useState(valor);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setCodigo(valor);
    setErro(false);
  }, [valor]);

  const aplicarCodigo = (texto: string) => {
    setCodigo(texto);
    const cor = normalizarCor(texto);
    setErro(!cor && texto.trim().length >= 6);
    if (cor) aoMudar(cor);
  };

  return (
    <fieldset>
      <legend className="block text-sm font-semibold text-gray-900 mb-1.5">{rotulo}</legend>
      <div className="flex flex-wrap gap-2">
        {cores.map((c) => (
          <button
            key={c.valor}
            type="button"
            onClick={() => aoMudar(c.valor)}
            aria-label={`Cor ${c.nome}`}
            aria-pressed={valor === c.valor}
            title={c.nome}
            className={`w-11 h-11 rounded-full border-4 inline-flex items-center justify-center transition ${valor === c.valor ? 'border-gray-900 scale-105' : 'border-white shadow-sm'}`}
            style={{ backgroundColor: c.valor }}
          >
            {valor === c.valor && <Check className="w-4 h-4" style={{ color: corSobre(c.valor) }} aria-hidden="true" />}
          </button>
        ))}
        {/* Cor personalizada: abre o seletor de cores do sistema (espectro completo) */}
        <label
          htmlFor={`${id}-personalizada`}
          title="Cor personalizada"
          className={`relative w-11 h-11 rounded-full border-4 cursor-pointer transition ${personalizada ? 'border-gray-900 scale-105' : 'border-white shadow-sm'}`}
          style={{ background: 'conic-gradient(#ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)' }}
        >
          <span className="absolute inset-2.5 rounded-full border-2 border-white" style={{ backgroundColor: personalizada ? valor : '#ffffff' }} aria-hidden="true" />
          <input
            id={`${id}-personalizada`}
            type="color"
            value={valor}
            onChange={(e) => aoMudar(e.target.value.toLowerCase())}
            aria-label="Cor personalizada"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={`${id}-codigo`} className="text-xs text-gray-600">
          Código da cor
        </label>
        <input
          id={`${id}-codigo`}
          value={codigo}
          onChange={(e) => aplicarCodigo(e.target.value)}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="none"
          placeholder="#ff6b9d"
          aria-invalid={erro}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className={`w-28 h-9 px-2 border rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-orange-500 ${erro ? 'border-red-400' : 'border-gray-300'}`}
        />
        {erro && (
          <span id={`${id}-erro`} role="alert" className="text-xs text-red-700">
            Use o formato #RRGGBB
          </span>
        )}
      </div>
    </fieldset>
  );
}
