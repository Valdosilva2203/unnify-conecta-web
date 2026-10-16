'use client';

import { useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { formatarData } from '@/lib/financeiro';
import { VINCULOS, iniciais, type Vinculo } from '@/lib/funcionarios';
import { useColaborador } from '@/components/colaborador/LayoutColaborador';
import { Cartao, Erro, Sucesso } from '@/components/colaborador/comum';
import { classeBotaoSecundario } from '@/components/ui/Modal';

// Meu cadastro: dados mantidos pelo RH (somente leitura). Alterações são pedidas ao RH.
export default function MeuCadastroPage() {
  const { vinculo: v } = useColaborador();
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function redefinir() {
    if (ocupado || !v.email) return;
    setOcupado(true); setErro(null);
    const r = await fetch('/api/auth/recuperar-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v.email }) }).catch(() => null);
    setOcupado(false);
    if (!r?.ok) return setErro('Não foi possível enviar agora. Tente novamente em alguns minutos.');
    setAviso('Enviamos um link para criar uma nova senha no seu e-mail.');
  }
  const linhas: [string, string][] = [
    ['Nome', v.nome], ['E-mail', v.email ?? '—'], ['Empresa', v.empresa], ['Cargo', v.cargo ?? '—'],
    ['Tipo de vínculo', VINCULOS[v.vinculo as Vinculo] ?? v.vinculo], ['Data de admissão', formatarData(v.data_admissao)], ['Matrícula', v.matricula ? String(v.matricula) : '—'],
  ];
  return (
    <>
      <h1 className="text-2xl font-black text-gray-900">Meu cadastro</h1>
      <Cartao>
        <div className="flex items-center gap-3 mb-4">
          <span className="w-14 h-14 rounded-full bg-orange-100 text-orange-700 text-lg font-bold inline-flex items-center justify-center shrink-0">{iniciais(v.nome)}</span>
          <div className="min-w-0"><p className="font-bold text-gray-900 break-words">{v.nome}</p><p className="text-sm text-gray-600">{v.cargo ?? 'Colaborador(a)'}</p>
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />Vínculo ativo</p></div>
        </div>
        <dl className="divide-y divide-gray-100 text-sm" data-testid="dados-cadastro">
          {linhas.map(([k, val]) => <div key={k} className="py-2.5 flex justify-between gap-3"><dt className="text-gray-500">{k}</dt><dd className="text-gray-900 font-medium text-right break-all">{val}</dd></div>)}
        </dl>
        <p className="text-xs text-gray-500 mt-3">Dados mantidos pelo RH da empresa. Para corrigir alguma informação, fale com o RH.</p>
      </Cartao>
      <Cartao titulo="Segurança" id="titulo-seguranca">
        <Sucesso texto={aviso} />
        <Erro texto={erro} />
        <button type="button" onClick={redefinir} disabled={ocupado || !v.email} className={`${classeBotaoSecundario} mt-2`}><KeyRound className="w-4 h-4" aria-hidden="true" />{ocupado ? 'Enviando…' : 'Redefinir minha senha'}</button>
      </Cartao>
    </>
  );
}
