'use client';

import { ArrowRight } from 'lucide-react';
import { formatarMoeda, previaSaldo, type ContaFinanceira } from '@/lib/financeiro';

interface Props {
  id: string;
  rotulo: string;
  contas: ContaFinanceira[];
  idConta: string;
  aoMudar: (id: string) => void;
  valor: string | null; // decimal exato, ex.: "480.35"
  natureza: 'entrada' | 'saida';
  aoIrParaContas?: () => void;
}

// Escolha da conta + saldo calculado antes e depois da operação (prévia; o banco confere de novo).
export function SeletorConta({ id, rotulo, contas, idConta, aoMudar, valor, natureza, aoIrParaContas }: Props) {
  const ativas = contas.filter((c) => !c.arquivada_em);
  const conta = ativas.find((c) => c.id === idConta);

  if (ativas.length === 0) {
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Cadastre uma conta (banco ou caixa) em <strong>Contas e bancos</strong> antes de registrar pagamentos e recebimentos.
        {aoIrParaContas && (
          <button type="button" onClick={aoIrParaContas} className="block mt-2 min-h-11 font-semibold underline">
            Ir para Contas e bancos
          </button>
        )}
      </div>
    );
  }

  const depois = conta ? previaSaldo(conta.saldo, valor, natureza) : null;
  const faltaSaldo = conta && depois !== null && depois < 0 && natureza === 'saida' && !conta.permite_saldo_negativo;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-900 mb-1.5">
        {rotulo}
      </label>
      <select id={id} value={idConta} onChange={(e) => aoMudar(e.target.value)} className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
        <option value="">Selecione a conta</option>
        {ativas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
            {c.principal ? ' (principal)' : ''}
          </option>
        ))}
      </select>
      {conta && (
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs" aria-live="polite" data-testid="previa-saldo">
          <p className="text-gray-500">Saldo calculado da conta {conta.nome}</p>
          <p className="flex flex-wrap items-center gap-2 mt-0.5 font-semibold text-gray-900">
            <span>Antes: {formatarMoeda(conta.saldo)}</span>
            <ArrowRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
            <span className={depois !== null && depois < 0 ? 'text-red-700' : ''}>Depois: {formatarMoeda(depois)}</span>
          </p>
          {faltaSaldo && <p className="text-red-700 mt-1">Saldo insuficiente: esta conta não permite saldo negativo.</p>}
        </div>
      )}
    </div>
  );
}
