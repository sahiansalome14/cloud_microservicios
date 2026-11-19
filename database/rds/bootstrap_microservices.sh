#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/bootstrap.env"

CREATE_ROLES_SQL="${SCRIPT_DIR}/create_roles.sql"
GRANTS_SQL="${SCRIPT_DIR}/grants_microservices.sql"
SCHEMA_SQL="${DATABASE_DIR}/schema_microservices.sql"
SEED_SQL="${DATABASE_DIR}/seed_microservices.sql"

log() {
    printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

fail() {
    printf '\nERROR: %s\n' "$1" >&2
    exit 1
}

run_sql_file() {
    local sql_file="$1"
    [[ -f "${sql_file}" ]] || fail "SQL file not found: ${sql_file}"
    psql -X -v ON_ERROR_STOP=1 -f "${sql_file}"
}

if [[ -z "${DB_HOST:-}" ]]; then
    [[ -f "${ENV_FILE}" ]] || fail "No database configuration provided."
    log "Loading configuration from bootstrap.env"
    set -a
    source "${ENV_FILE}"
    set +a
else
    log "Using database configuration from environment variables"
fi

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=bookstore}"
: "${DB_ADMIN_USER:?DB_ADMIN_USER is required}"
: "${DB_ADMIN_PASSWORD:?DB_ADMIN_PASSWORD is required}"
: "${APP_DB_USER:=bookstore_app}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${INGEST_DB_USER:=bookstore_ingest}"
: "${INGEST_DB_PASSWORD:?INGEST_DB_PASSWORD is required}"
: "${PGSSLMODE:=require}"

export PGHOST="${DB_HOST}"
export PGPORT="${DB_PORT}"
export PGDATABASE="${DB_NAME}"
export PGUSER="${DB_ADMIN_USER}"
export PGPASSWORD="${DB_ADMIN_PASSWORD}"
export PGSSLMODE="${PGSSLMODE}"

log "Testing connection to PostgreSQL"
psql -X -v ON_ERROR_STOP=1 -c "SELECT current_database(), current_user;" >/dev/null
log "Connection successful"

log "Creating or reconciling runtime roles"
psql -X -v ON_ERROR_STOP=1 \
    -v app_user="${APP_DB_USER}" \
    -v app_password="${APP_DB_PASSWORD}" \
    -v ingest_user="${INGEST_DB_USER}" \
    -v ingest_password="${INGEST_DB_PASSWORD}" \
    -f "${CREATE_ROLES_SQL}"

log "Creating microservices schemas (schema_auth, schema_catalog, schema_orders)"
run_sql_file "${SCHEMA_SQL}"

log "Configuring runtime privileges across schemas"
psql -X -v ON_ERROR_STOP=1 \
    -v db_name="${DB_NAME}" \
    -v app_user="${APP_DB_USER}" \
    -v ingest_user="${INGEST_DB_USER}" \
    -f "${GRANTS_SQL}"

log "Loading minimal seed data into schemas"
run_sql_file "${SEED_SQL}"

unset PGPASSWORD
log "BookStore Co. Microservices database bootstrap completed successfully"
