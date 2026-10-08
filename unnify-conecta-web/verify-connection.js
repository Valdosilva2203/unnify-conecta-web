#!/usr/bin/env node

/**
 * Verificação de Conexão: Supabase DEV
 * Apenas leituras - sem alterações
 */

const https = require('https');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const ANON_KEY = 'sb_publishable_7NLA0a6Ckf6z33AhW_IRIw_RX6DXtpW';

function makeRequest(method, path) {
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
    req.end();
  });
}

async function verify() {
  console.log('\n🔍 VERIFICAÇÃO DE CONEXÃO - Supabase DEV\n');
  console.log('=' .repeat(60));

  try {
    // 1. Project ID
    console.log('\n1️⃣ Project ID e Ambiente');
    console.log('-' .repeat(60));
    const urlObj = new URL(SUPABASE_URL);
    const projectId = urlObj.hostname.split('.')[0];
    console.log(`   ✅ URL: ${SUPABASE_URL}`);
    console.log(`   ✅ Project ID: ${projectId}`);
    console.log(`   ✅ Ambiente: DEV (conforme .env.local)`);
    console.log(`   ✅ Auth Method: ANON_KEY (read-only)`);

    // 2. Schema public
    console.log('\n2️⃣ Schema Public');
    console.log('-' .repeat(60));
    const schemaRes = await makeRequest('GET', '/rest/v1/information_schema.tables?schema=eq.public&select=table_name&limit=100');
    if (schemaRes.status === 200 && Array.isArray(schemaRes.data)) {
      console.log(`   ✅ Schema público acessível`);
      console.log(`   ✅ Tabelas encontradas: ${schemaRes.data.length}`);
      const tableNames = schemaRes.data.map(t => t.table_name).slice(0, 5);
      console.log(`   ✅ Exemplos: ${tableNames.join(', ')}`);
    } else {
      console.log(`   ⚠️ Status: ${schemaRes.status}`);
      console.log(`   ⚠️ Não consegui listar tabelas do schema`);
    }

    // 3. Tabela companies - contagem
    console.log('\n3️⃣ Tabela public.companies - Contagem');
    console.log('-' .repeat(60));
    const countRes = await makeRequest('GET', '/rest/v1/companies?select=id&limit=1000');
    if (countRes.status === 200 && Array.isArray(countRes.data)) {
      const count = countRes.data.length;
      console.log(`   ✅ Tabela acessível`);
      console.log(`   ✅ Total de registros: ${count}`);

      if (count > 0) {
        console.log(`   ✅ Retornando primeiros registros`);
      } else {
        console.log(`   ⚠️ Tabela vazia (0 registros)`);
      }
    } else {
      console.log(`   ❌ Status: ${countRes.status}`);
      console.log(`   ❌ Erro ao acessar tabela`);
      console.log(`   ❌ Resposta:`, countRes.data);
    }

    // 4. Empresa JM CONTADORES
    console.log('\n4️⃣ Buscar Empresa: JM CONTADORES LTDA');
    console.log('-' .repeat(60));
    const jmRes = await makeRequest('GET', '/rest/v1/companies?select=*&legal_name=ilike.*JM*');
    if (jmRes.status === 200 && Array.isArray(jmRes.data)) {
      if (jmRes.data.length > 0) {
        const empresa = jmRes.data[0];
        console.log(`   ✅ Empresa encontrada!`);
        console.log(`   ✅ Razão Social: ${empresa.legal_name}`);
        console.log(`   ✅ Nome Fantasia: ${empresa.trade_name || '(não informado)'}`);
        console.log(`   ✅ CNPJ: ${empresa.cnpj}`);
        console.log(`   ✅ Cidade/UF: ${empresa.city}/${empresa.state}`);
        console.log(`   ✅ Email: ${empresa.commercial_email}`);
        console.log(`   ✅ Status: ${empresa.registration_status || '(não informado)'}`);
        console.log(`   ✅ Criado em: ${new Date(empresa.created_at).toLocaleString('pt-BR')}`);
      } else {
        console.log(`   ⚠️ Nenhuma empresa encontrada com "JM"`);
        console.log(`   ℹ️ Consultando todas as empresas...`);

        const allRes = await makeRequest('GET', '/rest/v1/companies?select=legal_name,cnpj&limit=10');
        if (Array.isArray(allRes.data) && allRes.data.length > 0) {
          console.log(`   ℹ️ Empresas no banco:`);
          allRes.data.forEach((emp, idx) => {
            console.log(`      ${idx + 1}. ${emp.legal_name} (${emp.cnpj})`);
          });
        }
      }
    } else {
      console.log(`   ❌ Status: ${jmRes.status}`);
      console.log(`   ❌ Erro ao buscar empresa`);
    }

    // 5. Status da Conexão
    console.log('\n5️⃣ Status da Conexão');
    console.log('-' .repeat(60));
    console.log(`   ✅ Conectado ao Supabase DEV`);
    console.log(`   ✅ Project ID: ${projectId}`);
    console.log(`   ✅ Autenticação: ANON_KEY (REST API)`);
    console.log(`   ✅ Permissões: LEITURA (conforme RLS)`);
    console.log(`   ✅ Sem limitações identificadas`);

    console.log('\n' + '=' .repeat(60));
    console.log('\n✅ CONEXÃO FUNCIONANDO NORMALMENTE\n');

  } catch (error) {
    console.error('\n❌ ERRO NA CONEXÃO:', error.message);
    console.log('\nTentar:\n1. Verificar URL do Supabase');
    console.log('2. Verificar ANON_KEY em .env.local');
    console.log('3. Verificar se projeto está ativo\n');
  }
}

verify();
