'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { precisaSegundoFator } from '@/lib/supabase/mfa';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

// Segunda etapa do login: código do aplicativo autenticador (TOTP, Supabase Auth MFA).
export default function VerificacaoMfaPage() {
  const router = useRouter();
  const [idFator, setIdFator] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      if (!(await precisaSegundoFator(supabase))) {
        router.replace('/onboarding');
        return;
      }
      const { data } = await supabase.auth.mfa.listFactors();
      const fator = data?.totp?.find((f) => f.status === 'verified');
      if (!fator) {
        router.replace('/onboarding');
        return;
      }
      setIdFator(fator.id);
    })().catch(() => router.replace('/login'));
  }, [router]);

  const verificar = async (e: FormEvent) => {
    e.preventDefault();
    if (!idFator || verificando) return;
    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6) {
      setErro('Digite os 6 números do aplicativo autenticador.');
      return;
    }
    setVerificando(true);
    setErro(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: idFator, code: limpo });
    setVerificando(false);
    if (error) {
      setErro(error.status === 429 ? 'Muitas tentativas. Aguarde um pouco e tente novamente.' : 'Código inválido ou expirado. Confira o aplicativo e tente de novo.');
      setCodigo('');
      return;
    }
    router.replace('/onboarding');
  };

  const sair = async () => {
    await createClient().auth.signOut();
    window.location.assign('/login');
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={150} height={50} priority className="h-9 w-auto mb-6" />
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-lg p-6 sm:p-8">
        <span className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 inline-flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-black text-gray-900">Verificação em duas etapas</h1>
        <p className="text-sm text-gray-600 mt-1">Abra o aplicativo autenticador e digite o código de 6 números da sua conta Unnify Conecta.</p>
        <form onSubmit={verificar} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="codigo-mfa" className="block text-sm font-semibold text-gray-900 mb-2">
              Código de verificação
            </label>
            <input
              id="codigo-mfa"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={!idFator}
              placeholder="000000"
              className="w-full h-12 px-3 border border-gray-300 rounded-lg bg-white text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          {erro && (
            <p role="alert" className="text-sm text-red-700">
              {erro}
            </p>
          )}
          <button type="submit" disabled={!idFator || verificando} className={`${classeBotaoPrimario} w-full`}>
            {verificando ? 'Verificando...' : 'Verificar e entrar'}
          </button>
          <button type="button" onClick={sair} className={`${classeBotaoSecundario} w-full`}>
            Cancelar e sair
          </button>
        </form>
      </div>
    </main>
  );
}
