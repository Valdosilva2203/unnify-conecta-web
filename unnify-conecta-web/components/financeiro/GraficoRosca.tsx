import Link from 'next/link';
import { formatarMoeda } from '@/lib/financeiro';
import { IconeCategoria } from './IconeCategoria';

export interface FatiaRosca {
  categoria: string;
  cor: string;
  icone: string;
  valor: number;
}

// Gráfico de rosca por categoria (SVG, sem dependências). Totais vêm prontos do banco.
// empilhado: legenda sempre abaixo da rosca (para cards estreitos)
// hrefDe: transforma o nome da categoria em link (ex.: lançamentos daquela categoria no Financeiro)
export function GraficoRosca<T extends FatiaRosca>({ itens, total, rotulo = 'Despesas por categoria', empilhado = false, hrefDe }: {
  itens: T[]; total: number; rotulo?: string; empilhado?: boolean; hrefDe?: (item: T) => string | null;
}) {
  const raio = 70;
  const circ = 2 * Math.PI * raio;
  let acumulado = 0;
  return (
    <div className={`flex flex-col items-center gap-5 min-w-0 ${empilhado ? '' : 'sm:flex-row'}`}>
      <svg viewBox="0 0 180 180" className="w-40 h-40 shrink-0" role="img" aria-label={rotulo}>
        <circle cx="90" cy="90" r={raio} fill="none" stroke="#f3f4f6" strokeWidth="22" />
        {itens.map((it) => {
          const fracao = Number(it.valor) / total;
          const seg = (
            <circle key={it.categoria} cx="90" cy="90" r={raio} fill="none" stroke={it.cor} strokeWidth="22"
              strokeDasharray={`${fracao * circ} ${circ}`} strokeDashoffset={-acumulado * circ} transform="rotate(-90 90 90)">
              <title>{`${it.categoria}: ${formatarMoeda(it.valor)}`}</title>
            </circle>
          );
          acumulado += fracao;
          return seg;
        })}
        <text x="90" y="88" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">{formatarMoeda(total)}</text>
        <text x="90" y="106" textAnchor="middle" fontSize="11" fill="#6b7280">total</text>
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {itens.map((it) => {
          const href = hrefDe?.(it);
          return (
          <li key={it.categoria} className="flex items-center gap-2">
            <IconeCategoria icone={it.icone} cor={it.cor} tamanho="sm" />
            {href
              ? <Link href={href} className="flex-1 min-w-0 truncate text-gray-700 hover:text-orange-600 hover:underline" title={`Ver lançamentos de ${it.categoria} no Financeiro`}>{it.categoria}</Link>
              : <span className="flex-1 min-w-0 truncate text-gray-700">{it.categoria}</span>}
            <span className="text-gray-500 w-10 text-right">{Math.round((Number(it.valor) / total) * 100)}%</span>
            <span className="font-medium text-gray-900 whitespace-nowrap">{formatarMoeda(it.valor)}</span>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
