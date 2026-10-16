'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { CHAVE_CONVITE, SENHA_REGRAS, registroUnico } from '@/lib/portal-colaborador';
import { CartaoAcesso } from '@/components/colaborador/CartaoAcesso';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

interface Convite { situacao: 'valido' | 'expirado' | 'usado' | 'revogado' | 'invalido'; nome: string | null; empresa: string | null; email: string | null; expira_em: string | null }
const MENSAGENS: Record<Exclude<Convite['situacao'], 'valido'>, string> = {
  expirado: 'Este convite expirou. Peça um novo ao RH da empresa.',
  usado: 'Este convite já foi utilizado. Entre com seu e-mail e senha.',
  revogado: 'Este convite foi cancelado pela empresa.',
  invalido: 'Link de convite inválido. Confira se abriu o link completo do e-mail.',
};
const campo = 'w-full h-12 px-3 border border-gray-300 rounded-lg bg-white text-base focus:outline-none focus:ring-2 focus:ring-orange-500';

const lerToken = () => {
  try {
    const doLink = window.location.hash.replace(/^#/, '');
    if (doLink) {
      sessionStorage.setItem(CHAVE_CONVITE, doLink);
      history.replaceState(null, '', window.location.pathname); // tira o token da barra de endereço
      return doLink;
    }
    return sessionStorage.getItem(CHAVE_CONVITE) ?? '';
  } catch {
    return window.location.hash.replace(/^#/, '');
  }
};
const esquecerToken = () => { try { sessionStorage.removeItem(CHAVE_CONVITE); } catch { /* sem armazenamento */ } };

// Ativação do acesso ao Portal do Colaborador: o colaborador define a PRÓPRIA senha; o vínculo é feito pelo banco com a sessão dele.
export default function AtivarColaboradorPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [convite, setConvite] = useState<Convite | null>(null);
  const [sessaoEmail, setSessaoEmail] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [contaExistente, setContaExistente] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const t = lerToken();
    setToken(t);
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSessaoEmail(session?.user.email ?? null);
      const { data } = await supabase.rpc('dados_convite_colaborador', { p_token: t });
      const c = registroUnico<Convite>(data) ?? ({ situacao: 'invalido' } as Convite);
      setConvite(c);
      if (c.nome) setNome(c.nome);
    })().catch(() => setConvite({ situacao: 'invalido', nome: null, empresa: null, email: null, expira_em: null }));
  }, []);

  async function vincular() {
    const { error } = await createClient().rpc('aceitar_convite_colaborador', { p_token: token });
    if (error) throw error;
    esquecerToken();
    router.replace('/colaborador');
  }

  async function ativarComSessao() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    try { await vincular(); } catch (e) { setErro(mensagemDeErro(e as { message?: string }, 'Não foi possível ativar o acesso.')); setOcupado(false); }
  }

  async function criarConta(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado || !convite?.email) return;
    setErro(null);
    if (nome.trim().length < 2) return setErro('Informe seu nome completo.');
    if (!SENHA_REGRAS.every(([, regra]) => regra(senha))) return setErro('A senha não atende a todos os requisitos.');
    if (senha !== confirma) return setErro('As senhas não conferem.');
    setOcupado(true);
    try {
      const r = await fetch('/api/colaborador/ativar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, senha, nome: nome.trim() }) });
      const corpo = await r.json().catch(() => ({}));
      if (r.status === 409 && corpo.conta_existente) { setContaExistente(true); setOcupado(false); return; }
      if (!r.ok) { setErro(corpo.erro ?? 'Não foi possível criar sua conta.'); setOcupado(false); return; }
      const { error } = await createClient().auth.signInWithPassword({ email: convite.email, password: senha });
      if (error) { setErro('Conta criada, mas não foi possível entrar. Use "Entrar" com seu e-mail e a senha que você definiu.'); setOcupado(false); return; }
      await vincular();
    } catch (e2) {
      setErro(mensagemDeErro(e2 as { message?: string }, 'Não foi possível ativar o acesso. Tente novamente.'));
      setOcupado(false);
    }
  }

  async function sair() {
    await createClient().auth.signOut();
    setSessaoEmail(null);
  }

  if (!convite) {
    return <CartaoAcesso titulo="Portal do Colaborador"><div role="status" className="flex justify-center py-6 text-gray-500"><Loader2 className="w-6 h-6 animate-spin" aria-label="Carregando convite" /></div></CartaoAcesso>;
  }
  if (convite.situacao !== 'valido') {
    return (
      <CartaoAcesso titulo="Convite indisponível" subtitulo={MENSAGENS[convite.situacao]}>
        <Link href="/login" className={`${classeBotaoPrimario} w-full`}>Ir para o login</Link>
      </CartaoAcesso>
    );
  }
  const subtitulo = `${convite.empresa} convidou você para o Portal do Colaborador.`;
  if (sessaoEmail) {
    const mesma = sessaoEmail.toLowerCase() === convite.email?.toLowerCase();
    return (
      <CartaoAcesso titulo={`Olá, ${convite.nome}!`} subtitulo={subtitulo}>
        {mesma ? (
          <>
            <p className="text-sm text-gray-700 text-center">Você está conectado como <strong>{sessaoEmail}</strong>. Confirme para ativar seu acesso.</p>
            {erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
            <button type="button" onClick={ativarComSessao} disabled={ocupado} className={`${classeBotaoPrimario} w-full`}>{ocupado ? 'Ativando…' : 'Ativar meu acesso'}</button>
          </>
        ) : (
          <>
            <p role="alert" className="text-sm text-orange-900 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              Você está conectado com outra conta ({sessaoEmail}). O convite só pode ser usado pela conta do e-mail que o recebeu.</p>
            <button type="button" onClick={sair} className={`${classeBotaoSecundario} w-full`}>Sair desta conta</button>
          </>
        )}
      </CartaoAcesso>
    );
  }
  if (contaExistente) {
    return (
      <CartaoAcesso titulo="Você já tem uma conta" subtitulo={`O e-mail ${convite.email} já está cadastrado no Unnify Conecta.`}>
        <p className="text-sm text-gray-700 text-center">Entre com sua senha atual para ativar o acesso ao portal. Se não lembra a senha, use “Esqueci minha senha”.</p>
        <Link href="/login" className={`${classeBotaoPrimario} w-full`}>Entrar</Link>
        <Link href="/forgot-password" className="block text-center text-sm font-semibold text-orange-700 hover:underline">Esqueci minha senha</Link>
      </CartaoAcesso>
    );
  }
  return (
    <CartaoAcesso titulo="Bem-vindo(a)!" subtitulo={`${subtitulo} Defina sua senha para ativar o acesso.`}>
      <form onSubmit={criarConta} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email-convite" className="block text-sm font-semibold text-gray-900 mb-1.5">E-mail</label>
          <input id="email-convite" value={convite.email ?? ''} readOnly className={`${campo} bg-gray-50 text-gray-600`} />
        </div>
        <div>
          <label htmlFor="nome-colaborador" className="block text-sm font-semibold text-gray-900 mb-1.5">Nome completo</label>
          <input id="nome-colaborador" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120} className={campo} />
        </div>
        <div>
          <label htmlFor="nova-senha" className="block text-sm font-semibold text-gray-900 mb-1.5">Nova senha</label>
          <div className="relative">
            <input id="nova-senha" type={ver ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" maxLength={72} className={`${campo} pr-12`} />
            <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-0 top-0 h-12 w-12 inline-flex items-center justify-center text-gray-500">
              {ver ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}</button>
          </div>
        </div>
        <div>
          <label htmlFor="confirmar-senha" className="block text-sm font-semibold text-gray-900 mb-1.5">Confirmar nova senha</label>
          <input id="confirmar-senha" type={ver ? 'text' : 'password'} value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" maxLength={72} className={campo} />
        </div>
        <ul aria-label="Requisitos da senha" className="rounded-xl bg-gray-50 p-3 space-y-1 text-sm">
          {SENHA_REGRAS.map(([rotulo, regra]) => {
            const ok = regra(senha);
            return <li key={rotulo} className={`flex items-center gap-2 ${ok ? 'text-green-700' : 'text-gray-600'}`}>
              {ok ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <Circle className="w-4 h-4" aria-hidden="true" />}{rotulo}<span className="sr-only">{ok ? ' (atendido)' : ' (pendente)'}</span></li>;
          })}
        </ul>
        {erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <button type="submit" disabled={ocupado} className={`${classeBotaoPrimario} w-full`}>{ocupado ? 'Ativando…' : 'Criar minha conta'}</button>
        <p className="text-center text-sm text-gray-600">Já tem conta? <Link href="/login" className="font-semibold text-orange-700 hover:underline">Entrar</Link></p>
      </form>
    </CartaoAcesso>
  );
}
