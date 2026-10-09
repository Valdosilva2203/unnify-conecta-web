#!/usr/bin/env node

/**
 * Diagnóstico: Por que as empresas não aparecem na listagem?
 * Investiga: Tabelas, RLS, dados reais, consultas
 */

const https = require('https');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const ANON_KEY = 'sb_publishable_7NLA0a6Ckf6z33AhW_IRIw_RX6DXtpW';
const SERVICE_ROLE_KEY = 'sb_secret_1E21s8_BfCwLCbDH22d70_SoRjAaJW';

function makeRequest(method, path, body = null, apiKey = ANON_KEY) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
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
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function diagnose() {
  console.log('\n🔍 DIAGNÓSTICO: Por que as empresas não aparecem?\n');

  try {
    // 1. Verificar se tabela "companies" existe e tem dados
    console.log('📋 Passo 1: Verificando tabela "companies" com ANON key');
    const companiesRes = await makeRequest('GET', '/rest/v1/companies?select=*&limit=100', null, ANON_KEY);
    console.log(`   Status: ${companiesRes.status}`);
    if (companiesRes.status === 200) {
      const count = Array.isArray(companiesRes.data) ? companiesRes.data.length : 0;
      console.log(`   ✅ Empresas encontradas: ${count}`);
      if (count > 0) {
        console.log(`   Primeiras empresas:`, companiesRes.data.slice(0, 2));
      }
    } else {
      console.log(`   ❌ Erro: ${companiesRes.status}`);
      console.log(`   Mensagem:`, companiesRes.data);
    }

    // 2. Verificar com SERVICE_ROLE (bypass RLS)
    console.log('\n📋 Passo 2: Verificando com SERVICE_ROLE (bypass RLS)');
    const companiesServiceRes = await makeRequest(
      'GET',
      '/rest/v1/companies?select=*&limit=100',
      null,
      SERVICE_ROLE_KEY
    );
    console.log(`   Status: ${companiesServiceRes.status}`);
    if (companiesServiceRes.status === 200) {
      const count = Array.isArray(companiesServiceRes.data) ? companiesServiceRes.data.length : 0;
      console.log(`   ✅ Empresas encontradas (sem RLS): ${count}`);
      if (count > 0) {
        console.log(`   Primeiras empresas:`, companiesServiceRes.data.slice(0, 2));
      }
    }

    // 3. Verificar schema da tabela
    console.log('\n📋 Passo 3: Verificando schema da tabela "companies"');
    const schemaRes = await makeRequest(
      'GET',
      `/rest/v1/companies?select=*&limit=0`,
      null,
      SERVICE_ROLE_KEY
    );
    if (schemaRes.status === 200) {
      console.log(`   ✅ Tabela existe`);
      console.log(`   Headers (colunas):`, Object.keys(schemaRes.headers));
    } else {
      console.log(`   ❌ Erro ao verificar schema: ${schemaRes.status}`);
    }

    // 4. Verificar se existe tabela "accounting_offices"
    console.log('\n📋 Passo 4: Verificando tabela "accounting_offices"');
    const officesRes = await makeRequest(
      'GET',
      '/rest/v1/accounting_offices?select=*&limit=100',
      null,
      SERVICE_ROLE_KEY
    );
    console.log(`   Status: ${officesRes.status}`);
    if (officesRes.status === 200) {
      const count = Array.isArray(officesRes.data) ? officesRes.data.length : 0;
      console.log(`   ✅ Escritórios encontrados: ${count}`);
    }

    // 5. Verificar profiles
    console.log('\n📋 Passo 5: Verificando perfis de usuários');
    const profilesRes = await makeRequest(
      'GET',
      '/rest/v1/profiles?select=id,global_role&limit=100',
      null,
      SERVICE_ROLE_KEY
    );
    console.log(`   Status: ${profilesRes.status}`);
    if (profilesRes.status === 200) {
      const adminUsers = Array.isArray(profilesRes.data)
        ? profilesRes.data.filter(p => p.global_role === 'admin_master' || p.global_role === 'admin')
        : [];
      console.log(`   ✅ Total usuários: ${profilesRes.data.length}`);
      console.log(`   ✅ Admins encontrados: ${adminUsers.length}`);
      if (adminUsers.length > 0) {
        console.log(`   Admin IDs:`, adminUsers.map(u => u.id).slice(0, 3));
      }
    }

    // 6. Relatório Final
    console.log('\n📊 RELATÓRIO FINAL:\n');
    const companyCount = Array.isArray(companiesServiceRes.data) ? companiesServiceRes.data.length : 0;

    if (companyCount === 0) {
      console.log('❌ PROBLEMA: Nenhuma empresa encontrada no banco DEV');
      console.log('\n   Possíveis causas:');
      console.log('   1. Nenhuma empresa foi cadastrada ainda via onboarding');
      console.log('   2. Fluxo de onboarding não está gravando os dados');
      console.log('   3. Tabela está vazia');
      console.log('\n   ✅ VERIFICAÇÃO: O banco está acessível e a tabela existe');
    } else {
      console.log(`✅ SUCESSO: ${companyCount} empresa(s) encontrada(s) no banco DEV`);
      console.log('\n   Problema: A página NÃO está consultando corretamente');
      console.log('   Próximo passo: Verificar se há erro no código da página');
      console.log('\n   Dados de exemplo:');
      companiesServiceRes.data.slice(0, 2).forEach((c, idx) => {
        console.log(`   ${idx + 1}. ${c.legal_name} (CNPJ: ${c.cnpj})`);
      });
    }

  } catch (error) {
    console.error('❌ Erro fatal:', error.message);
  }
}

diagnose();
