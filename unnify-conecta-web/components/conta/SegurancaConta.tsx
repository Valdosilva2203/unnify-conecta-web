'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, ShieldCheck, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { classeBotaoPrimario } from '@/components/ui/Modal';

const ESPERA_SEGUNDOS = 60;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Retorno = { tipo: 'sucesso' | 'erro'; texto: string } | null;

// Traduz os erros do Supabase Auth sem expor detalhes internos.
function mensagemErroEmail(erro: { status?: number; code?: string; message?: string }): string {
  const msg = (erro.message ?? '').toLowerCase();
  if (erro.code === 'email_exists' || msg.includes('already been registered')) {
    return 'Este e-mail já está em uso por outra conta.';
  }
  if (erro.status === 429 || erro.code?.includes('rate_limit') || msg.includes('for security purposes')) {
    return 'Muitas solicitações seguidas. Aguarde um minuto e tente novamente.';
  }
  if (erro.code === 'email_address_invalid' || erro.code === 'validation_failed' || msg.includes('invalid')) {
    return 'Informe um e-mail válido.';
  }
  if (erro.status === 401 || erro.code === 'session_not_found' || msg.includes('session')) {
    return 'Sua sessão expirou. Entre novamente para alterar o e-mail.';
  }
  return 'Não foi possível solicitar a alteração agora. Tente novamente em instantes.';
}

export function SegurancaConta() {
  const [carregando, setCarregando] = useState(true);
  const [semSessao, setSemSessao] = useState(false);
  const [emailAtual, setEmailAtual] = useState('');
  const [emailPendente, setEmailPendente] = useState<string | null>(null);
  const [novoEmail, setNovoEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);
  const [retorno, setRetorno] = useState<Retorno>(null);

  useEffect(() => {
    // getUser valida a sessão no servidor do Supabase Auth (não confia só no cookie local).
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          setSemSessao(true);
        } else {
          setEmailAtual(user.email ?? '');
          setEmailPendente(user.new_email ?? null);
        }
        setCarregando(false);
      });
  }, []);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const solicitar = async (e: FormEvent) => {
    e.preventDefault();
    setRetorno(null);
    const email = novoEmail.trim().toLowerCase();
    if (!FORMATO_EMAIL.test(email)) {
      setRetorno({ tipo: 'erro', texto: 'Informe um e-mail válido.' });
      return;
    }
    if (email === emailAtual.toLowerCase()) {
      setRetorno({ tipo: 'erro', texto: 'Este já é o seu e-mail atual. Informe um endereço diferente.' });
      return;
    }
    if (enviando || espera > 0) return;

    setEnviando(true);
    const { data, error } = await createClient().auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/auth/confirmar-email` }
    );
    setEnviando(false);
    setEspera(ESPERA_SEGUNDOS);

    if (error) {
      if (error.status === 401) setSemSessao(true);
      setRetorno({ tipo: 'erro', texto: mensagemErroEmail(error) });
      return;
    }
    // A troca só vale depois da confirmação: o e-mail atual continua o mesmo até lá.
    setEmailAtual(data.user?.email ?? emailAtual);
    setEmailPendente(data.user?.new_email ?? email);
    setNovoEmail('');
    setRetorno({
      tipo: 'sucesso',
      texto: 'Solicitação enviada. Enviamos links de confirmação para o e-mail atual e para o novo. A alteração só é concluída depois de confirmar nos dois.',
    });
  };

  return (
    <section aria-labelledby="titulo-seguranca" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-orange-100 text-orange-600 inline-flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="titulo-seguranca" className="text-lg font-bold text-gray-900">
            Segurança da conta
          </h2>
          <p className="text-sm text-gray-600">Altere o e-mail que você usa para entrar no Unnify Conecta.</p>
        </div>
      </div>

      {carregando ? (
        <div role="status" aria-label="Carregando" className="h-40 rounded-xl bg-gray-50 animate-pulse" />
      ) : semSessao ? (
        <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          Sua sessão expirou.{' '}
          <Link href="/login" className="font-semibold underline">
            Entre novamente
          </Link>{' '}
          para alterar o e-mail.
        </div>
      ) : (
        <div className="space-y-5">
          <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Alterar e-mail</h3>
          <div>
            <label htmlFor="email-atual" className="block text-sm font-semibold text-gray-900 mb-2">
              E-mail atual
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                id="email-atual"
                type="email"
                value={emailAtual}
                readOnly
                aria-readonly="true"
                className="w-full h-11 pl-11 pr-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
              />
            </div>
          </div>

          {emailPendente && (
            <div role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Clock className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="min-w-0">
                <strong>Alteração pendente</strong> para <span className="font-semibold break-all">{emailPendente}</span>. Confirme pelos links
                enviados ao e-mail atual e ao novo. Até lá, continue entrando com o e-mail atual.
              </p>
            </div>
          )}

          <form onSubmit={solicitar} noValidate className="space-y-3">
            <div>
              <label htmlFor="novo-email" className="block text-sm font-semibold text-gray-900 mb-2">
                Novo e-mail
              </label>
              <input
                id="novo-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                required
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                aria-describedby={retorno ? 'retorno-email' : undefined}
                placeholder="seu.novo@email.com"
                className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button type="submit" disabled={enviando || espera > 0} className={`${classeBotaoPrimario} w-full sm:w-auto`}>
              {enviando ? 'Enviando...' : espera > 0 ? `Aguarde ${espera}s para nova solicitação` : 'Solicitar alteração'}
            </button>
          </form>

          {retorno && (
            <div
              id="retorno-email"
              role={retorno.tipo === 'erro' ? 'alert' : 'status'}
              className={`flex gap-3 rounded-xl border p-4 text-sm ${
                retorno.tipo === 'erro' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'
              }`}
            >
              {retorno.tipo === 'erro' ? (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <p>{retorno.texto}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
