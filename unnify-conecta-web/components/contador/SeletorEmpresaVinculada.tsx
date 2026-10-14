'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatarCnpj } from '@/lib/contabil';

export interface EmpresaVinculada { id_empresa: string; nome: string; cnpj: string; permissoes: string[] }

// Empresas com vínculo ATIVO deste contador que concederam a permissão pedida (o banco valida de novo em cada ação)
export function useEmpresasVinculadas(permissao: string) {
  const [empresas, setEmpresas] = useState<EmpresaVinculada[] | null>(null);
  useEffect(() => {
    createClient().rpc('empresas_do_contador', { p_busca: null, p_status: 'ativo', p_limite: 200, p_deslocamento: 0 }).then(({ data }) => {
      const lista = ((data ?? []) as { id_empresa: string; nome_comercial: string | null; razao_social: string; cnpj: string; permissoes: string[] | null; status: string }[])
        .filter((v) => v.status === 'ativo' && (v.permissoes ?? []).includes(permissao))
        .map((v) => ({ id_empresa: v.id_empresa, nome: v.nome_comercial || v.razao_social, cnpj: v.cnpj, permissoes: v.permissoes ?? [] }));
      setEmpresas(lista);
    });
  }, [permissao]);
  return empresas;
}

export function SeletorEmpresaVinculada({ empresas, valor, aoMudar }: { empresas: EmpresaVinculada[]; valor: string; aoMudar: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2 min-w-0 sm:min-w-80">
      <Building2 className="w-5 h-5 text-gray-500 shrink-0" aria-hidden="true" />
      <label htmlFor="empresa-vinculada" className="sr-only">Empresa</label>
      <select id="empresa-vinculada" value={valor} onChange={(e) => aoMudar(e.target.value)} className="flex-1 min-w-0 h-10 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none">
        {empresas.map((e) => <option key={e.id_empresa} value={e.id_empresa}>{e.nome} — {formatarCnpj(e.cnpj)}</option>)}
      </select>
    </div>
  );
}

export function SemEmpresaAutorizada({ permissao }: { permissao: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      <p className="font-semibold text-gray-900">Nenhuma empresa vinculada concedeu esta permissão.</p>
      <p className="text-sm text-gray-600 mt-1">A empresa precisa liberar “{permissao}” no vínculo com você.</p>
    </div>
  );
}
