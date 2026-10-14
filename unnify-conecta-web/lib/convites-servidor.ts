// E4.1 — utilitários de SERVIDOR para convites (nunca importar em componentes do navegador).
// O token tem 256 bits, é gerado aqui, vai só no e-mail (no FRAGMENTO da URL: não chega a servidores, logs nem analytics)
// e o banco guarda apenas o SHA-256. O banco também calcula o hash no aceite (hash_convite).
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { enviarEmail, escaparHtml } from './email';
import { MENSAGEM_RECURSO_AUSENTE, recursoAusente, statusHttpDoErro, type ErroBanco } from './erros-banco';

export const gerarToken = () => randomBytes(32).toString('base64url');
export const hashDoToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

const ORIGEM_PADRAO = 'https://unnifyconecta.com.br';
// O link do e-mail nunca usa um host arbitrário do cabeçalho (evita link com token apontando para domínio de terceiros)
export function origemConfiavel(req: NextRequest): string {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL;
  if (configurada) return configurada.replace(/\/$/, '');
  const { hostname, origin } = req.nextUrl;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'unnifyconecta.com.br' || hostname.endsWith('.unnifyconecta.com.br')) return origin;
  return ORIGEM_PADRAO;
}

// Cliente com a SESSÃO DO USUÁRIO (anon key + cookies): o banco aplica RLS e as regras das funções
export function clienteDoUsuario(req: NextRequest) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} },
  });
}

// Mensagens do banco pensadas para o usuário passam; o resto vira mensagem genérica (sem detalhe técnico)
const CODIGOS_AMIGAVEIS = new Set(['P0001', 'P0002', '42501', '23505', '23514', '54000', '28000']);
export function erroAmigavel(erro: ErroBanco, padrao: string) {
  // Função ausente neste banco (migration pendente): 503 com explicação, nunca 400 genérico de "dados inválidos"
  if (recursoAusente(erro)) {
    console.error('Convites: recurso ausente no banco —', erro?.code);
    return NextResponse.json({ erro: MENSAGEM_RECURSO_AUSENTE, codigo: 'recurso_ausente' }, { status: 503 });
  }
  const msg = erro?.code && CODIGOS_AMIGAVEIS.has(erro.code) && erro.message ? erro.message : padrao;
  return NextResponse.json({ erro: msg }, { status: statusHttpDoErro(erro) });
}

export interface DadosConvite {
  sentido: 'contador_para_empresa' | 'empresa_para_contador';
  remetente: string | null;
  escritorio: string | null;
  cnpj_convidado: string | null;
  mensagem: string | null;
  expira_em: string;
}

const formatarCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// E-mail do convite: identificação, remetente, motivo, botão, validade e orientação. Sem dados financeiros/documentos.
export function emailDoConvite(d: DadosConvite, nomeDestino: string | null, link: string) {
  const remetente = d.sentido === 'contador_para_empresa'
    ? `${d.remetente ?? 'Um contador'}${d.escritorio ? ` (${d.escritorio})` : ''}`
    : d.remetente ?? 'Uma empresa';
  const motivo = d.sentido === 'contador_para_empresa'
    ? `${remetente} convidou você a conectar a empresa de CNPJ ${formatarCnpj(d.cnpj_convidado ?? '')} ao escritório no Unnify Conecta, plataforma que organiza documentos, obrigações e a rotina entre empresas e contadores. Crie sua conta com este e-mail, cadastre a empresa e aceite o vínculo — você escolhe o que o contador poderá acessar.`
    : `${remetente} convidou você para ser o contador da empresa no Unnify Conecta, plataforma que organiza documentos, obrigações e a rotina entre empresas e contadores. Crie sua conta profissional com este e-mail e aceite o vínculo.`;
  const assunto = d.sentido === 'contador_para_empresa' ? `${d.remetente ?? 'Seu contador'} convidou você para o Unnify Conecta` : `${d.remetente ?? 'Uma empresa'} convidou você para o Unnify Conecta`;
  const mensagem = d.mensagem ? `<p style="font-size:14px;line-height:1.5;background:#f9fafb;border-left:3px solid #ea580c;padding:10px 12px;margin:0 0 16px">“${escaparHtml(d.mensagem)}”</p>` : '';
  const html = `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#111">
  <p style="font-size:13px;font-weight:bold;color:#ea580c;margin:0 0 8px">UNNIFY CONECTA</p>
  <h1 style="font-size:22px;margin:0 0 16px">Você recebeu um convite</h1>
  <p style="font-size:15px;line-height:1.5">${escaparHtml(nomeDestino ? `Olá, ${nomeDestino}!` : 'Olá!')}</p>
  <p style="font-size:15px;line-height:1.5">${escaparHtml(motivo)}</p>
  ${mensagem}
  <p style="margin:28px 0"><a href="${link}" style="background:#ea580c;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block">Aceitar convite</a></p>
  <p style="font-size:13px;color:#555;line-height:1.5">${escaparHtml(`O convite vale até ${dataBr(d.expira_em)} e só pode ser usado uma vez, pelo destinatário deste e-mail. Nenhum vínculo é criado sem a sua aceitação. Se você não reconhece este convite, ignore este e-mail.`)}</p>
</div>`;
  return { assunto: assunto.slice(0, 150), html };
}

// Envia o e-mail do convite (dados lidos pelo próprio token). Retorna false em qualquer falha — nunca "entregue" sem envio.
export async function enviarConvite(supabase: ReturnType<typeof clienteDoUsuario>, token: string, nome: string | null, email: string, origem: string) {
  const { data } = await supabase.rpc('dados_convite', { p_token: token });
  const dados = (data as DadosConvite[] | null)?.[0];
  if (!dados) return false;
  const { assunto, html } = emailDoConvite(dados, nome, `${origem}/convite#${token}`);
  try {
    return await enviarEmail({ para: email, assunto, html });
  } catch {
    return false;
  }
}
