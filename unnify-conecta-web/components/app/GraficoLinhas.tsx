'use client';

import { useEffect, useRef, useState } from 'react';
import { formatarMoeda, rotuloMes, rotuloMesCurto } from '@/lib/financeiro';

export interface PontoSerie {
  mes: string; // início do mês (AAAA-MM-01)
  receitas: number;
  despesas: number;
  previstas?: number; // receitas ainda NÃO recebidas, pelo mês de competência (linha tracejada, separada do recebido)
}

const COR_RECEITAS = '#16a34a';
const COR_DESPESAS = '#ef4444';
const COR_PREVISTAS = '#f59e0b';

// Escala "redonda" para o eixo Y (ex.: 37.000 → 40.000)
function tetoRedondo(valor: number): number {
  if (valor <= 0) return 1000;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= valor)! * potencia;
  return passo;
}

const valorCurto = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${v.toLocaleString('pt-BR')}`;

// Gráfico de linhas (SVG, sem dependências). Meses sem movimentação aparecem como zero — nada é inventado.
export function GraficoLinhas({ serie }: { serie: PontoSerie[] }) {
  // A largura do desenho acompanha o contêiner: 1 unidade ≈ 1px, então o texto fica legível do celular ao desktop
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  useEffect(() => {
    if (!caixa.current) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, Math.round(e.contentRect.width))));
    obs.observe(caixa.current);
    return () => obs.disconnect();
  }, []);
  const altura = 250;
  const esquerda = 78;
  const direita = 16;
  const topo = 12;
  const base = 212;
  const temPrevistas = serie.some((s) => Number(s.previstas ?? 0) > 0);
  const maximo = tetoRedondo(Math.max(0, ...serie.flatMap((s) => [Number(s.receitas), Number(s.despesas), Number(s.previstas ?? 0)])));
  const passoX = serie.length > 1 ? (largura - esquerda - direita) / (serie.length - 1) : 0;
  const x = (i: number) => esquerda + i * passoX;
  const y = (v: number) => base - (Number(v) / maximo) * (base - topo);
  const linha = (campo: 'receitas' | 'despesas' | 'previstas') => serie.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(Number(s[campo] ?? 0))}`).join(' ');
  const area = (campo: 'receitas' | 'despesas') => `${linha(campo)} L${x(serie.length - 1)},${base} L${x(0)},${base} Z`;

  return (
    <div ref={caixa} className="min-w-0">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label="Receitas e despesas pagas nos últimos seis meses">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={esquerda} x2={largura - direita} y1={y(f * maximo)} y2={y(f * maximo)} stroke="#f3f4f6" />
            <text x={esquerda - 8} y={y(f * maximo) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{valorCurto(f * maximo)}</text>
          </g>
        ))}
        <path d={area('receitas')} fill={COR_RECEITAS} fillOpacity="0.08" />
        <path d={area('despesas')} fill={COR_DESPESAS} fillOpacity="0.08" />
        <path d={linha('receitas')} fill="none" stroke={COR_RECEITAS} strokeWidth="2.5" strokeLinejoin="round" />
        <path d={linha('despesas')} fill="none" stroke={COR_DESPESAS} strokeWidth="2.5" strokeLinejoin="round" />
        {temPrevistas && <path d={linha('previstas')} fill="none" stroke={COR_PREVISTAS} strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />}
        {serie.map((s, i) => (
          <g key={s.mes}>
            <circle cx={x(i)} cy={y(s.receitas)} r="4" fill={COR_RECEITAS}><title>{`Receitas ${rotuloMes(s.mes)}: ${formatarMoeda(s.receitas)}`}</title></circle>
            <circle cx={x(i)} cy={y(s.despesas)} r="4" fill={COR_DESPESAS}><title>{`Despesas ${rotuloMes(s.mes)}: ${formatarMoeda(s.despesas)}`}</title></circle>
            {temPrevistas && Number(s.previstas ?? 0) > 0 && <circle cx={x(i)} cy={y(Number(s.previstas))} r="4" fill="#fff" stroke={COR_PREVISTAS} strokeWidth="2.5"><title>{`A receber ${rotuloMes(s.mes)}: ${formatarMoeda(s.previstas)}`}</title></circle>}
            <text x={x(i)} y={altura - 12} textAnchor="middle" fontSize="12" fill="#6b7280">{rotuloMesCurto(s.mes)}</text>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-gray-700 mt-1">
        <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: COR_RECEITAS }} aria-hidden="true" />Receitas</span>
        <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: COR_DESPESAS }} aria-hidden="true" />Despesas</span>
        {temPrevistas && <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: COR_PREVISTAS }} aria-hidden="true" />Receitas a receber</span>}
      </div>
      {/* Valores exatos para leitores de tela e conferência */}
      {/* Tabela não respeita a largura de 1px do sr-only: o invólucro é que fica oculto */}
      <div className="sr-only">
        <table>
          <caption>Receitas e despesas pagas por mês</caption>
          <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th>{temPrevistas && <th>A receber</th>}</tr></thead>
          <tbody>{serie.map((s) => <tr key={s.mes}><td>{rotuloMes(s.mes)}</td><td>{formatarMoeda(s.receitas)}</td><td>{formatarMoeda(s.despesas)}</td>{temPrevistas && <td>{formatarMoeda(s.previstas ?? 0)}</td>}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
