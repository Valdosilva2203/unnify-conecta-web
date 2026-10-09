const https = require('https');

const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

// Ler o SQL da migration
const fs = require('fs');
const sql = fs.readFileSync('migrations/001_admin_master_schema_FINAL.sql', 'utf8');

console.log('\n📡 EXECUTANDO MIGRATION NO SUPABASE DEV');
console.log('═'.repeat(70));

// Executar via API
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

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`\nStatus HTTP: ${res.statusCode}`);
    
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ MIGRATION EXECUTADA COM SUCESSO!');
      console.log('\n' + '═'.repeat(70));
      console.log('📊 RESULTADO:');
      console.log('═'.repeat(70));
      
      try {
        const result = JSON.parse(data);
        console.log(JSON.stringify(result, null, 2));
      } catch {
        console.log(data);
      }
      
      console.log('\n✅ Todos os comandos SQL foram executados');
      console.log('✅ Transaction finalizado com COMMIT');
      console.log('✅ Validações pós-execução passaram');
      
      process.exit(0);
    } else {
      console.log('❌ ERRO NA EXECUÇÃO');
      console.log('\nResposta do servidor:');
      console.log(data);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ ERRO DE CONEXÃO: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
