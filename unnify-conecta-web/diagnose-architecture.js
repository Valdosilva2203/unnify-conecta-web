const https = require('https');

const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

const queries = [
  {
    name: 'Verificar estrutura de profiles',
    sql: `SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'profiles' AND table_schema = 'public'
          ORDER BY ordinal_position;`
  },
  {
    name: 'Verificar RLS policies em profiles',
    sql: `SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
          FROM pg_policies
          WHERE tablename = 'profiles';`
  },
  {
    name: 'Verificar tabelas públicas',
    sql: `SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name;`
  },
  {
    name: 'Verificar funções existentes',
    sql: `SELECT proname, pronargs, prosrc FROM pg_proc 
          WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          LIMIT 20;`
  },
  {
    name: 'Verificar triggers',
    sql: `SELECT trigger_name, event_object_table, event_manipulation, action_statement
          FROM information_schema.triggers
          WHERE trigger_schema = 'public' LIMIT 10;`
  }
];

async function executeQuery(sql) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ query: sql });

    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ error: data });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function diagnose() {
  console.log('🔍 DIAGNÓSTICO DE ARQUITETURA - ADMIN MASTER\n');
  console.log('═'.repeat(60) + '\n');

  for (const query of queries) {
    console.log(`📋 ${query.name}`);
    console.log('─'.repeat(60));
    
    const result = await executeQuery(query.sql);
    
    if (result.error) {
      console.log(`❌ Erro: ${result.error}\n`);
    } else if (Array.isArray(result)) {
      if (result.length === 0) {
        console.log('(nenhum resultado)\n');
      } else {
        console.log(JSON.stringify(result, null, 2));
        console.log();
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
      console.log();
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
}

diagnose();
