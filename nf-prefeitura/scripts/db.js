#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Carregar .env.local
const envFile = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, "utf-8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*(.+?)\s*=\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim();
    }
  });
}

// Rodar supabase-query.js
require("./supabase-query.js");
