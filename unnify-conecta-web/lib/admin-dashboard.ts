// Dashboard do Admin Master com dados REAIS (nada fictício). Só lê o que o Admin Master já pode ver nas listas de /admin
// (empresas, perfis e a auditoria da plataforma) — o banco aplica as políticas; este arquivo não usa chave de serviço.
// Não há dados de assinaturas, planos ou pagamentos no sistema: por isso esses indicadores não aparecem.
import { createClient } from '@/lib/supabase/client';

export interface EmpresaResumo { id: string; nome: string; status: string | null; criadoEm: string; tipo: 'empresa' | 'escritorio' }
export interface EventoResumo { id: string; acao: string; tabela: string; criadoEm: string }
export interface PontoCrescimento { mes: string; valor: number }

export interface PainelAdmin {
  empresas: { total: number; novasNoMes: number; porStatus: Record<string, number> };
  escritorios: { total: number; novosNoMes: number; porStatus: Record<string, number> };
  contadores: number;
  usuarios: number;
  crescimento: { empresas: PontoCrescimento[]; escritorios: PontoCrescimento[] };
  recentesEmpresas: EmpresaResumo[];
  recentesEscritorios: EmpresaResumo[];
  atividade: EventoResumo[];
  atencao: { id: string; titulo: string; descricao: string; quantidade: number; href: string }[];
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const ROTULO_STATUS_EMPRESA: Record<string, string> = { ATIVA: 'Ativa', PENDENTE: 'Pendente', SUSPENSA: 'Suspensa' };

// Acumulado de cadastros por mês nos últimos `n` meses (inclui o mês atual)
export function serieAcumulada(datas: string[], n: number, hoje = new Date()): PontoCrescimento[] {
  const pontos: PontoCrescimento[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1); // 1º dia do mês seguinte
    pontos.push({ mes: MESES[new Date(fim.getFullYear(), fim.getMonth() - 1, 1).getMonth()], valor: datas.filter((d) => new Date(d) < fim).length });
  }
  return pontos;
}

export async function carregarPainelAdmin(): Promise<PainelAdmin> {
  const supabase = createClient();
  const [emp, perf, aud] = await Promise.all([
    supabase.from('empresas').select('id, razao_social, nome_comercial, tipo_empresa, status_registro, criado_em').order('criado_em', { ascending: false }),
    supabase.from('perfis').select('tipo_usuario, funcao_global'),
    supabase.from('auditoria').select('id, acao, nome_tabela, criado_em').order('criado_em', { ascending: false }).limit(5),
  ]);
  const falha = emp.error ?? perf.error ?? aud.error;
  if (falha) throw new Error('Não foi possível carregar os indicadores.');

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const linhas: EmpresaResumo[] = (emp.data ?? []).map((e) => ({
    id: e.id as string, nome: ((e.nome_comercial as string | null) || (e.razao_social as string)), status: e.status_registro as string | null,
    criadoEm: e.criado_em as string, tipo: e.tipo_empresa === 'escritorio_contabil' ? 'escritorio' : 'empresa',
  }));
  const de = (t: 'empresa' | 'escritorio') => linhas.filter((l) => l.tipo === t);
  const contagem = (l: EmpresaResumo[]) => l.reduce<Record<string, number>>((acc, x) => { const s = x.status ?? 'SEM_STATUS'; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {});
  const empresas = de('empresa'), escritorios = de('escritorio');
  const novas = (l: EmpresaResumo[]) => l.filter((x) => new Date(x.criadoEm) >= inicioMes).length;
  const pendentes = linhas.filter((l) => l.status === 'PENDENTE').length;
  const suspensas = linhas.filter((l) => l.status === 'SUSPENSA').length;
  return {
    empresas: { total: empresas.length, novasNoMes: novas(empresas), porStatus: contagem(empresas) },
    escritorios: { total: escritorios.length, novosNoMes: novas(escritorios), porStatus: contagem(escritorios) },
    contadores: (perf.data ?? []).filter((p) => p.tipo_usuario === 'contador').length,
    usuarios: (perf.data ?? []).length,
    crescimento: { empresas: serieAcumulada(empresas.map((e) => e.criadoEm), 10), escritorios: serieAcumulada(escritorios.map((e) => e.criadoEm), 10) },
    recentesEmpresas: empresas.slice(0, 5),
    recentesEscritorios: escritorios.slice(0, 5),
    atividade: (aud.data ?? []).map((a) => ({ id: a.id as string, acao: a.acao as string, tabela: a.nome_tabela as string, criadoEm: a.criado_em as string })),
    atencao: [
      { id: 'pendentes', titulo: 'Cadastros pendentes', descricao: 'Empresas e escritórios aguardando ativação', quantidade: pendentes, href: '/admin/empresas' },
      { id: 'suspensas', titulo: 'Cadastros suspensos', descricao: 'Empresas e escritórios com acesso suspenso', quantidade: suspensas, href: '/admin/empresas' },
    ].filter((a) => a.quantidade > 0),
  };
}
