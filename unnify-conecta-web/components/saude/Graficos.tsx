'use client';

import { useEffect, useRef, useState } from 'react';
import { formatarMoeda, rotuloMes, rotuloMesCurto } from '@/lib/financeiro';
import type { MesFluxo, MesOperacional } from '@/lib/saude-empresarial';

const COR_RECEITAS = '#22c55e';
const COR_DESPESAS = '#f87171';
const COR_RESULTADO = '#1f2937';
const COR_SALDO = '#16a34a';

// Largura real do contêiner (1 unidade ≈ 1px): texto legível do celular ao desktop
function useLargura(minimo = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(560);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(minimo, Math.round(e.contentRect.width))));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [minimo]);
  return { ref, largura };
}

// Escala com valores "redondos", aceitando negativos (resultado e saldo podem ficar abaixo de zero)
function escala(valores: number[]) {
  const max = Math.max(0, ...valores);
  const min = Math.min(0, ...valores);
  const passo = (v: number) => {
    if (v <= 0) return 0;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].find((m) => m * p >= v)! * p;
  };
  const topo = passo(max) || (min < 0 ? 0 : 1000);
  const fundo = -passo(-min);
  return { topo, fundo };
}
const valorCurto = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  return a >= 1_000_000 ? `${s}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : a >= 1000 ? `${s}R$ ${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `${s}R$ ${a.toLocaleString('pt-BR')}`;
};

function Grade({ esquerda, direita, largura, y, fundo, topo }: { esquerda: number; direita: number; largura: number; y: (v: number) => number; fundo: number; topo: number }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = fundo + (topo - fundo) * f;
        return (
          <g key={f}>
            <line x1={esquerda} x2={largura - direita} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#d1d5db' : '#f3f4f6'} />
            <text x={esquerda - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{valorCurto(v)}</text>
          </g>
        );
      })}
    </>
  );
}

// Receitas e despesas operacionais (barras) + resultado operacional de caixa (linha), por mês
export function GraficoReceitasDespesas({ serie }: { serie: MesOperacional[] }) {
  const { ref, largura } = useLargura();
  const dados = serie.map((s) => ({ mes: s.mes, r: Number(s.receitas_operacionais), d: Number(s.despesas_operacionais), res: Number(s.receitas_operacionais) - Number(s.despesas_operacionais) }));
  const { topo, fundo } = escala(dados.flatMap((x) => [x.r, x.d, x.res]));
  const altura = 250, esquerda = 70, direita = 10, cima = 12, base = 212;
  const y = (v: number) => base - ((v - fundo) / (topo - fundo)) * (base - cima);
  const grupo = (largura - esquerda - direita) / dados.length;
  const barra = Math.min(22, grupo / 3.2);
  const cx = (i: number) => esquerda + grupo * i + grupo / 2;
  return (
    <div ref={ref} className="min-w-0">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label="Receitas, despesas e resultado operacional por mês">
        <Grade esquerda={esquerda} direita={direita} largura={largura} y={y} fundo={fundo} topo={topo} />
        {dados.map((x, i) => (
          <g key={x.mes}>
            <rect x={cx(i) - barra - 1} y={y(x.r)} width={barra} height={Math.max(0, y(0) - y(x.r))} rx="3" fill={COR_RECEITAS}><title>{`Receitas ${rotuloMes(x.mes)}: ${formatarMoeda(x.r)}`}</title></rect>
            <rect x={cx(i) + 1} y={y(x.d)} width={barra} height={Math.max(0, y(0) - y(x.d))} rx="3" fill={COR_DESPESAS}><title>{`Despesas ${rotuloMes(x.mes)}: ${formatarMoeda(x.d)}`}</title></rect>
            <text x={cx(i)} y={altura - 12} textAnchor="middle" fontSize="12" fill="#6b7280">{rotuloMesCurto(x.mes)}</text>
          </g>
        ))}
        <path d={dados.map((x, i) => `${i ? 'L' : 'M'}${cx(i)},${y(x.res)}`).join(' ')} fill="none" stroke={COR_RESULTADO} strokeWidth="2" />
        {dados.map((x, i) => <circle key={x.mes} cx={cx(i)} cy={y(x.res)} r="3.5" fill={COR_RESULTADO}><title>{`Resultado ${rotuloMes(x.mes)}: ${formatarMoeda(x.res)}`}</title></circle>)}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-gray-700 mt-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: COR_RECEITAS }} aria-hidden="true" />Receitas operacionais</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: COR_DESPESAS }} aria-hidden="true" />Despesas operacionais</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5" style={{ backgroundColor: COR_RESULTADO }} aria-hidden="true" />Resultado</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Receitas, despesas e resultado operacional por mês</caption>
          <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Resultado</th></tr></thead>
          <tbody>{dados.map((x) => <tr key={x.mes}><td>{rotuloMes(x.mes)}</td><td>{formatarMoeda(x.r)}</td><td>{formatarMoeda(x.d)}</td><td>{formatarMoeda(x.res)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// Saldo registrado ao fim de cada mês (movimentações efetivas). Mês sem conta cadastrada fica sem ponto (não vira zero).
export function GraficoFluxoCaixa({ fluxo }: { fluxo: MesFluxo[] }) {
  const { ref, largura } = useLargura();
  const pontos = fluxo.map((m) => ({ ...m, saldo: m.saldo_final === null ? null : Number(m.saldo_final) }));
  const { topo, fundo } = escala(pontos.flatMap((p) => (p.saldo === null ? [] : [p.saldo])));
  const altura = 250, esquerda = 70, direita = 16, cima = 12, base = 212;
  const y = (v: number) => base - ((v - fundo) / (topo - fundo)) * (base - cima);
  const passo = pontos.length > 1 ? (largura - esquerda - direita) / (pontos.length - 1) : 0;
  const x = (i: number) => esquerda + i * passo;
  const validos = pontos.map((p, i) => ({ ...p, i })).filter((p) => p.saldo !== null) as (typeof pontos[number] & { i: number; saldo: number })[];
  const linha = validos.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.saldo)}`).join(' ');
  return (
    <div ref={ref} className="min-w-0">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label="Saldo registrado ao fim de cada mês">
        <Grade esquerda={esquerda} direita={direita} largura={largura} y={y} fundo={fundo} topo={topo} />
        {validos.length > 1 && <path d={`${linha} L${x(validos.at(-1)!.i)},${y(0)} L${x(validos[0].i)},${y(0)} Z`} fill={COR_SALDO} fillOpacity="0.1" />}
        <path d={linha} fill="none" stroke={COR_SALDO} strokeWidth="2.5" strokeLinejoin="round" />
        {validos.map((p) => (
          <circle key={p.mes} cx={x(p.i)} cy={y(p.saldo)} r="4" fill={COR_SALDO}>
            <title>{`${rotuloMes(p.mes)}${p.parcial ? ' (até hoje)' : ''}: saldo ${formatarMoeda(p.saldo)} · entradas ${formatarMoeda(p.entradas)} · saídas ${formatarMoeda(p.saidas)}`}</title>
          </circle>
        ))}
        {pontos.map((p, i) => <text key={p.mes} x={x(i)} y={altura - 12} textAnchor="middle" fontSize="12" fill="#6b7280">{rotuloMesCurto(p.mes)}{p.parcial ? '*' : ''}</text>)}
      </svg>
      <div className="sr-only">
        <table>
          <caption>Fluxo de caixa realizado por mês</caption>
          <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo ao fim do mês</th></tr></thead>
          <tbody>{pontos.map((p) => <tr key={p.mes}><td>{rotuloMes(p.mes)}</td><td>{formatarMoeda(p.entradas)}</td><td>{formatarMoeda(p.saidas)}</td><td>{p.saldo === null ? 'sem conta cadastrada' : formatarMoeda(p.saldo)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// Medidor semicircular. valor na escala 0–maximo (o card usa 0–1000); o arco é proporcional.
export function MedidorIndice({ valor, cor, maximo = 1000 }: { valor: number | null; cor: string; maximo?: number }) {
  const arco = 'M 20 100 A 80 80 0 0 1 180 100';
  return (
    <svg viewBox="0 0 200 115" className="w-full max-w-60 h-auto" aria-hidden="true">
      <path d={arco} fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round" />
      {valor !== null && <path d={arco} fill="none" stroke={cor} strokeWidth="16" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(0.5, (valor / maximo) * 100)} 100`} />}
      <text x="100" y="88" textAnchor="middle" fontSize="38" fontWeight="800" fill="#111827">{valor ?? '—'}</text>
      <text x="100" y="108" textAnchor="middle" fontSize="12" fill="#6b7280">de {maximo}</text>
    </svg>
  );
}
