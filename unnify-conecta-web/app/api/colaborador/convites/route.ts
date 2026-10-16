import { NextResponse, type NextRequest } from 'next/server';
import { excedeuLimite } from '@/lib/limite-taxa';
import { registroUnico } from '@/lib/portal-colaborador';
import { enviarEmail, escaparHtml } from '@/lib/email';
import { clienteDoUsuario, erroAmigavel, gerarToken, hashDoToken, origemConfiavel } from '@/lib/convites-servidor';

// RH convida o funcionário para o Portal do Colaborador. Grava COM A SESSÃO DO USUÁRIO: o banco confere empresa, permissão e situação.
// O token vai só no e-mail (fragmento da URL); o banco guarda o SHA-256. Nunca usa service_role.
export async function POST(req: NextRequest) {
  const supabase = clienteDoUsuario(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Faça login para enviar convites.' }, { status: 401 });
  if (excedeuLimite(`convites-colaborador:${user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ erro: 'Muitos convites em pouco tempo. Aguarde alguns minutos.' }, { status: 429 });
  }
  const corpo = await req.json().catch(() => null);
  const idFuncionario = typeof corpo?.id_funcionario === 'string' && /^[0-9a-f-]{36}$/i.test(corpo.id_funcionario) ? corpo.id_funcionario : null;
  const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase().slice(0, 254) : '';
  if (!idFuncionario) return NextResponse.json({ erro: 'Funcionário inválido.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ erro: 'Informe um e-mail válido.' }, { status: 400 });

  // Regra de negócio: sem jornada configurada o ponto não é apurado (o banco também confere, migration 057)
  const { data: jornada } = await supabase.from('jornadas_funcionario').select('id').eq('id_funcionario', idFuncionario).limit(1);
  if (!jornada?.length) return NextResponse.json({ erro: 'Configure a jornada de trabalho do funcionário antes de convidá-lo para o portal.' }, { status: 400 });

  const token = gerarToken();
  const { data, error } = await supabase.rpc('criar_convite_colaborador', { p_id_funcionario: idFuncionario, p_email: email, p_hash: hashDoToken(token) });
  const convite = registroUnico<{ id: string; nome: string; empresa: string; email: string; expira_em: string }>(data);
  if (error || !convite) return erroAmigavel(error, 'Não foi possível criar o convite. Tente novamente.');

  const link = `${origemConfiavel(req)}/colaborador/ativar#${token}`;
  const validade = new Date(convite.expira_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const html = `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#111">
  <p style="font-size:13px;font-weight:bold;color:#ea580c;margin:0 0 8px">UNNIFY CONECTA · PORTAL DO COLABORADOR</p>
  <h1 style="font-size:22px;margin:0 0 16px">Ative seu acesso</h1>
  <p style="font-size:15px;line-height:1.5">${escaparHtml(`Olá, ${convite.nome.split(' ')[0]}!`)}</p>
  <p style="font-size:15px;line-height:1.5">${escaparHtml(`${convite.empresa} convidou você para o Portal do Colaborador, onde você registra o ponto, acompanha sua jornada e consulta seus holerites.`)}</p>
  <p style="margin:28px 0"><a href="${link}" style="background:#ea580c;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block">Ativar meu acesso</a></p>
  <p style="font-size:13px;color:#555;line-height:1.5">${escaparHtml(`O link vale até ${validade}, só pode ser usado uma vez e somente com este e-mail. Você mesmo define sua senha. Se não reconhece este convite, ignore este e-mail.`)}</p>
</div>`;
  let enviado = false;
  try {
    enviado = await enviarEmail({ para: convite.email, assunto: `${convite.empresa} convidou você para o Portal do Colaborador`.slice(0, 150), html });
  } catch {
    enviado = false;
  }
  await supabase.rpc('registrar_envio_convite_colaborador', { p_id: convite.id, p_ok: enviado });
  return NextResponse.json({ enviado, expira_em: convite.expira_em });
}
