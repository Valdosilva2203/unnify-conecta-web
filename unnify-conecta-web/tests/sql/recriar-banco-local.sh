#!/usr/bin/env bash
# Recria o banco LOCAL de testes (nunca a produção): restaura um backup do Supabase e aplica migrations pendentes.
#
# Requisitos: binários do PostgreSQL 17 (pg_ctl/psql/pg_restore) e um servidor local já iniciado em localhost:55432.
#   PG_BIN=/caminho/pgsql/bin  BACKUP=/caminho/arquivo.dump  bash tests/sql/recriar-banco-local.sh 20261013000029_seguranca_e0 ...
# Depois: node tests/sql/classificacao-financeira.mjs
set -euo pipefail
: "${PG_BIN:?defina PG_BIN com a pasta bin do PostgreSQL 17}"
BACKUP="${BACKUP:-$(cat "C:/Users/DELL/Documents/Backups-Unnify/ultimo.txt")}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
P="$PG_BIN/psql -h localhost -p 55432 -U postgres -q"

$P -c "drop database if exists unnify_local" -c "create database unnify_local"
# Papéis que o Supabase usa nas políticas e permissões
for r in anon authenticated service_role authenticator supabase_admin supabase_auth_admin supabase_storage_admin dashboard_user pgbouncer \
         supabase_realtime_admin supabase_replication_admin supabase_read_only_user supabase_etl_admin supabase_functions_admin supabase_privileged_role; do
  $P -c "create role $r nologin" 2>/dev/null || true
done
$P -c "grant anon, authenticated, service_role to postgres" -c "alter role service_role bypassrls" 2>/dev/null || true

"$PG_BIN/pg_restore" -h localhost -p 55432 -U postgres -d unnify_local --no-owner "$BACKUP" > /tmp/unnify-restore.log 2>&1 || true
echo "restore: $(grep -c 'error:' /tmp/unnify-restore.log || true) erros (esperados: os do supabase_vault, que o projeto não usa)"

for f in "$@"; do
  arquivo="$RAIZ/supabase/migrations/$f.sql"
  if (echo "BEGIN;"; cat "$arquivo"; echo "COMMIT;") | $P -d unnify_local -v ON_ERROR_STOP=1 > /dev/null; then echo "$f: OK"; else echo "$f: FALHOU"; exit 1; fi
done
