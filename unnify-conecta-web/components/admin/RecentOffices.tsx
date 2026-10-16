'use client';

import type { EmpresaResumo } from '@/lib/admin-dashboard';
import { RecentCompanies } from './RecentCompanies';

// Últimos escritórios REAIS (mesmo cartão das empresas, com iniciais)
export function RecentOffices({ itens }: { itens: EmpresaResumo[] }) {
  return <RecentCompanies itens={itens} titulo="Novos escritórios" href="/admin/escritorios" vazio="Nenhum escritório cadastrado." escritorio />;
}
