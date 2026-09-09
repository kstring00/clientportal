#!/usr/bin/env bash
#
# Applies the migrations to a scratch database and runs the SQL tests against
# it. These are the checks that prove the two security promises the portal
# makes: one client cannot see another's rows, and ownership cannot transfer
# before the final payment clears.
#
# They need a real PostgreSQL — RLS and triggers cannot be tested with a stub,
# and a harness that stubs the database proves only that the SQL was typed, not
# that it holds.
#
# Usage:
#   scripts/run-sql-tests.sh                       # local postgres on :5432
#   PGHOST=/tmp PGPORT=5433 scripts/run-sql-tests.sh
#   DATABASE_URL=postgres://... scripts/run-sql-tests.sh
#
# Against a real Supabase project, skip the shim:
#   SKIP_SHIM=1 DATABASE_URL="$SUPABASE_DB_URL" scripts/run-sql-tests.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

TEST_DB="${TEST_DB:-portal_sql_tests}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)
  echo "Using DATABASE_URL"
else
  ADMIN=(psql -U "${PGUSER:-postgres}" -d postgres -v ON_ERROR_STOP=1 -X -q)
  echo "Recreating scratch database ${TEST_DB}"
  "${ADMIN[@]}" -c "drop database if exists ${TEST_DB};"
  "${ADMIN[@]}" -c "create database ${TEST_DB};"
  PSQL=(psql -U "${PGUSER:-postgres}" -d "$TEST_DB" -v ON_ERROR_STOP=1 -X -q)
fi

if [[ "${SKIP_SHIM:-0}" != "1" ]]; then
  echo "→ supabase/tests/00_local_shim.sql"
  "${PSQL[@]}" -f supabase/tests/00_local_shim.sql
fi

for migration in supabase/migrations/*.sql; do
  echo "→ $migration"
  "${PSQL[@]}" -f "$migration"
done

# Each check reports itself as a NOTICE. psql prefixes those with file:line,
# which is noise when they all pass and unnecessary when one fails (the raised
# exception carries the label), so strip the prefix and keep the message.
clean() {
  sed -u -E 's/^psql:[^:]+:[0-9]+: NOTICE:  /  /; s/^psql:[^:]+:[0-9]+: ERROR:  /  ERROR /'
}

status=0
for test_file in supabase/tests/0[1-9]_*.sql; do
  echo
  echo "== $test_file"
  if ! "${PSQL[@]}" -f "$test_file" 2>&1 | clean; then
    status=1
    echo "   FAILED: $test_file"
  fi
done

echo
if [[ $status -eq 0 ]]; then
  echo "All SQL tests passed."
else
  echo "SQL tests FAILED."
fi
exit $status
