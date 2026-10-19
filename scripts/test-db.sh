#!/usr/bin/env bash
# Aplica as migrações em um PostgreSQL temporário e executa os testes de RLS.
# Requer binários do PostgreSQL (initdb, pg_ctl, psql) no PATH ou em PG_BIN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"

RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  # o PostgreSQL não roda como root
  id postgres >/dev/null 2>&1 || useradd -r postgres
  chown -R postgres "$TMP"
  RUN_AS=(su postgres -s /bin/bash -c)
fi

run() {
  if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi
}

cleanup() {
  run "'$PG_BIN/pg_ctl' -D '$TMP/data' stop -m fast" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

run "'$PG_BIN/initdb' -D '$TMP/data' -U postgres --auth=trust >/dev/null"
run "'$PG_BIN/pg_ctl' -D '$TMP/data' -o '-p $PORT -k $TMP' -l '$TMP/log' start >/dev/null"

PSQL=("$PG_BIN/psql" -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migração $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "→ seed TACO"
"${PSQL[@]}" -f "$ROOT/supabase/seed/reference_foods_taco.sql"
echo "→ testes de RLS"
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //'
echo "Todos os testes de banco passaram."
