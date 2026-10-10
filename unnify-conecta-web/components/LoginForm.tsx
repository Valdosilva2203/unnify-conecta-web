'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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

    if (!password) {
      newErrors.password = 'Senha é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrors({ submit: error.message });
        setLoading(false);
        return;
      }

      router.push('/app');
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Erro ao fazer login' });
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 md:p-6 bg-white md:bg-gray-50 min-h-screen">
      {/* Top - Header with Signup Link */}
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
          href="/signup"
          className="text-xs md:text-sm text-gray-700 hover:text-black transition-colors flex items-center gap-2 ml-auto"
        >
          Ainda não possui uma conta?
          <Button className="bg-white border border-gray-300 text-gray-900 hover:bg-gray-50 px-4 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-medium h-auto">
            Criar conta
          </Button>
        </Link>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-2xl p-9 md:p-10 shadow-lg border border-gray-200 w-full max-w-xl">
        {/* Header */}
        <p className="text-xs font-semibold text-orange-600 mb-2 tracking-wide uppercase">
          Acesse sua conta
        </p>
        <h2 className="text-4xl font-black text-black mb-3 leading-tight">Bem-vindo de volta</h2>
        <p className="text-sm md:text-base text-gray-600 mb-6 leading-snug">
          Entre com seus dados para continuar.
        </p>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4 md:space-y-5">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              E-mail
            </label>
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

          {/* Password with Forgot Link */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-900">
                Senha
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-orange-600 hover:text-orange-700 font-semibold"
              >
                Esqueceu sua senha?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => handleBlur('password')}
                placeholder="Sua senha"
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
                Entrando...
              </>
            ) : (
              <>
                Entrar
                <span>→</span>
              </>
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-white text-gray-600 font-medium">ou</span>
          </div>
        </div>

        {/* Google Button */}
        <Button className="w-full bg-white border-2 border-gray-300 text-gray-900 hover:bg-gray-50 rounded-lg text-base font-semibold py-3 flex items-center justify-center gap-3 h-auto transition-all">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuar com o Google
        </Button>
      </div>
    </div>
  );
}
