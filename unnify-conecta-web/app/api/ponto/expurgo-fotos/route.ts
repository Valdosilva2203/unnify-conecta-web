import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Expurgo das fotos do ponto (rotina do SISTEMA, agendada). Desligado por padrão: só roda com PONTO_EXPURGO_FOTOS=ativo
// e, no banco, só alcança empresas com política de retenção ATIVA (prazo + fundamento), sem retenção legal e sem apuração em aberto.
// A chave de serviço é usada só para executar as funções do expurgo (restritas a ela) e remover o objeto do Storage —
// nunca em nome de um usuário. Idempotente: arquivo já ausente conta como removido; falhas ficam para nova tentativa (até 5).
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  if (process.env.PONTO_EXPURGO_FOTOS !== 'ativo') return NextResponse.json({ ativo: false, excluidas: 0 });

  const servico = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await servico.rpc('iniciar_expurgo_fotos_ponto', { p_limite: 100 });
  if (error || !data) {
    console.error('Expurgo de fotos: não foi possível iniciar —', error?.code);
    return NextResponse.json({ ativo: true, erro: 'Falha ao iniciar.' }, { status: 503 });
  }
  const { id_execucao: idExecucao, itens } = data as { id_execucao: string; itens: { id_marcacao: string; caminho: string }[] };
  let excluidas = 0;
  let falhas = 0;
  for (const item of itens) {
    const { error: e } = await servico.storage.from('ponto').remove([item.caminho]);
    const { error: e2 } = await servico.rpc('concluir_expurgo_foto_ponto', { p_id_execucao: idExecucao, p_id_marcacao: item.id_marcacao, p_ok: !e, p_erro: e ? 'falha ao remover do Storage' : null });
    if (!e && !e2) excluidas++; else falhas++;
  }
  await servico.rpc('finalizar_expurgo_fotos_ponto', { p_id_execucao: idExecucao });
  return NextResponse.json({ ativo: true, selecionadas: itens.length, excluidas, falhas });
}
