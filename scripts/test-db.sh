#!/usr/bin/env bash
# Testa as migrations num Postgres.
#  - Com DATABASE_URL definido (ex.: CI), usa esse banco.
#  - Sem DATABASE_URL, sobe um Postgres temporário local (precisa de initdb/pg_ctl no PATH ou em /usr/lib/postgresql/*/bin).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run_suite() {
  local url="$1"
  psql "$url" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/supabase_shim.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    psql "$url" -v ON_ERROR_STOP=1 -q -f "$f"
  done
  psql "$url" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/db_test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  run_suite "$DATABASE_URL"
  exit 0
fi

PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUNAS=()
if [[ "$(id -u)" == "0" ]]; then
  # initdb não roda como root
  chown -R postgres "$TMP" 2>/dev/null || { useradd -m pgtest 2>/dev/null || true; chown -R pgtest "$TMP"; }
  RUNAS=(su "$(stat -c %U "$TMP")" -c)
fi

as_pg() { if [[ ${#RUNAS[@]} -gt 0 ]]; then "${RUNAS[@]}" "$*"; else bash -c "$*"; fi; }

cleanup() { as_pg "$PGBIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $TMP/data -U postgres --auth=trust" >/dev/null
as_pg "$PGBIN/pg_ctl -D $TMP/data -o '-p $PORT -k $TMP -c listen_addresses=' -l $TMP/log -w start" >/dev/null
as_pg "$PGBIN/createdb -h $TMP -p $PORT -U postgres app"

run_suite "postgresql://postgres@/app?host=$TMP&port=$PORT"
