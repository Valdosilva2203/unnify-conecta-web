'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { classeBotaoPrimario } from '@/components/ui/Modal';

type Estado =
  | { etapa: 'verificando' }
  | { etapa: 'parcial' }
  | { etapa: 'concluido'; email: string; destino: string }
  | { etapa: 'invalido' };

async function destinoMinhaConta(supabase: ReturnType<typeof createClient>, idUsuario: string) {
  const { data: perfil } = await supabase
    .from('perfis')
    .select('tipo_usuario, funcao_global')
    .eq('id_usuario', idUsuario)
    .maybeSingle();
  if (perfil?.funcao_global === 'admin_master' || perfil?.funcao_global === 'admin') return '/admin/seguranca';
  if (perfil?.tipo_usuario === 'contador') return '/contador/minha-conta';
  return '/app/minha-conta';
}

// Destino dos links do e-mail "Confirme a alteração do seu e-mail" (Supabase Auth, Secure Email Change).
export default function ConfirmarEmailPage() {
  const iniciado = useRef(false);
  const [estado, setEstado] = useState<Estado>({ etapa: 'verificando' });

  useEffect(() => {
    // O token é de uso único: uma segunda execução (Strict Mode) falharia.
    if (iniciado.current) return;
    iniciado.current = true;

    (async () => {
      const params = new URL(window.location.href).searchParams;
      const tokenHash = params.get('token_hash');
      if (!tokenHash || params.get('type') !== 'email_change') {
        setEstado({ etapa: 'invalido' });
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email_change' });
      // Remove o token da barra de endereços e do histórico.
      window.history.replaceState(null, '', '/auth/confirmar-email');
      if (error) {
        setEstado({ etapa: 'invalido' });
        return;
      }
      // Na troca segura, a primeira confirmação não conclui nada: falta o link do outro e-mail.
      if (!data.session) {
        setEstado({ etapa: 'parcial' });
        return;
      }
      const { data: atual } = await supabase.auth.getUser();
      if (!atual.user || atual.user.new_email) {
        setEstado({ etapa: 'parcial' });
        return;
      }
      setEstado({
        etapa: 'concluido',
        email: atual.user.email ?? '',
        destino: await destinoMinhaConta(supabase, atual.user.id),
      });
    })().catch(() => setEstado({ etapa: 'invalido' }));
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={150} height={50} priority className="h-9 w-auto mb-6" />
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-lg p-6 sm:p-8 text-center">
        {estado.etapa === 'verificando' && (
          <div role="status">
            <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-700">Confirmando a alteração do e-mail...</p>
          </div>
        )}

        {estado.etapa === 'parcial' && (
          <div role="status">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-xl font-black text-gray-900 mb-2">Falta só mais uma confirmação</h1>
            <p className="text-gray-600 text-sm">
              Esta confirmação foi registrada. Para concluir, abra o link enviado ao <strong>outro</strong> e-mail (o atual ou o novo).
              Até lá, continue entrando com o e-mail atual.
            </p>
            <Link href="/login" className={`${classeBotaoPrimario} mt-6 w-full`}>
              Ir para o login
            </Link>
          </div>
        )}

        {estado.etapa === 'concluido' && (
          <div role="status">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-xl font-black text-gray-900 mb-2">E-mail alterado com sucesso</h1>
            <p className="text-gray-600 text-sm">
              A partir de agora, entre com <strong className="break-all">{estado.email}</strong>.
            </p>
            <Link href={estado.destino} className={`${classeBotaoPrimario} mt-6 w-full`}>
              Ir para minha conta
            </Link>
          </div>
        )}

        {estado.etapa === 'invalido' && (
          <div role="alert">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-xl font-black text-gray-900 mb-2">Link inválido ou expirado</h1>
            <p className="text-gray-600 text-sm">
              Este link já foi usado, expirou (vale por 1 hora) ou não é válido. Seu e-mail não foi alterado. Entre na sua conta e
              solicite a alteração novamente.
            </p>
            <Link href="/login" className={`${classeBotaoPrimario} mt-6 w-full`}>
              Ir para o login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
