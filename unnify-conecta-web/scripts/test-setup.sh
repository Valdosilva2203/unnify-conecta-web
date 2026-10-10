#!/bin/bash
# Test setup validation script - run before each session

echo "🧪 VALIDANDO SETUP DO AMBIENTE"
echo "================================"

# Test 1: Next.js server
echo -e "\n[1] Verificando servidor Next.js..."
if curl -s http://localhost:3000/login > /dev/null 2>&1; then
  echo "✅ Servidor rodando em localhost:3000"
else
  echo "❌ Servidor não está acessível"
  echo "   Execute: npm run dev"
  exit 1
fi

# Test 2: Playwright
echo -e "\n[2] Verificando Playwright..."
if npx playwright --version > /dev/null 2>&1; then
  echo "✅ Playwright instalado"
else
  echo "❌ Playwright não instalado"
  echo "   Execute: npm install"
  exit 1
fi

# Test 3: Build status
echo -e "\n[3] Verificando build..."
if npm run build > /dev/null 2>&1; then
  echo "✅ Build compila sem erros"
else
  echo "❌ Build com erros"
  exit 1
fi

echo -e "\n================================"
echo "✅ SETUP VALIDADO"
echo "Pronto para executar testes"
