'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Mail, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'E-mail inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Prevent duplicate submissions while request is in flight
    if (loading) return;

    setLoading(true);
    setErrors({});

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      // If there's an error, show it to the user
      if (error) {
        // Map Supabase error messages to friendly Portuguese messages
        const errorLower = error.message.toLowerCase();
        let friendlyMessage = 'Erro ao enviar email de recuperação. Tente novamente em alguns minutos.';

        // Handle specific errors
        if (errorLower.includes('rate limit')) {
          friendlyMessage =
            'Muitas tentativas de recuperação. Aguarde alguns minutos antes de tentar novamente.';
        } else if (errorLower.includes('invalid email')) {
          friendlyMessage = 'E-mail inválido. Verifique e tente novamente.';
        } else if (errorLower.includes('user not found')) {
          friendlyMessage =
            'Se existir uma conta com este e-mail, você receberá instruções de recuperação.';
        }

        setErrors({ submit: friendlyMessage });
        setLoading(false);
        return;
      }

      // Only set submitted if the request was successful (no error)
      setSubmitted(true);
    } catch (err) {
      setErrors({
        submit: 'Erro ao conectar ao servidor. Verifique sua conexão e tente novamente.',
      });
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center p-4 md:p-6 bg-white md:bg-gray-50 min-h-screen">
        {/* Top - Header with Back Link */}
        <div className="w-full max-w-xl flex items-center justify-between mb-4 md:mb-6">
          {/* Logo - Mobile only */}
          <div className="flex md:hidden">
            <Image
              src="/brand/unnify-logo.png"
              alt="Unnify Conecta"
              width={200}
              height={67}
              priority
              className="h-7 w-auto"
            />
          </div>

          <Link
            href="/login"
            className="text-xs md:text-sm text-gray-700 hover:text-black transition-colors flex items-center gap-2 ml-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para o login
          </Link>
        </div>

        {/* Success Card */}
        <div className="bg-white rounded-2xl p-9 md:p-10 shadow-lg border border-gray-200 w-full max-w-xl">
          {/* Header */}
          <p className="text-xs font-semibold text-orange-600 mb-2 tracking-wide uppercase">
            E-mail enviado!
          </p>
          <h2 className="text-4xl font-black text-black mb-3 leading-tight">
            Verifique sua caixa de entrada
          </h2>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          {/* Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              Se existir uma conta com o e-mail <strong>{email}</strong>, você receberá um
              link para redefinir sua senha.
            </p>
          </div>

          {/* Instructions */}
          <div className="space-y-3 mb-6">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-sm font-bold text-orange-600">1</span>
              </div>
              <p className="text-sm text-gray-600">Verifique a pasta de spam ou lixo eletrônico</p>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-sm font-bold text-orange-600">2</span>
              </div>
              <p className="text-sm text-gray-600">Clique no link de recuperação de senha</p>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-sm font-bold text-orange-600">3</span>
              </div>
              <p className="text-sm text-gray-600">Crie uma nova senha e faça login</p>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <p className="text-xs text-gray-600">
              <strong>Link expira em 1 hora.</strong> Se não receber o e-mail, tente novamente
              ou entre em contato com o suporte.
            </p>
          </div>

          {/* Back Button */}
          <Link href="/login" className="block">
            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-base font-bold py-3.5 flex items-center justify-center gap-2 h-auto transition-all">
              Voltar para o login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 md:p-6 bg-white md:bg-gray-50 min-h-screen">
      {/* Top - Header with Back Link */}
      <div className="w-full max-w-xl flex items-center justify-between mb-4 md:mb-6">
        {/* Logo - Mobile only */}
        <div className="flex md:hidden">
          <Image
            src="/brand/unnify-logo.png"
            alt="Unnify Conecta"
            width={200}
            height={67}
            priority
            className="h-7 w-auto"
          />
        </div>

        <Link
          href="/login"
          className="text-xs md:text-sm text-gray-700 hover:text-black transition-colors flex items-center gap-2 ml-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para o login
        </Link>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-2xl p-9 md:p-10 shadow-lg border border-gray-200 w-full max-w-xl">
        {/* Header */}
        <p className="text-xs font-semibold text-orange-600 mb-2 tracking-wide uppercase">
          Recuperar sua senha
        </p>
        <h2 className="text-4xl font-black text-black mb-3 leading-tight">
          Esqueceu sua senha?
        </h2>
        <p className="text-sm md:text-base text-gray-600 mb-6 leading-snug">
          Informe seu e-mail e enviaremos um link para você redefinir sua senha.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur('email')}
                placeholder="seu@email.com"
                className="w-full pl-13 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
            </div>
            {touched.email && errors.email && (
              <p className="text-xs text-red-600 mt-1">{errors.email}</p>
            )}
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700">{errors.submit}</p>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-base font-bold py-3.5 flex items-center justify-center gap-2 h-auto disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                Enviar link de recuperação
                <span>→</span>
              </>
            )}
          </Button>
        </form>

        {/* Back Link */}
        <p className="text-center text-xs text-gray-600 mt-6">
          Lembrou sua senha?{' '}
          <Link href="/login" className="text-orange-600 hover:text-orange-700 font-semibold">
            Voltar para login
          </Link>
        </p>
      </div>
    </div>
  );
}
