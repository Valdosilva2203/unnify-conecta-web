import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Cadastro | Unnify Conecta',
};

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <div className="flex items-center gap-1 mb-8">
            <span className="text-2xl font-bold text-black">Unnify</span>
            <span className="text-sm text-gray-600 font-medium">Conecta</span>
          </div>
          <h1 className="text-3xl font-black text-black mb-2">Comece grátis</h1>
          <p className="text-gray-600">Crie sua conta em poucos minutos</p>
        </div>

        {/* Placeholder Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Nome completo
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600"
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Email
            </label>
            <input
              type="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Senha
            </label>
            <input
              type="password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Tipo de usuário
            </label>
            <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600">
              <option value="company">Empresa</option>
              <option value="accountant">Contador</option>
            </select>
          </div>

          <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold py-2">
            Criar conta
          </Button>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          Já tem conta?{' '}
          <Link href="/login" className="text-orange-600 font-semibold hover:text-orange-700">
            Faça login
          </Link>
        </p>

        <p className="text-center text-xs text-gray-500 mt-8">
          Ao criar sua conta, você concorda com nossos{' '}
          <Link href="#" className="text-orange-600 hover:text-orange-700">
            Termos de Serviço
          </Link>{' '}
          e{' '}
          <Link href="#" className="text-orange-600 hover:text-orange-700">
            Política de Privacidade
          </Link>
        </p>
      </div>
    </div>
  );
}
