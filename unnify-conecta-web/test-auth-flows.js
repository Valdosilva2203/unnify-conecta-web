const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2d2ZvYWZrcWpxdXhjYmlqZmZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTYzMTY4MDAsImV4cCI6MTk5MjMxNjgwMH0.c1eS9yd6jgYN2hPLt8K8sL8YJfH7uR9nQ3vW2zX1k0A';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function testAuthFlows() {
  console.log('\n🧪 Iniciando testes de autenticação\n');

  const results = {
    passed: 0,
    failed: 0,
    issues: []
  };

  // Test 1: Check if /api/auth/check-role endpoint exists
  console.log('Test 1: Validar estrutura de APIs');
  try {
    const response = await fetch('http://localhost:3000/api/auth/check-role', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid_token' }
    });
    
    // Esperamos 200 com role: null (para token inválido)
    if (response.status === 200) {
      const data = await response.json();
      if ('role' in data) {
        console.log('✅ Endpoint /api/auth/check-role retorna role corretamente');
        results.passed++;
      } else {
        console.log('❌ Endpoint /api/auth/check-role não retorna role');
        results.failed++;
        results.issues.push('Endpoint /api/auth/check-role não tem field "role"');
      }
    } else {
      console.log('❌ Endpoint /api/auth/check-role retorna status', response.status);
      results.failed++;
      results.issues.push(`Endpoint /api/auth/check-role status ${response.status}`);
    }
  } catch (err) {
    console.log('❌ Erro ao testar /api/auth/check-role:', err.message);
    results.failed++;
    results.issues.push(`Erro ao testar /api/auth/check-role: ${err.message}`);
  }

  // Test 2: Verificar rotas protegidas
  console.log('\nTest 2: Verificar rotas protegidas (sem autenticação)');
  const protectedRoutes = ['/app', '/admin'];
  
  for (const route of protectedRoutes) {
    try {
      const response = await fetch(`http://localhost:3000${route}`, { redirect: 'manual' });
      
      if (response.status === 307 || response.status === 308) {
        const location = response.headers.get('location');
        if (location && location.includes('/login')) {
          console.log(`✅ ${route} redireciona para /login quando não autenticado`);
          results.passed++;
        } else {
          console.log(`⚠️ ${route} redireciona para ${location}`);
          results.issues.push(`${route} redireciona para ${location} em vez de /login`);
        }
      } else if (response.status === 200) {
        // Server component, precisa de teste com cliente
        console.log(`⚠️ ${route} retorna 200 (server-side validation)`);
      } else {
        console.log(`❌ ${route} retorna status ${response.status}`);
        results.failed++;
      }
    } catch (err) {
      console.log(`⚠️ Erro ao testar ${route}: ${err.message}`);
    }
  }

  // Test 3: Verificar se onboarding redireciona admins
  console.log('\nTest 3: Estrutura de redirecionamento');
  try {
    const response = await fetch('http://localhost:3000/onboarding', { redirect: 'manual' });
    if (response.status === 200) {
      console.log('✅ Página /onboarding é acessível (server-side validation)');
      results.passed++;
    }
  } catch (err) {
    console.log('⚠️ Erro ao testar /onboarding');
  }

  // Test 4: Verificar RLS policies (via queries)
  console.log('\nTest 4: Verificar configuração RLS no banco');
  try {
    // Query sem autenticação
    const { data, error } = await supabase
      .from('perfis')
      .select('id_usuario, funcao_global')
      .limit(1);
    
    if (error) {
      if (error.message.includes('row level security')) {
        console.log('✅ RLS está ATIVO na tabela perfis');
        results.passed++;
      } else {
        console.log('⚠️ Erro na query:', error.message);
      }
    } else {
      console.log('⚠️ Query sem autenticação retornou dados (RLS pode estar desabilitado)');
      results.issues.push('RLS potencialmente desabilitado em perfis');
    }
  } catch (err) {
    console.log('⚠️ Erro ao testar RLS:', err.message);
  }

  // Test 5: Verificar se hay referencias a endpoints antigos
  console.log('\nTest 5: Verificar referências a endpoints antigos');
  try {
    const files = ['app/onboarding/page.tsx', 'app/admin/layout.tsx', 'app/app/layout.tsx'];
    let foundOld = false;
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('/api/admin/check-role')) {
        console.log(`❌ ${file} ainda referencia /api/admin/check-role`);
        results.failed++;
        foundOld = true;
      }
    }
    
    if (!foundOld) {
      console.log('✅ Nenhuma referência a /api/admin/check-role encontrada');
      results.passed++;
    }
  } catch (err) {
    console.log('⚠️ Erro ao verificar referências:', err.message);
  }

  // Test 6: Verificar console.log/error
  console.log('\nTest 6: Verificar logs sensíveis removidos');
  try {
    const files = [
      'app/app/layout.tsx',
      'app/admin/layout.tsx',
      'app/onboarding/page.tsx',
      'components/LoginForm.tsx',
      'app/reset-password/reset-password-content.tsx',
      'app/api/auth/check-role/route.ts'
    ];
    
    let foundLogs = false;
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Procurar por console.log/error que exponha informações
      const logs = content.match(/console\.(log|error)\s*\(/g) || [];
      
      if (logs.length > 0) {
        // Verificar se é logging sensível
        const hasToken = content.includes('token');
        const hasUserID = content.includes('user.id');
        
        if (hasToken || hasUserID) {
          console.log(`❌ ${file} contém console com potencial para expor dados sensíveis`);
          results.failed++;
          foundLogs = true;
        } else {
          console.log(`⚠️ ${file} contém console.log/error`);
        }
      }
    }
    
    if (!foundLogs) {
      console.log('✅ Nenhum console.log/error sensível encontrado');
      results.passed++;
    }
  } catch (err) {
    console.log('⚠️ Erro ao verificar logs:', err.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Resultados: ${results.passed} passou, ${results.failed} falhou\n`);
  
  if (results.issues.length > 0) {
    console.log('⚠️ Problemas encontrados:');
    results.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue}`);
    });
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

testAuthFlows().catch(console.error);
