const https = require('https');
const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

const userId = 'd5608140-d8d5-49a3-ac96-4c85ebb7e7a7';

console.log(`\n🔍 VERIFICANDO USER_ID: ${userId}\n`);
console.log('═'.repeat(70) + '\n');

// Query 1: Verificar em profiles
const sql1 = `SELECT user_id, email, full_name, global_role FROM public.profiles WHERE user_id = '${userId}';`;

// Query 2: Verificar em auth.users
const sql2 = `SELECT id, email FROM auth.users WHERE id = '${userId}';`;

const queries = [
  { name: 'Profile', sql: sql1 },
  { name: 'Auth User', sql: sql2 }
];

let completed = 0;

queries.forEach((check) => {
  const postData = JSON.stringify({ query: check.sql });
  
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
        const result = JSON.parse(data);
        console.log(`📋 ${check.name}:`);
        
        if (Array.isArray(result)) {
          if (result.length > 0) {
            result.forEach(row => console.log(`   ✅ Encontrado: ${JSON.stringify(row)}`));
          } else {
            console.log(`   ❌ Não encontrado`);
          }
        }
      } catch (e) {
        console.log(`   ❌ Erro: ${data.substring(0, 100)}`);
      }
      
      console.log('');
      completed++;
      
      if (completed === queries.length) {
        console.log('═'.repeat(70) + '\n');
        console.log('📌 SE AMBOS FORAM ENCONTRADOS:');
        console.log('   ✅ Ready para criar bootstrap\n');
        process.exit(0);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`❌ Erro: ${e.message}`);
    process.exit(1);
  });

  req.write(postData);
  req.end();
});
