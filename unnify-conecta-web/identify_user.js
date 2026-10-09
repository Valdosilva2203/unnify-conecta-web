const https = require('https');
const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

console.log('\n🔍 IDENTIFICANDO USUÁRIO PARA BOOTSTRAP\n');
console.log('═'.repeat(70) + '\n');

const queries = [
  {
    name: 'Usuários em auth.users',
    sql: `SELECT id, email, created_at FROM auth.users ORDER BY created_at LIMIT 5;`
  },
  {
    name: 'Profiles em public.profiles',
    sql: `SELECT user_id, email, full_name, global_role FROM public.profiles ORDER BY created_at LIMIT 5;`
  },
  {
    name: 'Comparação (auth vs public)',
    sql: `SELECT 
      a.id as auth_user_id,
      a.email as auth_email,
      p.user_id as profile_user_id,
      p.email as profile_email,
      p.global_role,
      CASE WHEN a.id = p.user_id THEN '✅ MATCH' ELSE '❌ MISMATCH' END as status
    FROM auth.users a
    LEFT JOIN public.profiles p ON a.id = p.user_id
    ORDER BY a.created_at;`
  }
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
      console.log(`📋 ${check.name}:`);
      console.log('─'.repeat(70));
      
      try {
        const result = JSON.parse(data);
        if (Array.isArray(result) && result.length > 0) {
          result.forEach((row, idx) => {
            console.log(`${idx + 1}. ${JSON.stringify(row)}`);
          });
        } else if (typeof result === 'object') {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (e) {
        console.log(`Erro ao parsear: ${data.substring(0, 100)}`);
      }
      
      console.log('\n');
      completed++;
      
      if (completed === queries.length) {
        console.log('═'.repeat(70));
        console.log('\n⚠️  ANÁLISE CONCLUÍDA');
        console.log('\nPróximo passo: Você vai confirmar qual user_id é o seu?');
        console.log('Depois vou criar um bootstrap seguro para promover esse user.\n');
        process.exit(0);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`❌ Erro: ${e.message}`);
    completed++;
    if (completed === queries.length) process.exit(1);
  });

  req.write(postData);
  req.end();
});
