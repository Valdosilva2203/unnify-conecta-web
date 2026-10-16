// Anotações da empresa (migration 051): tipos e constantes. O banco decide quem vê/edita; a tela só informa a empresa.
export type CategoriaAnotacao = 'pessoal' | 'empresa' | 'ideias' | 'reunioes' | 'outras';

export interface Anotacao {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: CategoriaAnotacao;
  tags: string[];
  fixada: boolean;
  criado_por: string | null;
  atualizado_em: string;
}

export const CATEGORIAS_ANOTACAO: { id: CategoriaAnotacao; rotulo: string; cor: string; ponto: string }[] = [
  { id: 'pessoal', rotulo: 'Pessoal', cor: 'bg-green-100 text-green-800', ponto: '#22c55e' },
  { id: 'empresa', rotulo: 'Empresa', cor: 'bg-amber-100 text-amber-800', ponto: '#f59e0b' },
  { id: 'ideias', rotulo: 'Ideias', cor: 'bg-violet-100 text-violet-800', ponto: '#8b5cf6' },
  { id: 'reunioes', rotulo: 'Reuniões', cor: 'bg-blue-100 text-blue-800', ponto: '#3b82f6' },
  { id: 'outras', rotulo: 'Outras', cor: 'bg-gray-100 text-gray-700', ponto: '#9ca3af' },
];
export const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS_ANOTACAO.map((c) => [c.id, c.rotulo])) as Record<CategoriaAnotacao, string>;
export const COR_CATEGORIA = Object.fromEntries(CATEGORIAS_ANOTACAO.map((c) => [c.id, c.cor])) as Record<CategoriaAnotacao, string>;

export const LIMITE_TITULO = 120;
export const LIMITE_CONTEUDO = 20000;
export const LIMITE_TAGS = 10;
export const LIMITE_TAG = 30;

export const dataHoraAnotacao = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).replace(', ', ' ');

// Mesma regra do banco: apara, descarta vazias e repetidas (sem diferenciar maiúsculas), até 10 tags de até 30 caracteres
export function limparTags(tags: string[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const t of tags) {
    const limpa = t.trim().slice(0, LIMITE_TAG);
    if (!limpa || vistas.has(limpa.toLowerCase())) continue;
    vistas.add(limpa.toLowerCase());
    saida.push(limpa);
  }
  return saida.slice(0, LIMITE_TAGS);
}

// Ordem da lista: fixadas primeiro, depois a mais recente (desempate estável pelo id)
export const ordenarAnotacoes = (l: Anotacao[]) => [...l].sort((a, b) => Number(b.fixada) - Number(a.fixada) || b.atualizado_em.localeCompare(a.atualizado_em) || a.id.localeCompare(b.id));

const semAcento = (s: string) => s.normalize('NFD').replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '').toLowerCase();
export const casaComBusca = (a: Anotacao, busca: string) => {
  const t = semAcento(busca.trim());
  return !t || semAcento(a.titulo).includes(t) || semAcento(a.conteudo).includes(t);
};
