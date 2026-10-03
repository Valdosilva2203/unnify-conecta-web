# Carregar variáveis do .env.local
$envFile = Join-Path $PSScriptRoot "..\\.env.local"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*(.+?)\s*=\s*(.+)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim()
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

# Rodar script
& node (Join-Path $PSScriptRoot "supabase-query.js") @args
