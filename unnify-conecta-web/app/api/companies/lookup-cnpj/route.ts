interface BrasilAPIResponse {
  cnpj: string;
  name: string;
  trade_name: string | null;
  active: boolean;
  city: string;
  state: string;
  status: string;
  main_activity: string | null;
}

interface LookupResponse {
  success: boolean;
  data?: {
    legal_name: string;
    trade_name: string | null;
    city: string;
    state: string;
  };
  error?: string;
  canFillManually?: boolean;
}

const BRASIL_API_TIMEOUT = 5000; // 5 seconds
const BRASIL_API_URL = 'https://brasilapi.com.br/api/cnpj/v1';

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

export async function POST(request: Request): Promise<Response> {
  try {
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
        legal_name: apiData.name || '',
        trade_name: apiData.trade_name || null,
        city: apiData.city || '',
        state: apiData.state || ''
      }
    };

    return Response.json(response);
  } catch (error) {
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
