import type { SupabaseClient, User } from '@supabase/supabase-js';

export type Secao = 'dados' | 'seguranca' | 'notificacoes' | 'preferencias' | 'privacidade';

export interface PerfilPessoal {
  nome_completo: string | null;
  telefone: string | null;
  url_avatar: string | null;
  funcao_global: string | null;
  tipo_usuario: string | null;
  status: string | null;
}

export interface Preferencias {
  notificacoes: Record<string, { sistema?: boolean; email?: boolean }>;
  reduzir_animacoes: boolean;
}

export const PREFERENCIAS_PADRAO: Preferencias = { notificacoes: {}, reduzir_animacoes: false };

// Rótulo do perfil exibido em "Minha conta" (somente leitura: papéis não mudam por aqui).
export function rotuloDoPerfil(perfil: PerfilPessoal | null, temEscritorio: boolean): string {
  if (perfil?.funcao_global === 'admin_master') return 'Admin Master';
  if (perfil?.funcao_global === 'admin') return 'Administrador';
  if (perfil?.tipo_usuario === 'contador') return temEscritorio ? 'Contador · escritório contábil' : 'Contador autônomo';
  if (perfil?.tipo_usuario === 'empresa') return 'Empresário';
  return 'Usuário';
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Aplica as preferências de exibição na página atual.
export function aplicarPreferenciasExibicao(preferencias: Pick<Preferencias, 'reduzir_animacoes'>) {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute('data-reduzir-animacoes', !!preferencias.reduzir_animacoes);
}

// Carrega e aplica as preferências de exibição do usuário logado (chamado pelos layouts das áreas).
export async function carregarPreferenciasExibicao(supabase: SupabaseClient, usuario: User) {
  const { data } = await supabase.from('preferencias_usuario').select('reduzir_animacoes').eq('id_usuario', usuario.id).maybeSingle();
  aplicarPreferenciasExibicao({ reduzir_animacoes: !!data?.reduzir_animacoes });
}
