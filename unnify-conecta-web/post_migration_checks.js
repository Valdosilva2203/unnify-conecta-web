const https = require('https');
const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

const checks = [
  { name: 'Colunas em profiles', sql: "SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('global_role','mfa_enabled','status')" },
  { name: 'Tabelas públicas', sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name" },
  { name: 'Funções criadas', sql: "SELECT proname FROM pg_proc WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') AND proname IN ('is_admin_master','prevent_privilege_escalation','handle_new_user')" },
  { name: 'RLS em profiles', sql: "SELECT COUNT(*) as policies FROM pg_policies WHERE tablename='profiles'" },
  { name: 'Triggers em profiles', sql: "SELECT trigger_name FROM information_schema.triggers WHERE event_object_table='profiles'" }
];

let completed = 0;

checks.forEach((check, idx) => {
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
        console.log(`\n✅ ${check.name}:`);
        if (Array.isArray(result) && result.length > 0) {
          result.slice(0, 5).forEach(r => {
            const key = Object.keys(r)[0];
            console.log(`   - ${r[key]}`);
          });
          if (result.length > 5) console.log(`   ... e ${result.length - 5} mais`);
        } else {
          console.log(`   Resultado: ${JSON.stringify(result).substring(0, 50)}`);
        }
      } catch {
        console.log(`❌ ${check.name}: Erro`);
      }
      
      completed++;
      if (completed === checks.length) {
        console.log('\n' + '═'.repeat(70));
        console.log('✅ TODAS AS VERIFICAÇÕES COMPLETADAS');
        console.log('═'.repeat(70) + '\n');
        process.exit(0);
      }
    });
  });

  req.on('error', () => {
    completed++;
    if (completed === checks.length) process.exit(0);
  });

  req.write(postData);
  req.end();
});
