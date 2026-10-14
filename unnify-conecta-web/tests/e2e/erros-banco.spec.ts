import { test, expect } from '@playwright/test';
import { recursoAusente, statusHttpDoErro, MENSAGEM_RECURSO_AUSENTE } from '../../lib/erros-banco';

// Classificação dos erros do Supabase (função ausente ≠ dados inválidos ≠ sem permissão). Sem navegador e sem banco.
test('recurso ausente (migration pendente) é reconhecido e vira 503, não 400', () => {
  const funcao = { code: 'PGRST202', message: 'Could not find the function public.criar_convite_vinculo(...) in the schema cache' };
  const tabela = { code: 'PGRST205', message: "Could not find the table 'public.notificacoes' in the schema cache" };
  expect(recursoAusente(funcao)).toBe(true);
  expect(recursoAusente(tabela)).toBe(true);
  expect(recursoAusente({ code: '42883', message: 'function x does not exist' })).toBe(true);
  expect(statusHttpDoErro(funcao)).toBe(503);
  expect(MENSAGEM_RECURSO_AUSENTE).toContain('atualização do banco');
});

test('demais erros mantêm o status correto', () => {
  expect(recursoAusente(null)).toBe(false);
  expect(recursoAusente({ code: '42501', message: 'Sem permissão' })).toBe(false);
  expect(statusHttpDoErro({ code: '42501' })).toBe(403);
  expect(statusHttpDoErro({ code: '54000' })).toBe(429);
  expect(statusHttpDoErro({ code: '23505' })).toBe(409);
  expect(statusHttpDoErro({ code: '23514', message: 'Informe um e-mail válido.' })).toBe(400);
});
