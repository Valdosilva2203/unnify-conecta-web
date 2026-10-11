import type { NextRequest } from 'next/server';
import { usuarioDaRequisicao } from '@/lib/supabase/usuario-servidor';
import { excedeuLimite } from '@/lib/limite-taxa';

interface BrasilAPIResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  municipio: string;
  uf: string;
  ddd_telefone_1: string | null;
  email: string | null;
}

interface LookupResponse {
  success: boolean;
  data?: {
    legal_name: string;
    trade_name: string | null;
    city: string;
    state: string;
    phone: string | null;
    email: string | null;
  };
  error?: string;
  canFillManually?: boolean;
}

const BRASIL_API_TIMEOUT = 5000; // 5 seconds
const BRASIL_API_URL = 'https://brasilapi.com.br/api/cnpj/v1';

class CNPJNotFoundError extends Error {}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .replace(/\s(D[aeo]s?|E)\s/g, (m) => m.toLowerCase());
}

async function fetchFromBrasilAPI(cnpj: string): Promise<BrasilAPIResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRASIL_API_TIMEOUT);

  try {
    const response = await fetch(`${BRASIL_API_URL}/${cnpj}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Unnify-Conecta/1.0'
      },
      signal: controller.signal,
      // @ts-ignore - NextJS specific option
      cache: 'no-store'
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      throw new CNPJNotFoundError();
    }

    if (!response.ok) {
      throw new Error(`BrasilAPI returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout na consulta de CNPJ');
    }
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) {
      return Response.json({ success: false, error: 'Faça login para consultar o CNPJ.' } as LookupResponse, {
        status: 401,
      });
    }
    if (excedeuLimite(`cnpj:${usuario.id}`, 20, 60 * 1000)) {
      return Response.json(
        { success: false, error: 'Muitas consultas seguidas. Aguarde um minuto.' } as LookupResponse,
        { status: 429 }
      );
    }

    // 1. Parse request
    const body = await request.json();
    const { cnpj } = body;

    if (!cnpj || typeof cnpj !== 'string') {
      return Response.json(
        { success: false, error: 'CNPJ inválido' } as LookupResponse,
        { status: 400 }
      );
    }

    // 2. Validate CNPJ format (without mask)
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14) {
      return Response.json(
        { success: false, error: 'CNPJ deve ter 14 dígitos' } as LookupResponse,
        { status: 400 }
      );
    }

    // 3. Consult BrasilAPI (public endpoint, no auth needed)
    const apiData = await fetchFromBrasilAPI(cleanCNPJ);

    // 4. Format response
    const response: LookupResponse = {
      success: true,
      data: {
        legal_name: apiData.razao_social || '',
        trade_name: apiData.nome_fantasia || null,
        city: apiData.municipio ? titleCase(apiData.municipio) : '',
        state: apiData.uf || '',
        phone: apiData.ddd_telefone_1?.replace(/\D/g, '') || null,
        email: apiData.email?.toLowerCase() || null
      }
    };

    return Response.json(response);
  } catch (error) {
    if (error instanceof CNPJNotFoundError) {
      return Response.json(
        { success: false, error: 'CNPJ não encontrado na Receita Federal.' } as LookupResponse,
        { status: 404 }
      );
    }

    console.error('CNPJ lookup error:', error);

    // Allow manual fill if API is unavailable
    const response: LookupResponse = {
      success: false,
      error: 'API indisponível. Preencha os dados manualmente.',
      canFillManually: true
    };

    return Response.json(response, { status: 503 });
  }
}
