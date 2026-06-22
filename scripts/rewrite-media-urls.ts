/**
 * Rewrite legacy image URLs (Cloudinary + UploadThing) to their new R2 URLs in
 * the database. Run AFTER scripts/migrate-media-to-r2.ts has copied the bytes
 * into R2 (the bytes must exist before the DB points at them).
 *
 * Uses the SAME key derivation as the scrape (scripts/lib/legacy-media.ts), so
 * every rewritten URL points at an object the scrape created.
 *
 * Dry-run by default. Nothing is written without --execute.
 *
 * Targets PROD_DB_URL from .env by default (no connection flag needed):
 *
 *   bun run scripts/rewrite-media-urls.ts            # dry run against PROD_DB_URL
 *   bun run scripts/rewrite-media-urls.ts --execute  # apply to PROD_DB_URL
 *
 *   # Or point at a specific database explicitly (e.g. a local DB):
 *   bun run scripts/rewrite-media-urls.ts --database-url="postgres://…" --execute
 *
 * Idempotent: rows already on the R2 host are ignored, so re-runs are safe.
 */
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  extractUrls,
  isLegacyMediaUrl,
  rewriteLegacyUrl,
} from "./lib/legacy-media";

// Manifest written by migrate-media-to-r2.ts; used to detect failed uploads
// before we point DB rows at R2 objects that may not exist.
const MANIFEST_PATH = "scripts/data/r2-migration-manifest.jsonl";
const manifestLineSchema = z.object({ status: z.string(), key: z.string() });

type Args = {
  execute: boolean;
  force: boolean;
  databaseUrl: string | null;
  mediaBase: string | null;
};

function parseArgs(argv: string[]): Args {
  let execute = false;
  let force = false;
  let databaseUrl: string | null = null;
  let mediaBase: string | null = null;
  for (const arg of argv) {
    if (arg === "--execute") execute = true;
    else if (arg === "--force") force = true;
    else if (arg.startsWith("--database-url="))
      databaseUrl = arg.slice("--database-url=".length);
    else if (arg.startsWith("--media-base="))
      mediaBase = arg.slice("--media-base=".length);
  }
  return { execute, force, databaseUrl, mediaBase };
}

// Count scrape errors whose key never subsequently uploaded (bytes missing in
// R2). Returns null when there is no manifest to check.
function countUnresolvedScrapeErrors(): number | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  const done = new Set<string>();
  const errorKeys: string[] = [];
  for (const line of readFileSync(MANIFEST_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = manifestLineSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (
      parsed.data.status === "uploaded" ||
      parsed.data.status === "skipped-exists"
    ) {
      done.add(parsed.data.key);
    } else if (parsed.data.status === "error") {
      errorKeys.push(parsed.data.key);
    }
  }
  return errorKeys.filter((key) => key === "" || !done.has(key)).length;
}

function redact(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    const auth = u.username ? `${u.username}:***@` : "";
    return `${u.protocol}//${auth}${u.host}${u.pathname}`;
  } catch {
    return "<unparseable database url>";
  }
}

const CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Defaults to PROD_DB_URL from .env so the prod rewrite needs no flags;
  // --database-url overrides it (e.g. to target a local DB).
  const databaseUrl = args.databaseUrl ?? process.env.PROD_DB_URL ?? null;
  if (!databaseUrl) {
    console.error(
      "No database URL. Set PROD_DB_URL in .env, or pass --database-url=.",
    );
    process.exit(1);
  }

  const mediaBase =
    args.mediaBase ??
    process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL ??
    process.env.R2_PUBLIC_BASE_URL ??
    null;
  if (!mediaBase) {
    console.error(
      "No media base URL. Pass --media-base= or set NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL / R2_PUBLIC_BASE_URL.",
    );
    process.exit(1);
  }

  console.log("=== Media URL rewrite ===");
  console.log(`Target DB : ${redact(databaseUrl)}`);
  console.log(`Media base: ${mediaBase}`);
  console.log(`Mode      : ${args.execute ? "EXECUTE (writing)" : "DRY RUN (no writes)"}`);
  console.log("");

  // Don't point rows at R2 objects the scrape failed to upload.
  const unresolvedErrors = countUnresolvedScrapeErrors();
  if (unresolvedErrors === null) {
    console.log(
      `⚠ No scrape manifest at ${MANIFEST_PATH}. Cannot verify the bytes are in R2 — ensure migrate-media-to-r2.ts ran successfully first.\n`,
    );
  } else if (unresolvedErrors > 0) {
    console.log(`⚠ Scrape manifest has ${unresolvedErrors} unresolved upload error(s).`);
    if (args.execute && !args.force) {
      console.error(
        "Refusing to --execute: those rows would point at R2 objects that were never uploaded. Re-run the scrape to clear the errors, or pass --force to override.\n",
      );
      process.exit(1);
    }
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  try {
    const summary: Record<string, { candidates: number; toUpdate: number }> = {};
    const samples: Array<{ from: string; to: string }> = [];
    const noteSample = (from: string, to: string) => {
      if (samples.length < 8) samples.push({ from, to });
    };

    // --- Plain URL columns (Image, HomepageImage, ContactPage) ---
    // Image
    {
      const rows = await prisma.image.findMany({
        where: {
          OR: [
            { url: { contains: "res.cloudinary.com" } },
            { url: { contains: "utfs.io" } },
          ],
        },
        select: { id: true, url: true },
      });
      const updates = rows
        .map((r) => ({ id: r.id, url: r.url, to: rewriteLegacyUrl(mediaBase, r.url) }))
        .filter((u): u is { id: string; url: string; to: string } =>
          Boolean(u.to && u.to !== u.url),
        );
      summary.image = { candidates: rows.length, toUpdate: updates.length };
      updates.slice(0, 2).forEach((u) => noteSample(u.url, u.to));
      if (args.execute && updates.length > 0) {
        let done = 0;
        for (const batch of chunk(updates, CHUNK)) {
          await prisma.$transaction(
            batch.map((u) =>
              prisma.image.update({ where: { id: u.id }, data: { url: u.to } }),
            ),
          );
          done += batch.length;
          console.log(`  Image: ${done}/${updates.length}`);
        }
      }
    }

    // HomepageImage
    {
      const rows = await prisma.homepageImage.findMany({
        where: {
          OR: [
            { url: { contains: "res.cloudinary.com" } },
            { url: { contains: "utfs.io" } },
          ],
        },
        select: { id: true, url: true },
      });
      const updates = rows
        .map((r) => ({ id: r.id, url: r.url, to: rewriteLegacyUrl(mediaBase, r.url) }))
        .filter((u): u is { id: string; url: string; to: string } =>
          Boolean(u.to && u.to !== u.url),
        );
      summary.homepageImage = { candidates: rows.length, toUpdate: updates.length };
      updates.slice(0, 1).forEach((u) => noteSample(u.url, u.to));
      if (args.execute && updates.length > 0) {
        for (const batch of chunk(updates, CHUNK)) {
          await prisma.$transaction(
            batch.map((u) =>
              prisma.homepageImage.update({ where: { id: u.id }, data: { url: u.to } }),
            ),
          );
        }
      }
    }

    // ContactPage.heroImageUrl
    {
      const rows = await prisma.contactPage.findMany({
        select: { id: true, heroImageUrl: true },
      });
      const updates = rows
        .filter((r) => r.heroImageUrl && isLegacyMediaUrl(r.heroImageUrl))
        .map((r) => ({
          id: r.id,
          url: r.heroImageUrl ?? "",
          to: rewriteLegacyUrl(mediaBase, r.heroImageUrl ?? ""),
        }))
        .filter((u): u is { id: string; url: string; to: string } =>
          Boolean(u.to && u.to !== u.url),
        );
      summary.contactPage = { candidates: rows.length, toUpdate: updates.length };
      updates.forEach((u) => noteSample(u.url, u.to));
      if (args.execute) {
        for (const u of updates) {
          await prisma.contactPage.update({
            where: { id: u.id },
            data: { heroImageUrl: u.to },
          });
        }
      }
    }

    // --- Embedded URLs in text/HTML columns ---
    const rewriteEmbedded = (text: string): string => {
      let result = text;
      for (const url of new Set(extractUrls(text))) {
        const to = rewriteLegacyUrl(mediaBase, url);
        if (to && to !== url) result = result.split(url).join(to);
      }
      return result;
    };

    // EbaySettings.listingTemplate
    {
      const rows = await prisma.ebaySettings.findMany({
        select: { id: true, listingTemplate: true },
      });
      const updates = rows
        .map((r) => ({ id: r.id, next: rewriteEmbedded(r.listingTemplate), prev: r.listingTemplate }))
        .filter((u) => u.next !== u.prev);
      summary.ebaySettingsTemplate = { candidates: rows.length, toUpdate: updates.length };
      if (args.execute) {
        for (const u of updates) {
          await prisma.ebaySettings.update({
            where: { id: u.id },
            data: { listingTemplate: u.next },
          });
        }
      }
    }

    // Listing.description (defensive — none observed, but cheap to cover)
    {
      const rows = await prisma.listing.findMany({
        where: {
          OR: [
            { description: { contains: "res.cloudinary.com" } },
            { description: { contains: "utfs.io" } },
          ],
        },
        select: { id: true, description: true },
      });
      const updates = rows
        .map((r) => ({ id: r.id, next: rewriteEmbedded(r.description), prev: r.description }))
        .filter((u) => u.next !== u.prev);
      summary.listingDescription = { candidates: rows.length, toUpdate: updates.length };
      if (args.execute) {
        for (const u of updates) {
          await prisma.listing.update({
            where: { id: u.id },
            data: { description: u.next },
          });
        }
      }
    }

    console.log("\n=== Summary ===");
    console.log(JSON.stringify(summary, null, 2));
    if (samples.length > 0) {
      console.log("\nSample rewrites:");
      for (const s of samples) console.log(`  ${s.from}\n    -> ${s.to}`);
    }
    if (!args.execute) {
      console.log("\nDry run only. Re-run with --execute to apply.");
    } else {
      console.log("\nDone.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
