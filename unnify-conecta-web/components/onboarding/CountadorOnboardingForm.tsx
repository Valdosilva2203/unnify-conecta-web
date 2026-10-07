'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Phone, MapPin, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { normalizeCNPJ, validateCNPJ, normalizePhone, validateEmail, UF_OPTIONS } from '@/lib/validation/accounting-office';

export function CountadorOnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    legalName: '',
    tradeName: '',
    cnpj: '',
    phone: '',
    commercialEmail: '',
    city: '',
    state: '',
  });

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateField(field);
  };

  const validateField = (field: string) => {
    const newErrors = { ...errors };

    switch (field) {
      case 'legalName':
        if (!formData.legalName.trim()) {
          newErrors.legalName = 'Razão social é obrigatória';
        } else {
          delete newErrors.legalName;
        }
        break;
      case 'cnpj':
        if (!formData.cnpj.trim()) {
          newErrors.cnpj = 'CNPJ é obrigatório';
        } else if (!validateCNPJ(formData.cnpj)) {
          newErrors.cnpj = 'CNPJ inválido';
        } else {
          delete newErrors.cnpj;
        }
        break;
      case 'phone':
        if (!formData.phone.trim()) {
          newErrors.phone = 'Telefone é obrigatório';
        } else if (formData.phone.replace(/\D/g, '').length < 10) {
          newErrors.phone = 'Telefone inválido';
        } else {
          delete newErrors.phone;
        }
        break;
      case 'commercialEmail':
        if (!formData.commercialEmail.trim()) {
          newErrors.commercialEmail = 'E-mail comercial é obrigatório';
        } else if (!validateEmail(formData.commercialEmail)) {
          newErrors.commercialEmail = 'E-mail inválido';
        } else {
          delete newErrors.commercialEmail;
        }
        break;
      case 'city':
        if (!formData.city.trim()) {
          newErrors.city = 'Cidade é obrigatória';
        } else {
          delete newErrors.city;
        }
        break;
      case 'state':
        if (!formData.state) {
          newErrors.state = 'Estado é obrigatório';
        } else {
          delete newErrors.state;
        }
        break;
    }

    setErrors(newErrors);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.legalName.trim()) newErrors.legalName = 'Razão social é obrigatória';
    if (!formData.cnpj.trim()) newErrors.cnpj = 'CNPJ é obrigatório';
    else if (!validateCNPJ(formData.cnpj)) newErrors.cnpj = 'CNPJ inválido';
    if (!formData.phone.trim()) newErrors.phone = 'Telefone é obrigatório';
    else if (formData.phone.replace(/\D/g, '').length < 10) newErrors.phone = 'Telefone inválido';
    if (!formData.commercialEmail.trim()) newErrors.commercialEmail = 'E-mail comercial é obrigatório';
    else if (!validateEmail(formData.commercialEmail)) newErrors.commercialEmail = 'E-mail inválido';
    if (!formData.city.trim()) newErrors.city = 'Cidade é obrigatória';
    if (!formData.state) newErrors.state = 'Estado é obrigatório';

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

      const { data, error } = await supabase.rpc('create_accounting_office_with_owner_membership', {
        p_legal_name: formData.legalName,
        p_trade_name: formData.tradeName || null,
        p_cnpj: normalizeCNPJ(formData.cnpj),
        p_phone: normalizePhone(formData.phone),
        p_commercial_email: formData.commercialEmail,
        p_city: formData.city,
        p_state: formData.state,
      });

      if (error) {
        setErrors({ submit: error.message || 'Erro ao criar escritório. Tente novamente.' });
        setLoading(false);
        return;
      }

      if (data && data[0] && data[0].success) {
        router.push('/onboarding/conclusao');
      } else if (data && data[0]) {
        setErrors({ submit: data[0].message || 'Erro desconhecido' });
        setLoading(false);
      }
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Erro ao criar escritório' });
      setLoading(false);
    }
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 14) value = value.slice(0, 14);
    if (value.length > 8) {
      value = value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    } else if (value.length > 5) {
      value = value.replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2.$3');
    } else if (value.length > 2) {
      value = value.replace(/(\d{2})(\d{3})/, '$1.$2');
    }
    setFormData({ ...formData, cnpj: value });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    if (value.length > 6) {
      value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (value.length > 2) {
      value = value.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    }
    setFormData({ ...formData, phone: value });
  };

  const isFormValid =
    formData.legalName.trim() &&
    validateCNPJ(formData.cnpj) &&
    formData.phone.replace(/\D/g, '').length >= 10 &&
    validateEmail(formData.commercialEmail) &&
    formData.city.trim() &&
    formData.state;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="bg-white rounded-2xl p-8 md:p-10 shadow-sm border border-gray-200 space-y-6">
        {/* 2-Column Grid Desktop / 1-Column Mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Legal Name */}
          <div className="md:col-span-2 md:col-span-1">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Nome do escritório / Razão social *
            </label>
            <div className="relative">
              <Building2 className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={formData.legalName}
                onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                onBlur={() => handleBlur('legalName')}
                placeholder="Ex.: Oliveira Contabilidade LTDA"
                className="w-full pl-13 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
            </div>
            {touched.legalName && errors.legalName && (
              <p className="text-xs text-red-600 mt-1">{errors.legalName}</p>
            )}
          </div>

          {/* Trade Name */}
          <div className="md:col-span-2 md:col-span-1">
            <label className="block text-sm font-medium text-gray-900 mb-2">Nome fantasia</label>
            <div className="relative">
              <Building2 className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={formData.tradeName}
                onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                placeholder="Ex.: Oliveira Contabilidade"
                className="w-full pl-13 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
            </div>
          </div>

          {/* CNPJ */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">CNPJ *</label>
            <div className="relative">
              <FileText className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={formData.cnpj}
                onChange={handleCNPJChange}
                onBlur={() => handleBlur('cnpj')}
                placeholder="00.000.000/0000-00"
                className="w-full pl-13 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
            </div>
            {touched.cnpj && errors.cnpj && (
              <p className="text-xs text-red-600 mt-1">{errors.cnpj}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Telefone / WhatsApp *
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                value={formData.phone}
                onChange={handlePhoneChange}
                onBlur={() => handleBlur('phone')}
                placeholder="(00) 00000-0000"
                className="w-full pl-13 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
            </div>
            {touched.phone && errors.phone && (
              <p className="text-xs text-red-600 mt-1">{errors.phone}</p>
            )}
          </div>

          {/* Commercial Email - Span 2 columns */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-2">E-mail comercial *</label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={formData.commercialEmail}
                onChange={(e) => setFormData({ ...formData, commercialEmail: e.target.value })}
                onBlur={() => handleBlur('commercialEmail')}
                placeholder="contato@seudominio.com.br"
                className="w-full pl-13 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
            </div>
            {touched.commercialEmail && errors.commercialEmail && (
              <p className="text-xs text-red-600 mt-1">{errors.commercialEmail}</p>
            )}
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Cidade *</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                onBlur={() => handleBlur('city')}
                placeholder="Ex.: Augustinópolis"
                className="w-full pl-13 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
              />
            </div>
            {touched.city && errors.city && (
              <p className="text-xs text-red-600 mt-1">{errors.city}</p>
            )}
          </div>

          {/* State */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Estado *</label>
            <select
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              onBlur={() => handleBlur('state')}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent bg-white"
            >
              <option value="">Selecione o estado</option>
              {UF_OPTIONS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
            {touched.state && errors.state && (
              <p className="text-xs text-red-600 mt-1">{errors.state}</p>
            )}
          </div>
        </div>

        {/* Submit Error */}
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{errors.submit}</p>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-4 justify-between mt-8 flex-col md:flex-row">
        <Button
          type="button"
          onClick={() => window.history.back()}
          className="bg-white border border-gray-300 text-gray-900 hover:bg-gray-50 rounded-lg font-semibold px-8 py-3 transition-all order-2 md:order-1"
        >
          ← Voltar
        </Button>
        <Button
          type="submit"
          disabled={!isFormValid || loading}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold px-8 py-3 transition-all flex items-center justify-center gap-2 order-1 md:order-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Configurando...
            </>
          ) : (
            <>Continuar →</>
          )}
        </Button>
      </div>
    </form>
  );
}
