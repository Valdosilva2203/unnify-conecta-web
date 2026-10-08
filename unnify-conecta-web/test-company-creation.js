#!/usr/bin/env node

/**
 * Teste: Pode uma empresa ser cadastrada?
 * Simula o fluxo do onboarding
 */

const https = require('https');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const ANON_KEY = 'sb_publishable_7NLA0a6Ckf6z33AhW_IRIw_RX6DXtpW';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('\n🧪 TESTE: Função create_company() está acessível?\n');

  try {
    // Tentar chamar a função RPC create_company
    console.log('📌 Tentando chamar RPC create_company()...');

    const res = await makeRequest(
      'POST',
      '/rest/v1/rpc/create_company',
      {
        p_cnpj: '11.222.333/0001-81',
        p_legal_name: 'Test Company LTDA',
        p_trade_name: 'Test Company',
        p_phone: '(11) 98765-4321',
        p_commercial_email: 'test@company.com',
        p_city: 'São Paulo',
        p_state: 'SP',
      }
    );

    console.log(`Status: ${res.status}`);
    console.log('Resposta:', res.data);

    if (res.status === 200 || res.status === 201) {
      console.log('\n✅ RPC está funcionando!');
      console.log('   Possíveis problemas:');
      console.log('   1. Usuário não está autenticado no onboarding');
      console.log('   2. E-mail já cadastrado');
      console.log('   3. CNPJ já existe');
    } else if (res.status === 404) {
      console.log('\n❌ RPC não encontrada!');
      console.log('   Próximas etapas:');
      console.log('   1. Verificar se migration foi aplicada');
      console.log('   2. Verificar nome da função');
    } else {
      console.log('\n⚠️ Erro na chamada RPC');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

test();
