'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Lock, Eye, EyeOff, CheckCircle, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const type = searchParams.get('type');
        const tokenHash = searchParams.get('token_hash');

        // Verify the recovery token with Supabase
        if (type === 'recovery' && tokenHash) {
          const supabase = createClient();

          // Try to verify the token by attempting to get the user
          // If the token is invalid or expired, this will fail
          const { data: { user }, error } = await supabase.auth.getUser();

          // Token is valid if user exists (no error) OR if the error is NOT about invalid/expired token
          if (user || !error?.message.includes('invalid')) {
            setIsValidToken(true);
          } else {
            setTokenError('Link de recuperação inválido ou expirado. Solicite um novo link.');
            setIsValidToken(false);
          }
        } else {
          setTokenError('Link de recuperação inválido.');
          setIsValidToken(false);
        }
      } catch (error) {
        setTokenError('Erro ao validar o link de recuperação.');
        setIsValidToken(false);
      }
    };

    validateToken();
  }, [searchParams]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (password.length < 8) {
      newErrors.password = 'Mínimo de 8 caracteres';
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = 'Deve conter letras minúsculas';
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = 'Deve conter letras maiúsculas';
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = 'Deve conter números';
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      newErrors.password = 'Deve conter um símbolo especial';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Confirmação da senha é obrigatória';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'As senhas não conferem';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErrors({ submit: error.message });
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Erro ao atualizar senha',
      });
      setLoading(false);
    }
  };

  // Success Screen
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
            Sucesso!
          </p>
          <h2 className="text-4xl font-black text-black mb-3 leading-tight">
            Senha atualizada com sucesso!
          </h2>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          {/* Message */}
          <p className="text-gray-600 mb-6 text-center">
            Sua senha foi alterada com sucesso. Agora você já pode fazer login com sua nova
            senha.
          </p>

          {/* Button */}
          <Link href="/login" className="block">
            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-base font-bold py-3.5 flex items-center justify-center gap-2 h-auto transition-all">
              Ir para o login
              <span>→</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Invalid Token Screen
  if (!isValidToken) {
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

        {/* Error Card */}
        <div className="bg-white rounded-2xl p-9 md:p-10 shadow-lg border border-gray-200 w-full max-w-xl">
          {/* Header */}
          <p className="text-xs font-semibold text-red-600 mb-2 tracking-wide uppercase">
            Link inválido
          </p>
          <h2 className="text-4xl font-black text-black mb-3 leading-tight">
            Oops! Algo deu errado
          </h2>

          {/* Message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-900">{tokenError}</p>
          </div>

          {/* Button */}
          <Link href="/forgot-password" className="block">
            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-base font-bold py-3.5 flex items-center justify-center gap-2 h-auto transition-all">
              Solicitar novo link
            </Button>
          </Link>

          <Link href="/login" className="block mt-3">
            <Button className="w-full bg-white border-2 border-gray-300 text-gray-900 hover:bg-gray-50 rounded-lg text-base font-bold py-3.5 flex items-center justify-center gap-2 h-auto transition-all">
              <ArrowLeft className="w-4 h-4" />
              Voltar para login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Reset Form
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
          Definir nova senha
        </p>
        <h2 className="text-4xl font-black text-black mb-3 leading-tight">
          Crie uma nova senha
        </h2>
        <p className="text-sm md:text-base text-gray-600 mb-6 leading-snug">
          Digite sua nova senha para acessar sua conta.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Nova senha
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => handleBlur('password')}
                placeholder="Crie uma senha segura"
                className="w-full pl-13 pr-12 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {touched.password && errors.password && (
              <p className="text-xs text-red-600 mt-1">{errors.password}</p>
            )}

            {/* Password Requirements */}
            {password && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      password.length >= 8 ? 'bg-green-100' : 'bg-gray-100'
                    }`}
                  >
                    {password.length >= 8 && (
                      <span className="text-xs text-green-600">✓</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">Mínimo de 8 caracteres</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      /[a-z]/.test(password) ? 'bg-green-100' : 'bg-gray-100'
                    }`}
                  >
                    {/[a-z]/.test(password) && (
                      <span className="text-xs text-green-600">✓</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">Letra minúscula</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      /[A-Z]/.test(password) ? 'bg-green-100' : 'bg-gray-100'
                    }`}
                  >
                    {/[A-Z]/.test(password) && (
                      <span className="text-xs text-green-600">✓</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">Letra maiúscula</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      /[0-9]/.test(password) ? 'bg-green-100' : 'bg-gray-100'
                    }`}
                  >
                    {/[0-9]/.test(password) && (
                      <span className="text-xs text-green-600">✓</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">Número</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      /[!@#$%^&*(),.?":{}|<>]/.test(password)
                        ? 'bg-green-100'
                        : 'bg-gray-100'
                    }`}
                  >
                    {/[!@#$%^&*(),.?":{}|<>]/.test(password) && (
                      <span className="text-xs text-green-600">✓</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">Símbolo (ex: ! @ # $ % )</span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Confirmar senha
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => handleBlur('confirmPassword')}
                placeholder="Confirme sua senha"
                className="w-full pl-13 pr-12 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {touched.confirmPassword && errors.confirmPassword && (
              <p className="text-xs text-red-600 mt-1">{errors.confirmPassword}</p>
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
                Atualizando...
              </>
            ) : (
              <>
                Atualizar senha
                <span>→</span>
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
