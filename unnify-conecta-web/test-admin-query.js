#!/usr/bin/env node

/**
 * Teste: Por que a consulta de admin não retorna a empresa?
 */

const https = require('https');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const ANON_KEY = 'sb_publishable_7NLA0a6Ckf6z33AhW_IRIw_RX6DXtpW';

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      ...headers,
    };

    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: path,
      method: method,
      headers: defaultHeaders,
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
  console.log('\n🔍 TESTE: Consulta de empresas como admin\n');

  try {
    // 1. Fazer consulta simples
    console.log('📌 Consulta 1: SELECT * FROM companies (sem autenticação)');
    const res1 = await makeRequest(
      'GET',
      '/rest/v1/companies?select=*&order=created_at.desc',
      null,
      {}
    );
    console.log(`   Status: ${res1.status}`);
    console.log(`   Empresas retornadas: ${Array.isArray(res1.data) ? res1.data.length : 'erro'}`);
    if (Array.isArray(res1.data) && res1.data.length > 0) {
      console.log(`   ✅ Primeira empresa: ${res1.data[0].legal_name}`);
    } else {
      console.log(`   ❌ Nenhuma empresa retornada`);
      console.log(`   Resposta:`, res1.data);
    }

    // 2. Tentar com filtro específico
    console.log('\n📌 Consulta 2: Buscar por CNPJ específico');
    const res2 = await makeRequest(
      'GET',
      '/rest/v1/companies?select=*&cnpj=eq.43.885.538/0001-33',
      null,
      {}
    );
    console.log(`   Status: ${res2.status}`);
    console.log(`   Resultado:`, res2.data);

    // 3. Verificar limite de registros
    console.log('\n📌 Consulta 3: Com limite explícito');
    const res3 = await makeRequest(
      'GET',
      '/rest/v1/companies?select=*&limit=100',
      null,
      {}
    );
    console.log(`   Status: ${res3.status}`);
    console.log(`   Empresas: ${Array.isArray(res3.data) ? res3.data.length : 'erro'}`);

    // 4. Checar headers e contagem
    console.log('\n📌 Consulta 4: Apenas contagem');
    const res4 = await makeRequest(
      'GET',
      '/rest/v1/companies?select=count=eq.true&count=exact',
      null,
      {}
    );
    console.log(`   Status: ${res4.status}`);
    console.log(`   Resposta:`, res4.data);

    // 5. Verificar se é problema de RLS
    console.log('\n📌 Verificação: Políticas RLS podem estar bloqueando?');
    console.log('   ⚠️ A política atual permite leitura apenas de created_by = auth.uid()');
    console.log('   ⚠️ Se admin não criou a empresa, RLS bloqueia a leitura');
    console.log('   ⚠️ Solução: Criar política de bypass para admin');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

test();
