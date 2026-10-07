'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Building2, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AccountingOfficeData {
  trade_name: string | null;
  legal_name: string;
  cnpj: string;
  city: string;
  state: string;
}

export function SuccessCard() {
  const [office, setOffice] = useState<AccountingOfficeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOfficeData = async () => {
      try {
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data: membership, error: membershipError } = await supabase
          .from('user_accounting_office_memberships')
          .select('accounting_office_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (membershipError || !membership) {
          throw new Error('Membership não encontrada');
        }

        const { data: officeData, error: officeError } = await supabase
          .from('accounting_offices')
          .select('trade_name, legal_name, cnpj, city, state')
          .eq('id', membership.accounting_office_id)
          .single();

        if (officeError || !officeData) {
          throw new Error('Escritório não encontrado');
        }

        setOffice(officeData);
      } catch (err) {
        console.error('Erro ao carregar dados do escritório:', err);
        setError('Não foi possível carregar as informações do seu escritório.');
      } finally {
        setLoading(false);
      }
    };

    loadOfficeData();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 md:p-10 shadow-sm border border-gray-200 text-center">
        <div className="w-12 h-12 border-2 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Carregando dados do seu escritório...</p>
      </div>
    );
  }

  if (error || !office) {
    return (
      <div className="bg-red-50 rounded-2xl p-8 md:p-10 border border-red-200">
        <p className="text-red-700 text-center">{error || 'Erro ao carregar dados'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Main Success Card */}
      <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl p-8 md:p-10 shadow-sm border border-orange-200 text-center">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 bg-orange-100 rounded-full animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle2 className="w-16 h-16 text-orange-600" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-black text-black mb-3">
          Seu escritório está pronto!
        </h1>

        {/* Subtitle */}
        <p className="text-gray-600 text-base md:text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
          Seu escritório foi configurado com sucesso no Unnify Conecta. Agora você já pode começar
          a organizar seus clientes e trabalhar conectado às empresas.
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-4">
        {[
          { title: 'Escritório cadastrado', desc: 'As informações do seu escritório foram registradas com sucesso.' },
          { title: 'Sua conta foi definida como proprietária', desc: 'Você tem acesso completo ao ambiente do escritório.' },
          { title: 'Ambiente configurado', desc: 'Seu ambiente está pronto para uso no Unnify Conecta.' },
        ].map((item, idx) => (
          <div key={idx} className="flex gap-4 items-start bg-white rounded-lg p-4 border border-gray-200 hover:border-green-300 transition-colors">
            <div className="flex-shrink-0 mt-1">
              <CheckCircle2 className="w-5 h-5 text-green-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{item.title}</p>
              <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Office Card */}
      <div className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
        <div className="flex gap-4">
          {/* Icon */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center w-14 h-14 bg-orange-100 rounded-lg">
              <Building2 className="w-7 h-7 text-orange-600" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <p className="text-lg font-bold text-gray-900">
              {office.trade_name || office.legal_name}
            </p>
            <p className="text-sm text-gray-600 mt-1">CNPJ {office.cnpj}</p>
            <div className="flex items-center gap-1 text-sm text-gray-600 mt-2">
              <MapPin className="w-4 h-4" />
              <span>
                {office.city} - {office.state}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Note */}
      <div className="flex gap-3 items-center bg-blue-50 rounded-lg p-4 border border-blue-200">
        <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
        <p className="text-sm text-blue-800">
          Seus dados estão protegidos e seguem as boas práticas de segurança.
        </p>
      </div>
    </div>
  );
}
