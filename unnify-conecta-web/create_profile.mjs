import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bvwfoafkqjquxcbijffj.supabase.co',
  'sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e'
);

const { data, error } = await supabase
  .from('profiles')
  .insert({
    user_id: '7d05dddb-d78e-46d9-8313-638e0b87ece1',
    global_role: 'admin_master',
    email: 'unnifybr@gmail.com',
    full_name: 'Vado silva',
    status: 'active',
    mfa_enabled: false,
  })
  .select();

if (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
} else {
  console.log('✅ Perfil criado com sucesso!');
  console.log(JSON.stringify(data, null, 2));
}
