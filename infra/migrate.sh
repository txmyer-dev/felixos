#!/bin/sh
# Migration + user-provisioning entrypoint for the migrate service.
# Runs as the Postgres superuser; never called by api/web at runtime.
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"
export PGHOST=postgres
export PGPORT=5432
export PGDATABASE="$POSTGRES_DB"
export PGUSER="$POSTGRES_USER"

# Apply migration files in lexicographic order.
# The [ -e ] guard handles the POSIX-sh no-nullglob case: when /migrations/
# is empty, the glob expands to the literal string "*.sql"; -e rejects it.
count=0
for f in /migrations/*.sql; do
  [ -e "$f" ] || break
  echo "Applying $f"
  psql -f "$f"
  count=$((count + 1))
done
echo "Applied $count migration(s)"

# Provision a login user that inherits from a given group role.
# Values reach SQL via psql -v substitution (outside dollar-quoting) then
# set_config, so format('%I'/'%L') can safely escape them inside the DO block.
# This is safe against any username or password content, including quotes.
provision() {
  local group_role="$1" db_user="$2" db_pass="$3"
  psql -v u="$db_user" -v p="$db_pass" -v r="$group_role" <<'EOSQL'
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

# BYPASSRLS is not inherited from the group role, so it must be set explicitly on the login user.
psql -v u="$PRIV_DB_USER" <<'EOSQL'
SELECT set_config('prov.u', :'u', false);
DO $body$
BEGIN
  EXECUTE format('ALTER USER %I BYPASSRLS', current_setting('prov.u'));
END
$body$;
EOSQL

echo 'Bootstrap complete'
