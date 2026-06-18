#!/bin/bash
set -euo pipefail

readonly ENV_FILE=".env"
readonly SOURCE_ENV_VAR="PROD_DB_URL"
readonly LOCAL_DB_SERVICE="db"
readonly LOCAL_DB_NAME="parted_euro_dev"
readonly LOCAL_DB_USER="postgres"
readonly DUMP_PATH="/tmp/prod_backup.dump"

read_env_var() {
  local key="$1"
  local line
  line=$(grep -m 1 -E "^${key}=" "$ENV_FILE" || true)

  if [ -z "$line" ]; then
    return 1
  fi

  local value="${line#*=}"
  value="${value%$'\r'}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf "%s" "$value"
}

clean_postgres_url_for_pg_tools() {
  local url="$1"

  # Prisma's schema= URL param is not a libpq connection option, so pg_dump
  # receives it separately via --schema below.
  printf "%s" "$url" | sed -E 's/([?&])schema=[^&]*&?/\1/g; s/\?&/?/; s/[?&]$//'
}

extract_query_param() {
  local url="$1"
  local key="$2"
  local query="${url#*\?}"

  if [ "$query" = "$url" ]; then
    return 1
  fi

  query="${query%%#*}"

  local old_ifs="$IFS"
  local pair
  IFS="&"
  for pair in $query; do
    IFS="$old_ifs"
    if [ "${pair%%=*}" = "$key" ]; then
      printf "%s" "${pair#*=}"
      return 0
    fi
    IFS="&"
  done
  IFS="$old_ifs"

  return 1
}

cleanup() {
  docker compose exec -T "$LOCAL_DB_SERVICE" rm -f "$DUMP_PATH" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# DATABASE_URL is intentionally unused. The env file may only provide the
# read-only source URL; the restore target is the local Docker database below.
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE file not found"
  exit 1
fi

PROD_URL=$(read_env_var "$SOURCE_ENV_VAR" || true)

if [ -z "$PROD_URL" ]; then
  echo "Error: $SOURCE_ENV_VAR not found in $ENV_FILE"
  exit 1
fi

PROD_URL_FOR_DUMP=$(clean_postgres_url_for_pg_tools "$PROD_URL")
PROD_SCHEMA=$(extract_query_param "$PROD_URL" "schema" || true)

case "$PROD_URL_FOR_DUMP" in
  postgres://*|postgresql://*) ;;
  *)
    echo "Error: $SOURCE_ENV_VAR must be a Postgres connection string"
    exit 1
    ;;
esac

DUMP_SCHEMA_ARGS=()
if [ -n "$PROD_SCHEMA" ]; then
  DUMP_SCHEMA_ARGS=(--schema="$PROD_SCHEMA")
fi

echo "Dumping source database from $SOURCE_ENV_VAR using a read-only pg_dump session..."
if [ -n "$PROD_SCHEMA" ]; then
  echo "Detected Prisma schema '$PROD_SCHEMA'; dumping only that schema."
fi
docker compose exec -T \
  -e PGOPTIONS="-c default_transaction_read_only=on" \
  "$LOCAL_DB_SERVICE" \
  pg_dump \
  --dbname="$PROD_URL_FOR_DUMP" \
  --format=custom \
  --no-owner \
  --no-acl \
  "${DUMP_SCHEMA_ARGS[@]}" \
  --file="$DUMP_PATH"

echo "Dropping and recreating local Docker database '$LOCAL_DB_NAME'..."
docker compose exec -T "$LOCAL_DB_SERVICE" psql \
  --username="$LOCAL_DB_USER" \
  --dbname=postgres \
  --set=ON_ERROR_STOP=1 \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB_NAME' AND pid <> pg_backend_pid();"
docker compose exec -T "$LOCAL_DB_SERVICE" psql \
  --username="$LOCAL_DB_USER" \
  --dbname=postgres \
  --set=ON_ERROR_STOP=1 \
  --command="DROP DATABASE IF EXISTS \"$LOCAL_DB_NAME\";"
docker compose exec -T "$LOCAL_DB_SERVICE" psql \
  --username="$LOCAL_DB_USER" \
  --dbname=postgres \
  --set=ON_ERROR_STOP=1 \
  --command="CREATE DATABASE \"$LOCAL_DB_NAME\";"

echo "Restoring dump into local Docker database '$LOCAL_DB_NAME'..."
docker compose exec -T "$LOCAL_DB_SERVICE" pg_restore \
  --dbname="$LOCAL_DB_NAME" \
  --username="$LOCAL_DB_USER" \
  --no-owner \
  --no-acl \
  "$DUMP_PATH"

echo "Done. Local database '$LOCAL_DB_NAME' populated from $SOURCE_ENV_VAR."
