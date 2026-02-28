import { PrismaClient } from "@prisma/client";


type ScriptMode = "dry-run" | "execute";

type ScriptOptions = {
  mode: ScriptMode;
  syncMismatch: boolean;
};

type CountResult = {
  count: bigint;
};

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

const printUsage = () => {
  console.log("Backfill OrderItem.unitPrice from Listing.price");
  console.log("");
  console.log("Usage:");
  console.log("  bun run scripts/backfill-order-item-unit-price.ts --dry-run");
  console.log("  bun run scripts/backfill-order-item-unit-price.ts --execute");
  console.log("");
  console.log("Flags:");
  console.log("  --dry-run        Report rows that would be updated (default)");
  console.log("  --execute        Apply updates");
  console.log("  --sync-mismatch  Also fix rows where unitPrice != listing.price");
  console.log("  --help           Show this help");
};

const parseOptions = (args: string[]): ScriptOptions => {
  const argSet = new Set(args);
  const wantsHelp = argSet.has("--help");

  if (wantsHelp) {
    printUsage();
    process.exit(0);
  }

  const wantsDryRun = argSet.has("--dry-run");
  const wantsExecute = argSet.has("--execute");

  if (wantsDryRun && wantsExecute) {
    throw new Error("Use either --dry-run or --execute, not both.");
  }

  return {
    mode: wantsExecute ? "execute" : "dry-run",
    syncMismatch: argSet.has("--sync-mismatch"),
  };
};

const toNumber = (value: bigint): number => Number(value);

const getNullCount = async (): Promise<number> => {
  const rows = await prisma.$queryRaw<CountResult[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "OrderItem" oi
    WHERE oi."unitPrice" IS NULL
  `;
  return toNumber(rows[0]?.count ?? BigInt(0));
};

const getDistinctCount = async (): Promise<number> => {
  const rows = await prisma.$queryRaw<CountResult[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "OrderItem" oi
    INNER JOIN "Listing" l ON l."id" = oi."listingId"
    WHERE oi."unitPrice" IS DISTINCT FROM l."price"
  `;
  return toNumber(rows[0]?.count ?? BigInt(0));
};

const getMismatchCount = async (): Promise<number> => {
  const rows = await prisma.$queryRaw<CountResult[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "OrderItem" oi
    INNER JOIN "Listing" l ON l."id" = oi."listingId"
    WHERE oi."unitPrice" IS NOT NULL
      AND oi."unitPrice" <> l."price"
  `;
  return toNumber(rows[0]?.count ?? BigInt(0));
};

const applyBackfill = async (syncMismatch: boolean): Promise<number> => {
  if (syncMismatch) {
    const updated = await prisma.$executeRaw`
      UPDATE "OrderItem" oi
      SET "unitPrice" = l."price"
      FROM "Listing" l
      WHERE l."id" = oi."listingId"
        AND oi."unitPrice" IS DISTINCT FROM l."price"
    `;
    return updated;
  }

  const updated = await prisma.$executeRaw`
    UPDATE "OrderItem" oi
    SET "unitPrice" = l."price"
    FROM "Listing" l
    WHERE l."id" = oi."listingId"
      AND oi."unitPrice" IS NULL
  `;
  return updated;
};

const run = async () => {
  const options = parseOptions(process.argv.slice(2));

  console.log(`Mode: ${options.mode}`);
  console.log(`Sync mismatches: ${options.syncMismatch ? "yes" : "no"}`);

  const [nullCountBefore, mismatchCountBefore, distinctCountBefore] =
    await Promise.all([getNullCount(), getMismatchCount(), getDistinctCount()]);

  const pendingCountBefore = options.syncMismatch
    ? distinctCountBefore
    : nullCountBefore;

  console.log("");
  console.log("Before:");
  console.log(`  Null unitPrice rows: ${nullCountBefore}`);
  console.log(`  Non-null mismatches: ${mismatchCountBefore}`);
  console.log(`  Total distinct rows: ${distinctCountBefore}`);
  console.log(`  Pending updates (${options.mode} target): ${pendingCountBefore}`);

  if (options.mode === "dry-run") {
    return;
  }

  const updated = await applyBackfill(options.syncMismatch);

  const [nullCountAfter, mismatchCountAfter, distinctCountAfter] =
    await Promise.all([getNullCount(), getMismatchCount(), getDistinctCount()]);

  console.log("");
  console.log("After:");
  console.log(`  Updated rows: ${updated}`);
  console.log(`  Null unitPrice rows: ${nullCountAfter}`);
  console.log(`  Non-null mismatches: ${mismatchCountAfter}`);
  console.log(`  Total distinct rows: ${distinctCountAfter}`);

  if (nullCountAfter > 0) {
    process.exitCode = 2;
  }
};

const main = async () => {
  try {
    await prisma.$connect();
    await run();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unknown backfill error",
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

void main();
