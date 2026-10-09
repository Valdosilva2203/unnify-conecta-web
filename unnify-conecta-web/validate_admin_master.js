const https = require('https');
const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';
const targetUserId = '936b800f-7b17-4afa-b5a1-af2bbc9e07a0';

const sql = `SELECT user_id, email, full_name, global_role, mfa_enabled, status FROM public.profiles WHERE user_id = '${targetUserId}';`;

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

console.log('\n✔️  VALIDANDO ADMIN MASTER STATUS\n');
console.log('═'.repeat(70) + '\n');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (Array.isArray(result) && result.length > 0) {
        const profile = result[0];
        
        console.log('📊 PROFILE ATUAL:');
        console.log('─'.repeat(70));
        console.log(`User ID:      ${profile.user_id}`);
        console.log(`Email:        ${profile.email}`);
        console.log(`Nome:         ${profile.full_name}`);
        console.log(`global_role:  ${profile.global_role}`);
        console.log(`mfa_enabled:  ${profile.mfa_enabled}`);
        console.log(`status:       ${profile.status}`);
        console.log('─'.repeat(70));
        
        if (profile.global_role === 'admin_master') {
          console.log('\n✅ VALIDAÇÃO PASSOU!');
          console.log('\n🔓 Você agora é Admin Master!');
          console.log('\nPróximos passos:');
          console.log('1. ✅ Login com suas credenciais (unnifybr@gmail.com)');
          console.log('2. ✅ Acessar o dashboard administrativo');
          console.log('3. ✅ Configurar MFA (segurança recomendada)\n');
        } else {
          console.log(`\n❌ VALIDAÇÃO FALHOU! global_role = ${profile.global_role}\n`);
        }
      }
    } catch (e) {
      console.log(`Erro: ${data}`);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`❌ Erro: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
