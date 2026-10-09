const https = require('https');
const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';
const targetUserId = '936b800f-7b17-4afa-b5a1-af2bbc9e07a0';

console.log('\n🔐 BOOTSTRAP ADMIN MASTER\n');
console.log('═'.repeat(70));
console.log(`Target User ID: ${targetUserId}`);
console.log('═'.repeat(70) + '\n');

// SQL para bootstrap seguro
const sql = `
BEGIN;

-- 1. Desabilitar o trigger temporariamente
ALTER TABLE public.profiles DISABLE TRIGGER enforce_privilege_immutability;

-- 2. Promover user a admin_master
UPDATE public.profiles
SET global_role = 'admin_master', last_role_change = NOW()
WHERE user_id = '${targetUserId}'
  AND global_role = 'user'
  AND email = 'unnifybr@gmail.com';

-- 3. Registrar no audit_logs
INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
VALUES (
  '${targetUserId}',
  'ADMIN_BOOTSTRAP',
  'profiles',
  (SELECT id FROM public.profiles WHERE user_id = '${targetUserId}'),
  '{"global_role":"user"}',
  '{"global_role":"admin_master"}'
);

-- 4. Reabilitar trigger
ALTER TABLE public.profiles ENABLE TRIGGER enforce_privilege_immutability;

-- 5. Validação pós-bootstrap
DO $$
DECLARE
  v_role TEXT;
  v_count INT;
BEGIN
  SELECT global_role INTO v_role FROM public.profiles WHERE user_id = '${targetUserId}';
  
  ASSERT v_role = 'admin_master', 'BOOTSTRAP FAILED: global_role is still ' || v_role;
  
  SELECT COUNT(*) INTO v_count FROM public.audit_logs WHERE action = 'ADMIN_BOOTSTRAP';
  ASSERT v_count > 0, 'BOOTSTRAP FAILED: audit log not created';
  
  RAISE NOTICE '✅ Bootstrap successful for user ${targetUserId}';
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

console.log('⏳ Executando bootstrap...\n');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ BOOTSTRAP EXECUTADO COM SUCESSO!\n');
      console.log('═'.repeat(70));
      console.log('AÇÕES REALIZADAS:');
      console.log('═'.repeat(70));
      console.log(`✅ global_role promovido para: admin_master`);
      console.log(`✅ User ID: ${targetUserId}`);
      console.log(`✅ Email: unnifybr@gmail.com`);
      console.log(`✅ Nome: Valdo Silva`);
      console.log(`✅ Registrado em audit_logs com ação: ADMIN_BOOTSTRAP`);
      console.log(`✅ Trigger remain ativo para proteger outros users`);
      console.log('\n' + '═'.repeat(70));
      console.log('🎉 ADMIN MASTER BOOTSTRAP CONCLUÍDO!\n');
      console.log('Próximo passo: Validar login com suas credenciais.\n');
      process.exit(0);
    } else {
      console.log(`❌ ERRO (${res.statusCode}):\n`);
      console.log(data);
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
