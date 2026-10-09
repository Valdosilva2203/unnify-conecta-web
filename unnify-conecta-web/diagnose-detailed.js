const https = require('https');

const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

const queries = [
  {
    name: 'Colunas EXATAS de profiles',
    sql: `SELECT * FROM information_schema.columns WHERE table_name = 'profiles' AND table_schema = 'public';`
  },
  {
    name: 'Função is_admin completa',
    sql: `SELECT pg_get_functiondef('is_admin(uuid)'::regprocedure);`
  },
  {
    name: 'Estrutura das outras tabelas',
    sql: `SELECT table_name, column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position;`
  },
  {
    name: 'Verificar auth.users (estrutura)',
    sql: `SELECT column_name, data_type FROM information_schema.columns 
          WHERE table_name = 'users' AND table_schema = 'auth' LIMIT 15;`
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
  console.log('\n🔍 DIAGNÓSTICO DETALHADO\n');

  for (const query of queries) {
    console.log(`\n📋 ${query.name}`);
    console.log('─'.repeat(70));
    
    const result = await executeQuery(query.sql);
    
    if (result.error) {
      console.log(`❌ ${result.error}`);
    } else if (Array.isArray(result)) {
      if (result.length === 0) {
        console.log('(nenhum resultado)');
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    
    await new Promise(r => setTimeout(r, 400));
  }
  
  console.log('\n\n✅ Diagnóstico completo\n');
}

diagnose();
