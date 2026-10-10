const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function testFlow(description, path, maxRedirects = 3) {
  console.log(`\n[Test] ${description}`);
  console.log(`Path: ${path}`);
  
  let currentPath = path;
  let redirectCount = 0;
  const visited = [];

  while (redirectCount < maxRedirects) {
    visited.push(currentPath);
    console.log(`  → ${currentPath}`);

    const response = await new Promise((resolve, reject) => {
      const req = http.get(BASE_URL + currentPath, { redirect: 'manual' }, (res) => {
        resolve({ status: res.statusCode, location: res.headers.location });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      currentPath = response.location;
      redirectCount++;
      
      // Detectar loop
      if (visited.includes(currentPath)) {
        console.log(`  ❌ LOOP DETECTADO: ${currentPath} visitado 2x`);
        console.log(`  Sequência: ${visited.join(' → ')} → ${currentPath}`);
        return false;
      }
    } else {
      console.log(`  ✅ Status ${response.status} (fim)`);
      return true;
    }
  }

  console.log(`  ⚠️ Atingido limite de redirects`);
  return false;
}

async function runTests() {
  console.log('\n🧪 TESTE DE FLUXO DE LOGIN - Verificar Loops\n');
  console.log('='.repeat(70));

  const tests = [
    ['Acessar /login', '/login'],
    ['Acessar /app sem autenticação', '/app'],
    ['Acessar /admin sem autenticação', '/admin'],
    ['Acessar /onboarding sem autenticação', '/onboarding'],
  ];

  let passed = 0;
  let failed = 0;

  for (const [desc, path] of tests) {
    try {
      const result = await testFlow(desc, path);
      if (result === false) {
        failed++;
      } else {
        passed++;
      }
    } catch (err) {
      console.log(`  ❌ ERRO: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
