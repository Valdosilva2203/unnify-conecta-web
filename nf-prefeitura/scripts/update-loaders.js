#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const files = [
  "app/prefeituras/[id]/chamados/em-requisicao/page.tsx",
  "app/prefeituras/[id]/chamados/page.tsx",
  "app/prefeituras/[id]/chamados/fornecedor/[fornecedorId]/page.tsx",
  "app/fornecedor/prefeituras/page.tsx",
  "app/fornecedor/chamados/[chamadoId]/page.tsx",
  "app/fornecedor/cadastro/page.tsx",
];

files.forEach((file) => {
  const filePath = path.join(__dirname, "..", file);

  try {
    let content = fs.readFileSync(filePath, "utf-8");

    // Adicionar import se não tiver
    if (!content.includes("LoadingSpinner")) {
      const importLine = 'import LoadingSpinner from "@/app/components/LoadingSpinner";';
      content = content.replace(
        /import.*from.*"@\/app\/components\//,
        (match) => importLine + "\n" + match
      );
    }

    // Trocar loading screen
    content = content.replace(
      /if \(loading\) \{\s*return \(\s*<div className="min-h-screen bg-gray-100 flex items-center justify-center">\s*<div className="text-center">\s*<div className="animate-spin text-6xl mb-4">⏳<\/div>\s*<p className="text-gray-700 text-lg font-medium">([^"]+)<\/p>\s*<\/div>\s*<\/div>\s*\);\s*\}/g,
      'if (loading) {\n    return <LoadingSpinner message="$1" />;\n  }'
    );

    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`✅ ${file}`);
  } catch (error) {
    console.log(`⚠️  ${file} - ${error.message}`);
  }
});

console.log("\n✨ Done!");
