#!/bin/bash
set -euo pipefail

RUN_PRECHECK=true
SYNC_MISMATCH=false

for arg in "$@"; do
  case "$arg" in
    --execute-only)
      RUN_PRECHECK=false
      ;;
    --sync-mismatch)
      SYNC_MISMATCH=true
      ;;
    --help)
      cat <<'EOF'
Apply Phase 4 schema changes safely.

Usage:
  bash scripts/apply-phase4-schema.sh
  bash scripts/apply-phase4-schema.sh --execute-only
  bash scripts/apply-phase4-schema.sh --sync-mismatch

Flags:
  --execute-only   Skip precheck dry-run and run execute path directly
  --sync-mismatch  Backfill both null and mismatched unitPrice values
  --help           Show this help
EOF
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg"
      exit 1
      ;;
  esac
done

SYNC_FLAG=""
if [ "$SYNC_MISMATCH" = true ]; then
  SYNC_FLAG="--sync-mismatch"
fi

echo "==> Phase 4 apply starting"
if [ -n "$SYNC_FLAG" ]; then
  echo "==> Backfill flags: $SYNC_FLAG"
else
  echo "==> Backfill flags: (none)"
fi

if [ "$RUN_PRECHECK" = true ]; then
  echo "==> Precheck (dry-run backfill)"
  if [ -n "$SYNC_FLAG" ]; then
    bun run scripts/backfill-order-item-unit-price.ts --dry-run "$SYNC_FLAG"
  else
    bun run scripts/backfill-order-item-unit-price.ts --dry-run
  fi
fi

echo "==> Executing backfill"
if [ -n "$SYNC_FLAG" ]; then
  bun run scripts/backfill-order-item-unit-price.ts --execute "$SYNC_FLAG"
else
  bun run scripts/backfill-order-item-unit-price.ts --execute
fi

echo "==> Verifying remaining null unitPrice rows"
POST_DRY_RUN_OUTPUT="$(bun run scripts/backfill-order-item-unit-price.ts --dry-run)"
echo "$POST_DRY_RUN_OUTPUT"

NULL_COUNT="$(printf '%s\n' "$POST_DRY_RUN_OUTPUT" | awk -F': ' '/Null unitPrice rows:/ {print $2; exit}')"
if [ -z "${NULL_COUNT:-}" ]; then
  echo "Could not determine null count from backfill output."
  exit 1
fi

if [ "$NULL_COUNT" != "0" ]; then
  echo "Aborting: $NULL_COUNT OrderItem rows still have null unitPrice."
  exit 1
fi

echo "==> Applying Prisma schema"
bunx prisma db push --accept-data-loss

echo "==> Regenerating Prisma client"
bunx prisma generate

echo "==> Phase 4 apply complete"
echo "Summary:"
echo "  Null unitPrice rows after backfill: $NULL_COUNT"
echo "  Prisma schema push: successful"
echo "  Prisma generate: successful"
