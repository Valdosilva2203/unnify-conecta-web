const https = require('https');

const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

const audits = [
  {
    category: '1. VERIFICAR COLUNA global_role EXISTENTE',
    queries: [
      {
        name: 'Procurar global_role em profiles',
        sql: `SELECT column_name, data_type FROM information_schema.columns 
              WHERE table_name = 'profiles' AND column_name = 'global_role';`
      },
      {
        name: 'Todas as colunas de profiles com defaults',
        sql: `SELECT column_name, data_type, is_nullable, column_default 
              FROM information_schema.columns 
              WHERE table_name = 'profiles'
              ORDER BY ordinal_position;`
      }
    ]
  },
  {
    category: '2. VERIFICAR RLS E ESCALAÇÃO DE PRIVILÉGIOS',
    queries: [
      {
        name: 'RLS policies em profiles',
        sql: `SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
              FROM pg_policies WHERE tablename = 'profiles';`
      },
      {
        name: 'RLS em companies',
        sql: `SELECT COUNT(*) as rls_policies FROM pg_policies WHERE tablename = 'companies';`
      },
      {
        name: 'RLS em accounting_offices',
        sql: `SELECT COUNT(*) as rls_policies FROM pg_policies WHERE tablename = 'accounting_offices';`
      }
    ]
  },
  {
    category: '3. VERIFICAR FUNÇÕES SECURITY DEFINER',
    queries: [
      {
        name: 'Funções existentes com SECURITY DEFINER',
        sql: `SELECT proname, prosecdef, prosrc 
              FROM pg_proc 
              WHERE prosecdef = true 
              AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
              LIMIT 10;`
      },
      {
        name: 'Buscar is_admin() existente',
        sql: `SELECT proname, pronargs FROM pg_proc 
              WHERE proname LIKE 'is_admin%' 
              AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');`
      }
    ]
  },
  {
    category: '4. VERIFICAR RECURSÃO E CICLOS EM RLS',
    queries: [
      {
        name: 'Todas as policies que chamam SELECT em profiles',
        sql: `SELECT policyname, qual FROM pg_policies WHERE tablename = 'profiles' AND qual LIKE '%profiles%';`
      }
    ]
  },
  {
    category: '5. VERIFICAR IMUTABILIDADE DE AUDIT',
    queries: [
      {
        name: 'Tabela audit_logs já existe?',
        sql: `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') as exists;`
      },
      {
        name: 'Trigger on_auth_user_created',
        sql: `SELECT trigger_name, event_object_table, action_statement 
              FROM information_schema.triggers 
              WHERE trigger_name = 'on_auth_user_created';`
      }
    ]
  },
  {
    category: '6. VERIFICAR MFA NO SUPABASE AUTH',
    queries: [
      {
        name: 'Auth users structure',
        sql: `SELECT column_name, data_type 
              FROM information_schema.columns 
              WHERE table_name = 'users' AND table_schema = 'auth'
              ORDER BY column_name;`
      }
    ]
  },
  {
    category: '7. VERIFICAR CONSTRAINTS E VALIDAÇÕES',
    queries: [
      {
        name: 'Constraints em profiles',
        sql: `SELECT constraint_name, constraint_type 
              FROM information_schema.table_constraints 
              WHERE table_name = 'profiles';`
      },
      {
        name: 'Check constraints em profiles',
        sql: `SELECT constraint_name 
              FROM information_schema.constraint_column_usage 
              WHERE table_name = 'profiles';`
      }
    ]
  },
  {
    category: '8. VERIFICAR GRANTS E PAPÉIS',
    queries: [
      {
        name: 'Papéis (roles) do Supabase',
        sql: `SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'service_role', 'postgres') ORDER BY rolname;`
      },
      {
        name: 'Privilégios em profiles para papéis',
        sql: `SELECT grantee, privilege_type 
              FROM information_schema.role_table_grants 
              WHERE table_name = 'profiles' 
              ORDER BY grantee, privilege_type;`
      }
    ]
  },
  {
    category: '9. VERIFICAR ÍNDICES EXISTENTES',
    queries: [
      {
        name: 'Índices em profiles',
        sql: `SELECT indexname FROM pg_indexes WHERE tablename = 'profiles' ORDER BY indexname;`
      }
    ]
  },
  {
    category: '10. VERIFICAR TRIGGERS EXISTENTES',
    queries: [
      {
        name: 'Todos os triggers em profiles',
        sql: `SELECT trigger_name, event_object_table, event_manipulation 
              FROM information_schema.triggers 
              WHERE event_object_table = 'profiles' 
              ORDER BY trigger_name;`
      }
    ]
  }
];

async function executeQuery(sql) {
  return new Promise((resolve) => {
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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ error: data });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function audit() {
  console.log('\n🔐 REVISÃO TÉCNICA DE SEGURANÇA\n');
  console.log('═'.repeat(80) + '\n');

  for (const category of audits) {
    console.log(`\n${category.category}`);
    console.log('─'.repeat(80));

    for (const query of category.queries) {
      console.log(`\n   📌 ${query.name}`);
      const result = await executeQuery(query.sql);
      
      if (result.error) {
        console.log(`   ❌ ${result.error}`);
      } else if (Array.isArray(result) && result.length > 0) {
        console.log('   ' + JSON.stringify(result, null, 6).split('\n').join('\n   '));
      } else if (Array.isArray(result) && result.length === 0) {
        console.log('   (nenhum resultado)');
      } else {
        console.log('   ' + JSON.stringify(result, null, 6).split('\n').join('\n   '));
      }
      
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log('\n\n═'.repeat(80));
  console.log('✅ Auditoria concluída\n');
}

audit();
