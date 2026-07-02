#!/bin/sh
# Migration + user-provisioning entrypoint for the migrate service.
# Runs as the Postgres superuser; never called by api/web at runtime.
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"
export PGHOST=postgres
export PGPORT=5432
export PGDATABASE="$POSTGRES_DB"
export PGUSER="$POSTGRES_USER"

# Track applied files: this service re-runs on every `docker compose up`
# against a persistent volume, and the migration files are not idempotent —
# replaying them would error. ON_ERROR_STOP is required throughout because
# plain `psql -f` exits 0 even when statements fail.
psql -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE TABLE IF NOT EXISTS felixos_schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
EOSQL

# Apply new migration files in lexicographic order.
# The [ -e ] guard handles the POSIX-sh no-nullglob case: when /migrations/
# is empty, the glob expands to the literal string "*.sql"; -e rejects it.
count=0
skipped=0
for f in /migrations/*.sql; do
  [ -e "$f" ] || break
  name=${f##*/}
  # psql only interpolates :'var' in -f scripts and stdin, never in -c.
  applied=$(psql -v ON_ERROR_STOP=1 -v migration="$name" -AtX <<'EOSQL'
SELECT 1 FROM felixos_schema_migrations WHERE filename = :'migration';
EOSQL
  )
  if [ "$applied" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "Applying $name"
  # --single-transaction makes apply + ledger insert atomic, so a crash
  # mid-file can never record a migration it did not fully apply.
  psql -v ON_ERROR_STOP=1 --single-transaction -v migration="$name" \
    -f "$f" -f /dev/stdin <<'EOSQL'
INSERT INTO felixos_schema_migrations (filename) VALUES (:'migration');
EOSQL
  count=$((count + 1))
done
echo "Applied $count migration(s), skipped $skipped already applied"

# Provision a login user that inherits from a given group role.
# Values reach SQL via psql -v substitution (outside dollar-quoting) then
# set_config, so format('%I'/'%L') can safely escape them inside the DO block.
# This is safe against any username or password content, including quotes.
provision() {
  local group_role="$1" db_user="$2" db_pass="$3"
  # -o /dev/null: the set_config SELECT echoes the password in its result
  # row, which would land in container logs otherwise. VERBOSITY terse
  # keeps error CONTEXT lines (which quote the CREATE USER ... PASSWORD
  # statement) out of the logs too.
  psql -o /dev/null -v ON_ERROR_STOP=1 \
    -v u="$db_user" -v p="$db_pass" -v r="$group_role" <<'EOSQL'
\set VERBOSITY terse
SELECT set_config('prov.u', :'u', false),
       set_config('prov.p', :'p', false),
       set_config('prov.r', :'r', false);
DO $body$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = current_setting('prov.u')) THEN
    EXECUTE format(
      'CREATE USER %I WITH LOGIN PASSWORD %L IN ROLE %I',
      current_setting('prov.u'), current_setting('prov.p'), current_setting('prov.r')
    );
  ELSE
    EXECUTE format('ALTER USER %I WITH PASSWORD %L',
      current_setting('prov.u'), current_setting('prov.p'));
  END IF;
END
$body$;
EOSQL
}

provision felixos_app_role        "$APP_DB_USER"  "$APP_DB_PASS"
provision felixos_privileged_role "$PRIV_DB_USER" "$PRIV_DB_PASS"
echo 'Bootstrap complete'
