const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bvwfoafkqjquxcbijffj.supabase.co',
  'sb_secret_1E21s8_BfCwLCbDH22d70_SoRjAaJW'
);

async function test() {
  const { data, error, count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .limit(0);

  if (error?.code === 'PGRST116') {
    console.error('❌ Tabela NÃO EXISTE');
    process.exit(1);
  }
  
  if (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }

  console.log('✅ Tabela profiles existe!');
  console.log(`   Registros: ${count || 0}`);
  process.exit(0);
}

test();
