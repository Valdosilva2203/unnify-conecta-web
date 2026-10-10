const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2d2ZvYWZrcWpxdXhjYmlqZmZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTYzMTY4MDAsImV4cCI6MTk5MjMxNjgwMH0.c1eS9yd6jgYN2hPLt8K8sL8YJfH7uR9nQ3vW2zX1k0A';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function testQueries() {
  console.log('\n🔍 TESTE DE SCHEMA E QUERIES\n');
  console.log('='.repeat(70));

  // Test 1: Try to query perfis with user_id (correct name)
  console.log('\n[Test 1] Query perfis com user_id');
  try {
    const fakeUUID = '00000000-0000-0000-0000-000000000000';
    const { data, error, status } = await supabase
      .from('perfis')
      .select('global_role')
      .eq('user_id', fakeUUID)
      .single();
    
    if (error) {
      console.log(`  Status: ${status}`);
      console.log(`  Erro: ${error.message}`);
      console.log(`  Código: ${error.code}`);
    } else {
      console.log(`  Query OK: `, data);
    }
  } catch (err) {
    console.log(`  Exception: ${err.message}`);
  }

  // Test 2: Try to query perfis with old name id_usuario
  console.log('\n[Test 2] Query perfis com id_usuario (deve falhar com 400)');
  try {
    const { data, error, status } = await supabase
      .from('perfis')
      .select('global_role')
      .eq('id_usuario', '00000000-0000-0000-0000-000000000000')
      .single();
    
    if (error) {
      console.log(`  Status: ${status}`);
      console.log(`  Erro: ${error.message}`);
      console.log(`  Código: ${error.code}`);
    }
  } catch (err) {
    console.log(`  Exception: ${err.message}`);
  }

  // Test 3: Sample query to detect columns
  console.log('\n[Test 3] Detectar colunas da tabela perfis');
  try {
    const { data: sampleData, error } = await supabase
      .from('perfis')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log(`  Erro: ${error.message}`);
    } else if (sampleData && sampleData.length > 0) {
      const cols = Object.keys(sampleData[0]);
      console.log(`  Colunas: ${cols.join(', ')}`);
    } else {
      console.log(`  Tabela vazia`);
    }
  } catch (err) {
    console.log(`  Erro: ${err.message}`);
  }

  // Test 4: Check empresas table
  console.log('\n[Test 4] Detectar colunas da tabela empresas');
  try {
    const { data: empresas, error } = await supabase
      .from('empresas')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log(`  Erro: ${error.message}`);
    } else if (empresas && empresas.length > 0) {
      const cols = Object.keys(empresas[0]);
      console.log(`  Colunas: ${cols.join(', ')}`);
    } else {
      console.log(`  Tabela vazia`);
    }
  } catch (err) {
    console.log(`  Erro: ${err.message}`);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

testQueries().catch(console.error);
