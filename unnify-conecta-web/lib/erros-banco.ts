// Classificação de erros do Supabase/PostgREST, sem dependências (vale no navegador, no servidor e em testes).
// "Recurso ausente" = função/tabela que o código usa ainda não existe NESTE banco (migration pendente). Não é erro do usuário
// nem "lista vazia": a tela deve dizer que a área ainda não está disponível, e a API responder 503 (não 400).

export type ErroBanco = { code?: string; message?: string; status?: number } | null | undefined;

// PGRST202 = função não encontrada · PGRST205 = tabela/view não encontrada · 42883/42P01 = função/tabela inexistente (acesso direto)
export function recursoAusente(erro: ErroBanco): boolean {
  if (!erro) return false;
  if (erro.code === 'PGRST202' || erro.code === 'PGRST205' || erro.code === '42883' || erro.code === '42P01') return true;
  return /could not find the (function|table)|schema cache/i.test(erro.message ?? '');
}

export const MENSAGEM_RECURSO_AUSENTE = 'Esta área ainda não está disponível neste ambiente: falta aplicar uma atualização do banco de dados. Avise o suporte.';

export function semPermissao(erro: ErroBanco): boolean {
  return erro?.code === '42501';
}

// Status HTTP adequado para a rota de API a partir do erro do banco
export function statusHttpDoErro(erro: ErroBanco): number {
  if (recursoAusente(erro)) return 503;
  if (erro?.code === '42501') return 403;
  if (erro?.code === '54000') return 429;
  if (erro?.code === '23505') return 409;
  return 400;
}
