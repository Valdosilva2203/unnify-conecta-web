import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { excedeuLimite, ipDaRequisicao } from '@/lib/limite-taxa';

// Cria a conta do colaborador a partir de um convite VÁLIDO. O token (recebido no e-mail) prova a posse do e-mail.
// A chave de serviço é usada SÓ para criar a identidade no Auth (como no cadastro); nenhum dado é gravado em nome do usuário aqui.
// O vínculo com o funcionário é feito depois pela função aceitar_convite_colaborador, com a SESSÃO do próprio colaborador.
const SENHA_VALIDA = (s: string) => s.length >= 8 && s.length <= 72 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s) && /[^A-Za-z0-9]/.test(s);

export async function POST(req: NextRequest) {
  if (excedeuLimite(`ativar-colaborador:ip:${ipDaRequisicao(req.headers)}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429 });
  }
  const corpo = await req.json().catch(() => null);
  const token = typeof corpo?.token === 'string' ? corpo.token : '';
  const senha = typeof corpo?.senha === 'string' ? corpo.senha : '';
  const nome = typeof corpo?.nome === 'string' ? corpo.nome.trim() : '';
  if (token.length < 40 || token.length > 100) return NextResponse.json({ erro: 'Convite inválido.' }, { status: 400 });
  if (nome.length < 2 || nome.length > 120) return NextResponse.json({ erro: 'Informe seu nome completo.' }, { status: 400 });
  if (!SENHA_VALIDA(senha)) return NextResponse.json({ erro: 'A senha deve ter de 8 a 72 caracteres, com letras maiúsculas, minúsculas, números e um símbolo.' }, { status: 400 });

  const anonimo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await anonimo.rpc('dados_convite_colaborador', { p_token: token });
  const convite = (data as { situacao: string; email: string | null }[] | null)?.[0];
  if (!convite || convite.situacao !== 'valido' || !convite.email) {
    return NextResponse.json({ erro: 'Este convite não é mais válido. Peça um novo ao RH da empresa.' }, { status: 400 });
  }

  const servico = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await servico.auth.admin.createUser({ email: convite.email, password: senha, email_confirm: true, user_metadata: { nome_completo: nome } });
  if (error) {
    // Quem tem o token já conhece o e-mail do convite: dizer que a conta existe não revela nada novo
    if (/already|registered|exists/i.test(error.message)) return NextResponse.json({ conta_existente: true }, { status: 409 });
    console.error('Ativação do colaborador: falha ao criar conta —', error.code ?? error.name);
    return NextResponse.json({ erro: 'Não foi possível criar sua conta. Tente novamente.' }, { status: 500 });
  }
  return NextResponse.json({ email: convite.email });
}
