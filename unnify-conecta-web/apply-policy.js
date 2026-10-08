#!/usr/bin/env node

/**
 * Aplica a política de RLS para permitir admins verem todas as empresas
 */

const https = require('https');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const SERVICE_ROLE_KEY = 'sb_secret_1E21s8_BfCwLCbDH22d70_SoRjAaJW';

const SQL = `
CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    (SELECT global_role FROM public.profiles WHERE id = auth.uid()) IN ('admin_master', 'admin')
    OR created_by = auth.uid()
  );

COMMENT ON POLICY "Admins can view all companies" ON public.companies
IS 'Allows admin_master and admin roles to view all companies. Regular users can only view their own.';
`;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
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

async function apply() {
  console.log('\n📝 Aplicando política RLS no Supabase DEV...\n');

  try {
    console.log('🔐 Enviando SQL com SERVICE_ROLE_KEY...');

    // Usando RPC para executar SQL arbitrário via função
    const res = await makeRequest('POST', '/rest/v1/rpc/execute_sql', {
      sql: SQL,
    });

    console.log(`Status: ${res.status}`);
    console.log('Resposta:', res.data);

    if (res.status === 200 || res.status === 201) {
      console.log('\n✅ Política aplicada com sucesso!');
      console.log('\n📊 Verificando resultado...');

      // Testar a nova consulta
      const testRes = await makeRequest(
        'GET',
        '/rest/v1/companies?select=*&limit=10',
        null
      );

      console.log(`\n✅ Consulta de teste: ${testRes.status}`);
      if (Array.isArray(testRes.data)) {
        console.log(`   Empresas retornadas: ${testRes.data.length}`);
        if (testRes.data.length > 0) {
          console.log(`   ✅ Primeira empresa: ${testRes.data[0].legal_name}`);
        }
      }
    } else if (res.status === 404) {
      console.log('\n⚠️ RPC execute_sql não existe.');
      console.log('\n🔄 Tentando método alternativo via PostgreSQL...');
      console.log('⚠️ Este método requer acesso direto ao PostgreSQL.');
      console.log('\n📌 Próximo passo: Aplicar a migration manualmente no Supabase Dashboard');
      console.log('   1. Acesse Supabase Dashboard → Project: unnify-conecta-dev');
      console.log('   2. Vá em SQL Editor');
      console.log('   3. Cole este SQL:');
      console.log('\n' + SQL);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log('\n📌 Próximo passo: Aplicar a migration manualmente no Supabase Dashboard');
  }
}

apply();
