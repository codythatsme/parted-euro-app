#!/bin/bash
set -e

# Load production DATABASE_URL from .env
if [ ! -f .env ]; then
  echo "Error: .env file not found"
  exit 1
fi

PROD_URL=$(grep "^DATABASE_URL=" .env | cut -d '=' -f 2- | tr -d '"')

if [ -z "$PROD_URL" ]; then
  echo "Error: DATABASE_URL not found in .env"
  exit 1
fi

# Strip query params (e.g., ?schema=partedeuro)
PROD_URL_CLEAN="${PROD_URL%%\?*}"

echo "Dumping production database (via Docker)..."
docker compose exec -T db pg_dump "$PROD_URL_CLEAN" -Fc --no-owner --no-acl -f /tmp/prod_backup.dump

echo "Dropping and recreating local database..."
docker compose exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS parted_euro_dev;"
docker compose exec -T db psql -U postgres -c "CREATE DATABASE parted_euro_dev;"

echo "Restoring to local database..."
docker compose exec -T db pg_restore -d parted_euro_dev -U postgres --no-owner --no-acl /tmp/prod_backup.dump || true

echo "Cleaning up..."
docker compose exec -T db rm -f /tmp/prod_backup.dump

echo "Done! Local database populated with production data."
