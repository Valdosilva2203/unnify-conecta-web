'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Suspense } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { StepsIndicator } from '@/components/onboarding/StepsIndicator';
import { Button } from '@/components/ui/button';
import { SearchIcon } from 'lucide-react';

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
].sort();

function validateCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return false;

  const digits = cleaned.split('').map(Number);

  // Primeiro dígito verificador (posição 12)
  // Sequência oficial: 5 4 3 2 9 8 7 6 5 4 3 2
  let sum = 0;
  const mult1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * mult1[i];
  }
  let firstDigit = 11 - (sum % 11);
  firstDigit = firstDigit > 9 ? 0 : firstDigit;

  // Segundo dígito verificador (posição 13)
  // Sequência oficial: 6 5 4 3 2 9 8 7 6 5 4 3 2 (inclui primeiro verificador)
  sum = 0;
  const mult2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) {
    sum += digits[i] * mult2[i];
  }
  let secondDigit = 11 - (sum % 11);
  secondDigit = secondDigit > 9 ? 0 : secondDigit;

  return digits[12] === firstDigit && digits[13] === secondDigit;
}

function maskCNPJ(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  return cleaned
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskPhone(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 10) {
    return cleaned
      .slice(0, 10)
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cleaned
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function OnboardingEmpresaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tipoEmpresa = searchParams.get('tipo') || 'comum';
  const processedRef = useRef(false);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    cnpj: '',
    legalName: '',
    tradeName: '',
    phone: '',
    email: '',
    city: '',
    state: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const [cnpjLookupMessage, setCNPJLookupMessage] = useState('');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

        if (authError || !authUser) {
          router.push('/login');
          return;
        }

        setUser({ id: authUser.id });
      } catch (err) {
        console.error('Auth check failed:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.cnpj.trim()) {
      newErrors.cnpj = 'CNPJ é obrigatório';
    } else if (!validateCNPJ(formData.cnpj)) {
      newErrors.cnpj = 'CNPJ inválido';
    }

    if (!formData.legalName.trim()) {
      newErrors.legalName = 'Razão social é obrigatória';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Telefone é obrigatório';
    } else if (formData.phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Telefone inválido';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'E-mail inválido';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'Cidade é obrigatória';
    }

    if (!formData.state) {
      newErrors.state = 'UF é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleConsultarCNPJ = async () => {
    if (!validateCNPJ(formData.cnpj)) {
      setErrors({ cnpj: 'CNPJ inválido' });
      return;
    }

    setLoadingCNPJ(true);
    setCNPJLookupMessage('');
    setError('');

    try {
      const cleanCNPJ = formData.cnpj.replace(/\D/g, '');
      const response = await fetch('/api/companies/lookup-cnpj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: cleanCNPJ })
      });

      const data = await response.json();

      if (!data.success) {
        if (data.canFillManually) {
          setCNPJLookupMessage('API indisponível. Preencha os dados manualmente.');
        } else {
          setError(data.error || 'Erro ao consultar CNPJ');
        }
        setLoadingCNPJ(false);
        return;
      }

      // Auto-fill form
      setFormData((prev) => ({
        ...prev,
        legalName: data.data?.legal_name || prev.legalName,
        tradeName: data.data?.trade_name || prev.tradeName,
        city: data.data?.city || prev.city,
        state: data.data?.state || prev.state,
        phone: data.data?.phone ? maskPhone(data.data.phone) : prev.phone,
        email: data.data?.email || prev.email
      }));
      setErrors({});

      setCNPJLookupMessage('✓ Dados carregados com sucesso');
    } catch (err) {
      setCNPJLookupMessage('Erro ao consultar CNPJ. Tente novamente.');
    } finally {
      setLoadingCNPJ(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    let processedValue = value;

    if (field === 'cnpj') {
      processedValue = maskCNPJ(value);
    } else if (field === 'phone') {
      processedValue = maskPhone(value);
    }

    setFormData((prev) => ({ ...prev, [field]: processedValue }));

    if (touched[field]) {
      const newErrors = { ...errors };
      delete newErrors[field];
      setErrors(newErrors);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;
    if (!user) return;

    setSubmitting(true);
    setError('');

    try {
      const supabase = createClient();

      const { data, error: rpcError } = await supabase.rpc(
        'criar_empresa',
        {
          p_cnpj: formData.cnpj,
          p_razao_social: formData.legalName,
          p_telefone: formData.phone.replace(/\D/g, ''),
          p_email_comercial: formData.email,
          p_cidade: formData.city,
          p_estado: formData.state,
          p_tipo_empresa: tipoEmpresa,
          p_nome_comercial: formData.tradeName || null,
        }
      );

      console.log('RPC Response - Data:', data, 'Error:', rpcError);

      if (rpcError) {
        console.error('RPC Error Object:', JSON.stringify(rpcError));
        const message = rpcError.message || JSON.stringify(rpcError) || 'Erro ao criar empresa';
        setError(`Erro RPC: ${message}`);
        setSubmitting(false);
        return;
      }

      const result = Array.isArray(data) ? data[0] : data;
      console.log('Company created:', result);

      if (!result) {
        setError('Erro ao criar empresa: sem resposta do servidor');
        setSubmitting(false);
        return;
      }

      if (!result.sucesso) {
        const errorMsg = result.mensagem || 'Erro desconhecido';
        if (errorMsg.includes('CNPJ')) {
          setError('CNPJ já cadastrado no sistema');
        } else if (errorMsg.includes('autenticado')) {
          setError('Sessão expirada. Por favor, faça login novamente');
        } else {
          setError(errorMsg);
        }
        setSubmitting(false);
        return;
      }

      if (result.id) {
        const tipoUsuario = tipoEmpresa === 'escritorio_contabil' ? 'contador' : 'empresa';

        // Salvar tipo_usuario imediatamente após criar empresa
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          if (token) {
            const updateResponse = await fetch('/api/auth/update-tipo-usuario', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ tipo_usuario: tipoUsuario }),
            });

            const updateData = await updateResponse.json();

            if (updateResponse.ok) {
              console.log('✅ tipo_usuario salvo com sucesso:', updateData);
            } else {
              console.error('❌ Erro ao salvar tipo_usuario:', updateData);
            }
          }
        } catch (error) {
          console.error('Erro ao atualizar tipo_usuario:', error);
        }

        // Redirecionar para conclusão
        router.push('/onboarding/conclusao');
      } else {
        console.error('Invalid RPC response:', result);
        setError('Resposta inesperada do servidor');
        setSubmitting(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro inesperado';
      console.error('Form submission error:', err);
      setError(`Erro ao criar empresa: ${errorMessage}`);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const steps = [
    { number: 1, title: 'Etapa 1', subtitle: 'Tipo de perfil', status: 'completed' as const },
    { number: 2, title: 'Etapa 2', subtitle: 'Dados da empresa', status: 'active' as const },
    { number: 3, title: 'Etapa 3', subtitle: 'Conclusão', status: 'pending' as const },
  ];

  return (
    <div className="min-h-screen bg-white px-4 sm:px-6 py-6 md:py-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-4xl mx-auto">
        {/* Steps Indicator */}
        <StepsIndicator steps={steps} />

        {/* Form */}
        <div className="mb-12">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-8 md:p-10 shadow-lg">
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-black mb-2">
                Dados da empresa
              </h1>
              <p className="text-gray-600">
                Informe o CNPJ para consultar os dados ou preencha manualmente
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div role="alert" className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5 sm:space-y-6">
              {/* CNPJ */}
              <div>
                <label htmlFor="emp-cnpj" className="block text-sm font-semibold text-gray-900 mb-2">
                  CNPJ *
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input id="emp-cnpj" autoComplete="off" inputMode="numeric"
                    aria-invalid={Boolean(touched.cnpj && errors.cnpj)}
                    type="text"
                    value={formData.cnpj}
                    onChange={(e) => handleChange('cnpj', e.target.value)}
                    onBlur={() => handleBlur('cnpj')}
                    placeholder="XX.XXX.XXX/XXXX-XX"
                    className="w-full min-w-0 sm:flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={handleConsultarCNPJ}
                    disabled={loadingCNPJ || !formData.cnpj || !!errors.cnpj}
                    className="min-h-12 px-6 bg-orange-100 text-orange-600 hover:bg-orange-200 disabled:bg-gray-100 disabled:text-gray-400 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  >
                    {loadingCNPJ ? (
                      <>
                        <span className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                        Consultando...
                      </>
                    ) : (
                      <>
                        <SearchIcon className="w-4 h-4" />
                        Consultar
                      </>
                    )}
                  </button>
                </div>
                {touched.cnpj && errors.cnpj && (
                  <p id="emp-cnpj-erro" role="alert" className="text-xs text-red-600 mt-1">{errors.cnpj}</p>
                )}
                {cnpjLookupMessage && (
                  <p className={`text-xs mt-1 ${cnpjLookupMessage.includes('✓') ? 'text-green-600' : 'text-yellow-600'}`}>
                    {cnpjLookupMessage}
                  </p>
                )}
              </div>

              {/* Razão Social */}
              <div>
                <label htmlFor="emp-legalName" className="block text-sm font-semibold text-gray-900 mb-2">
                  Razão social *
                </label>
                <input id="emp-legalName" autoComplete="organization"
                    aria-invalid={Boolean(touched.legalName && errors.legalName)}
                  type="text"
                  value={formData.legalName}
                  onChange={(e) => handleChange('legalName', e.target.value)}
                  onBlur={() => handleBlur('legalName')}
                  placeholder="Nome completo da empresa"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900"
                />
                {touched.legalName && errors.legalName && (
                  <p id="emp-legalName-erro" role="alert" className="text-xs text-red-600 mt-1">{errors.legalName}</p>
                )}
              </div>

              {/* Nome Fantasia */}
              <div>
                <label htmlFor="emp-tradeName" className="block text-sm font-semibold text-gray-900 mb-2">
                  Nome fantasia
                </label>
                <input id="emp-tradeName" autoComplete="off"
                    aria-invalid={Boolean(touched.tradeName && errors.tradeName)}
                  type="text"
                  value={formData.tradeName}
                  onChange={(e) => handleChange('tradeName', e.target.value)}
                  placeholder="Nome comercial (opcional)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900"
                />
              </div>

              {/* Telefone */}
              <div>
                <label htmlFor="emp-phone" className="block text-sm font-semibold text-gray-900 mb-2">
                  Telefone/WhatsApp *
                </label>
                <input id="emp-phone" autoComplete="tel" inputMode="tel"
                    aria-invalid={Boolean(touched.phone && errors.phone)}
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  onBlur={() => handleBlur('phone')}
                  placeholder="(XX) XXXXX-XXXX"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900"
                />
                {touched.phone && errors.phone && (
                  <p id="emp-phone-erro" role="alert" className="text-xs text-red-600 mt-1">{errors.phone}</p>
                )}
              </div>

              {/* E-mail */}
              <div>
                <label htmlFor="emp-email" className="block text-sm font-semibold text-gray-900 mb-2">
                  E-mail comercial *
                </label>
                <input id="emp-email" autoComplete="email" inputMode="email" autoCapitalize="none"
                    aria-invalid={Boolean(touched.email && errors.email)}
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  placeholder="email@empresa.com.br"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900"
                />
                {touched.email && errors.email && (
                  <p id="emp-email-erro" role="alert" className="text-xs text-red-600 mt-1">{errors.email}</p>
                )}
              </div>

              {/* Cidade e UF */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label htmlFor="emp-city" className="block text-sm font-semibold text-gray-900 mb-2">
                    Cidade *
                  </label>
                  <input id="emp-city" autoComplete="address-level2"
                    aria-invalid={Boolean(touched.city && errors.city)}
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    onBlur={() => handleBlur('city')}
                    placeholder="Nome da cidade"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900"
                  />
                  {touched.city && errors.city && (
                    <p id="emp-city-erro" role="alert" className="text-xs text-red-600 mt-1">{errors.city}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="emp-state" className="block text-sm font-semibold text-gray-900 mb-2">
                    UF *
                  </label>
                  <select id="emp-state" autoComplete="address-level1"
                    aria-invalid={Boolean(touched.state && errors.state)}
                    value={formData.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                    onBlur={() => handleBlur('state')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900"
                  >
                    <option value="">Selecione</option>
                    {BRAZILIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                  {touched.state && errors.state && (
                    <p id="emp-state-erro" role="alert" className="text-xs text-red-600 mt-1">{errors.state}</p>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 sm:gap-4 justify-center md:justify-end pt-6 sm:pt-8 border-t border-gray-200">
                <Button
                  type="button"
                  onClick={() => router.push('/onboarding')}
                  className="bg-white border-2 border-gray-300 text-gray-900 hover:bg-gray-50 rounded-lg font-semibold px-4 sm:px-8 min-h-12 transition-all flex-1 md:flex-initial"
                >
                  ← Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold px-4 sm:px-8 min-h-12 transition-all flex-1 md:flex-initial flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      Continuar
                      <span>→</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingEmpresaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-gray-600">Carregando...</p></div></div>}>
      <OnboardingEmpresaContent />
    </Suspense>
  );
}
