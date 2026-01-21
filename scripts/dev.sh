#!/bin/bash
set -e

echo "Starting PostgreSQL container..."
docker compose up -d db

echo "Waiting for database to be ready..."
until docker compose exec -T db pg_isready -U postgres -d parted_euro_dev > /dev/null 2>&1; do
  sleep 1
done
echo "Database is ready!"

echo "Syncing Prisma schema..."
bunx prisma db push

echo "Starting Next.js dev server..."
exec bun run dev:next
