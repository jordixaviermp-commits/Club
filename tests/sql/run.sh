#!/usr/bin/env bash
# Prueba supabase/schema.sql en un PostgreSQL 16 temporal (solo para desarrollo).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin=/usr/lib/postgresql/16/bin
tmp="$(mktemp -d)"
chown postgres "$tmp" 2>/dev/null || true
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
as_pg "$bin/initdb -D $tmp/data -U postgres >/dev/null"
as_pg "$bin/pg_ctl -D $tmp/data -o '-k $tmp -p 54329 -c listen_addresses=' -l $tmp/log start -w >/dev/null"
trap 'as_pg "$bin/pg_ctl -D $tmp/data stop -m fast >/dev/null"; rm -rf "$tmp"' EXIT
psql="psql -X -q -t -h $tmp -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1"
$psql -f "$here/supabase_stub.sql"
$psql -f "$here/../../supabase/schema.sql"
$psql -f "$here/../../supabase/schema.sql"   # debe poder ejecutarse dos veces
$psql -f "$here/test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
