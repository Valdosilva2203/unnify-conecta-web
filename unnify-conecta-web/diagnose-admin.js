const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
// Try to get from environment, fallback to public key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2d2ZvYWZrcWpxdXhjYmlqZmZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTYzMTY4MDAsImV4cCI6MTk5MjMxNjgwMH0.c1eS9yd6jgYN2hPLt8K8sL8YJfH7uR9nQ3vW2zX1k0A';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function diagnose() {
  console.log('\n🔍 DIAGNOSTICANDO USUÁRIO ADMIN_MASTER\n');
  console.log('='.repeat(70));

  const email = 'unnifybr@gmail.com';

  // Step 1: Query Auth users
  console.log(`\n[Step 1] Procurando usuário: ${email}`);
  try {
    // This requires service role or special auth
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers().catch(() => ({
      data: null,
      error: { message: 'Requer credenciais admin (service role)' }
    }));

    if (usersError) {
      console.log(`  ⚠️ Não posso listar usuários: ${usersError.message}`);
      console.log('  Alternativa: Consultar perfis diretamente');
    }
  } catch (err) {
    console.log(`  ⚠️ Erro ao acessar Auth Admin: ${err.message}`);
  }

  // Step 2: Try direct query to perfis
  console.log(`\n[Step 2] Consultando tabela perfis para encontrar email`);
  try {
    // This is a workaround - try selecting all profiles and filtering
    const { data: profiles, error: profilesError } = await supabase
      .from('perfis')
      .select('user_id, global_role')
      .limit(100);

    if (profilesError) {
      console.log(`  ❌ Erro na query: ${profilesError.message}`);
      console.log(`  Código: ${profilesError.code}`);
    } else if (profiles) {
      console.log(`  ✅ Query retornou ${profiles.length} registros`);
      
      // Try to find by checking if any matches the known UUID pattern
      if (profiles.length > 0) {
        console.log('\n  Amostra de perfis:');
        profiles.slice(0, 3).forEach((p, i) => {
          console.log(`    ${i+1}. user_id: ${p.user_id}, global_role: ${p.global_role}`);
        });
      }
    }
  } catch (err) {
    console.log(`  ❌ Erro: ${err.message}`);
  }

  // Step 3: Try to get current user (requires auth)
  console.log(`\n[Step 3] Tentando obter usuário autenticado atual`);
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.log(`  ⚠️ Não há usuário autenticado: ${userError.message}`);
    } else if (user) {
      console.log(`  ✅ Usuário autenticado: ${user.email}`);
      console.log(`  ID: ${user.id}`);
      
      // Query this user's profile
      console.log(`\n[Step 4] Consultando perfil do usuário autenticado`);
      const { data: profile, error: profileError } = await supabase
        .from('perfis')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (profileError) {
        console.log(`  ❌ Erro: ${profileError.message}`);
        console.log(`  Código: ${profileError.code}`);
      } else if (profile) {
        console.log(`  ✅ Perfil encontrado:`);
        console.log(`  user_id: ${profile.user_id}`);
        console.log(`  global_role: ${profile.global_role}`);
        console.log(`  status: ${profile.status}`);
        console.log(`  mfa_enabled: ${profile.mfa_enabled}`);
        
        if (profile.global_role === 'admin_master' || profile.global_role === 'admin') {
          console.log('\n  ⚠️ ACHADO: Este usuário TEM privilégios admin');
          console.log(`  Função: ${profile.global_role}`);
          console.log(`  Mas está sendo redirecionado para /onboarding`);
          console.log(`  → Problema está no CÓDIGO, não no banco`);
        } else {
          console.log('\n  ⚠️ Este usuário NÃO é admin');
          console.log(`  Função atual: ${profile.global_role}`);
        }
      }
    }
  } catch (err) {
    console.log(`  ❌ Erro: ${err.message}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('\nDIAGNÓSTICO CONCLUÍDO\n');
}

diagnose().catch(console.error);
