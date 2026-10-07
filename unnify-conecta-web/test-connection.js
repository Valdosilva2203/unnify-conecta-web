const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbjffj.supabase.co';
const SERVICE_ROLE_KEY = 'sb_secret_1E21s8_BfCwLCbDH22d70_SoRjAaJW';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function testConnection() {
  try {
    console.log('🔗 Testando conexão ao Supabase...\n');
    
    // Test: Get users (auth.users exists by default)
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.log('❌ Erro:', error.message);
      return;
    }

    console.log('✅ CONECTADO COM SUCESSO!\n');
    console.log(`📊 Usuários criados: ${data.users.length}`);
    
  } catch (err) {
    console.error('❌ Erro crítico:', err.message);
  }
}

testConnection();
