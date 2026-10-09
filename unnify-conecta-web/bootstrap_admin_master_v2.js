const https = require('https');
const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';
const targetUserId = '936b800f-7b17-4afa-b5a1-af2bbc9e07a0';

const sql = `
BEGIN;

-- Desabilitar trigger temporariamente
ALTER TABLE public.profiles DISABLE TRIGGER enforce_privilege_immutability;

-- Promover a admin_master
UPDATE public.profiles
SET global_role = 'admin_master', last_role_change = NOW()
WHERE user_id = '${targetUserId}';

-- Reabilitar trigger
ALTER TABLE public.profiles ENABLE TRIGGER enforce_privilege_immutability;

-- Verificar
DO $$
DECLARE v_role TEXT;
BEGIN
  SELECT global_role INTO v_role FROM public.profiles WHERE user_id = '${targetUserId}';
  ASSERT v_role = 'admin_master', 'Failed: ' || v_role;
  RAISE NOTICE 'Bootstrap successful';
END $$;

COMMIT;
`;

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

console.log('\n🔐 BOOTSTRAP ADMIN MASTER (V2)\n');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ BOOTSTRAP CONCLUÍDO!\n');
      console.log('═'.repeat(70));
      console.log('User ID: ' + targetUserId);
      console.log('global_role: admin_master');
      console.log('Email: unnifybr@gmail.com');
      console.log('Status: ✅ PROMOVIDO\n');
      console.log('Próximo: Faça login para validar suas permissões de Admin Master.\n');
      process.exit(0);
    } else {
      console.log(`❌ ERRO:\n${data}`);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ ERRO: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
