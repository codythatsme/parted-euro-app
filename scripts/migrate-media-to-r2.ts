/**
 * Bulk-migrate every legacy image (Cloudinary + UploadThing) referenced in the
 * LOCAL database into Cloudflare R2.
 *
 * This only moves BYTES into R2 (idempotent, resumable). It does NOT touch the
 * database — rewriting the stored URLs is a separate step
 * (scripts/rewrite-media-urls.ts), so this is safe to run against the R2 bucket
 * that prod will also use.
 *
 *   bun run scripts/migrate-media-to-r2.ts            # full run
 *   bun run scripts/migrate-media-to-r2.ts --limit=20 # smoke test (first 20)
 *   bun run scripts/migrate-media-to-r2.ts --dry-run  # report, no uploads
 *   bun run scripts/migrate-media-to-r2.ts --concurrency=32
 *
 * Resumable: already-uploaded keys (recorded in the manifest, or present in R2)
 * are skipped, so you can re-run after an interruption.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { imageSize } from "image-size";
import { z } from "zod";
import { db } from "~/server/db";
import { mediaExists, putMedia } from "~/lib/r2";
import {
  extractUrls,
  isLegacyMediaUrl,
  parseLegacyUrl,
} from "./lib/legacy-media";

const MANIFEST_PATH = "scripts/data/r2-migration-manifest.jsonl";
const EBAY_LOGO_URL =
  "https://res.cloudinary.com/dzhmqfmzi/image/upload/v1681223001/Logo_PARTED_EURO_jmszpz.png";

type Args = {
  dryRun: boolean;
  limit: number | null;
  concurrency: number;
};

type Outcome =
  | { url: string; key: string; status: "uploaded"; bytes: number; contentType: string }
  | { url: string; key: string; status: "skipped-exists" }
  | { url: string; key: string; status: "skipped-manifest" }
  | { url: string; key: string; status: "would-upload" }
  | { url: string; key: string; status: "error"; error: string };

function parseArgs(argv: string[]): Args {
  let dryRun = false;
  let limit: number | null = null;
  let concurrency = 24;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--limit=")) limit = Number(arg.slice("--limit=".length));
    else if (arg.startsWith("--concurrency="))
      concurrency = Number(arg.slice("--concurrency=".length));
  }
  return { dryRun, limit, concurrency };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CONTENT_TYPE_BY_SNIFF: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
};

function resolveContentType(
  headerContentType: string | null,
  body: Buffer,
  key: string,
): string {
  const header = headerContentType?.split(";")[0]?.trim().toLowerCase();
  if (header && header.startsWith("image/")) return header;
  try {
    const sniffed = imageSize(body).type;
    const bySniff = sniffed ? CONTENT_TYPE_BY_SNIFF[sniffed] : undefined;
    if (bySniff) return bySniff;
  } catch {
    // ignore
  }
  const rawExt = key.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const ext = rawExt === "jpeg" ? "jpg" : rawExt;
  const byExt = ext ? CONTENT_TYPE_BY_SNIFF[ext] : undefined;
  if (byExt) return byExt;
  return header ?? "application/octet-stream";
}

async function fetchWithRetry(
  url: string,
  attempts = 4,
): Promise<{ body: Buffer; contentType: string | null }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = Buffer.from(await res.arrayBuffer());
        if (body.length === 0) throw new Error("empty body");
        return { body, contentType: res.headers.get("content-type") };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function gatherLegacyUrls(): Promise<string[]> {
  const urls = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value && isLegacyMediaUrl(value)) urls.add(value);
  };

  const images = await db.image.findMany({ select: { url: true } });
  for (const img of images) add(img.url);

  const homepage = await db.homepageImage.findMany({ select: { url: true } });
  for (const h of homepage) add(h.url);

  const contacts = await db.contactPage.findMany({
    select: { heroImageUrl: true },
  });
  for (const c of contacts) add(c.heroImageUrl);

  const ebaySettings = await db.ebaySettings.findMany({
    select: { listingTemplate: true },
  });
  for (const e of ebaySettings) for (const u of extractUrls(e.listingTemplate)) add(u);

  const listings = await db.listing.findMany({ select: { description: true } });
  for (const l of listings) for (const u of extractUrls(l.description)) add(u);

  add(EBAY_LOGO_URL);

  return [...urls];
}

const manifestLineSchema = z.object({ status: z.string(), key: z.string() });

function loadDoneKeys(): Set<string> {
  const done = new Set<string>();
  if (!existsSync(MANIFEST_PATH)) return done;
  for (const line of readFileSync(MANIFEST_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue; // ignore malformed lines
    }
    const parsed = manifestLineSchema.safeParse(raw);
    if (
      parsed.success &&
      (parsed.data.status === "uploaded" ||
        parsed.data.status === "skipped-exists")
    ) {
      done.add(parsed.data.key);
    }
  }
  return done;
}

function record(outcome: Outcome): void {
  appendFileSync(MANIFEST_PATH, JSON.stringify(outcome) + "\n");
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) break;
        const item = items[index];
        if (item === undefined) break;
        await worker(item, index);
      }
    },
  );
  await Promise.all(runners);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(dirname(MANIFEST_PATH))) {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  }

  console.log("Gathering legacy URLs from the database…");
  let urls = await gatherLegacyUrls();
  console.log(`Found ${urls.length} distinct legacy URLs.`);
  if (args.limit !== null) {
    urls = urls.slice(0, args.limit);
    console.log(`--limit set: processing first ${urls.length}.`);
  }

  const doneKeys = loadDoneKeys();
  if (doneKeys.size > 0) {
    console.log(`Manifest shows ${doneKeys.size} keys already done; skipping those.`);
  }

  const counts = {
    uploaded: 0,
    skippedExists: 0,
    skippedManifest: 0,
    wouldUpload: 0,
    error: 0,
    bytes: 0,
  };
  let processed = 0;

  await runPool(urls, args.concurrency, async (url) => {
    const ref = parseLegacyUrl(url);
    processed++;
    if (!ref) {
      counts.error++;
      record({ url, key: "", status: "error", error: "unparseable legacy url" });
      return;
    }
    const key = ref.key;

    try {
      if (doneKeys.has(key)) {
        counts.skippedManifest++;
        record({ url, key, status: "skipped-manifest" });
        return;
      }

      if (args.dryRun) {
        counts.wouldUpload++;
        record({ url, key, status: "would-upload" });
        return;
      }

      if (await mediaExists(key)) {
        doneKeys.add(key);
        counts.skippedExists++;
        record({ url, key, status: "skipped-exists" });
        return;
      }

      const { body, contentType } = await fetchWithRetry(url);
      const resolved = resolveContentType(contentType, body, key);
      await putMedia({ key, body, contentType: resolved });
      doneKeys.add(key);
      counts.uploaded++;
      counts.bytes += body.length;
      record({
        url,
        key,
        status: "uploaded",
        bytes: body.length,
        contentType: resolved,
      });
    } catch (error) {
      counts.error++;
      record({
        url,
        key,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (processed % 100 === 0 || processed === urls.length) {
        console.log(
          `[${processed}/${urls.length}] uploaded=${counts.uploaded} ` +
            `skip-exists=${counts.skippedExists} skip-manifest=${counts.skippedManifest} ` +
            `would=${counts.wouldUpload} error=${counts.error} ` +
            `(${(counts.bytes / 1024 / 1024).toFixed(1)} MB)`,
        );
      }
    }
  });

  console.log("\n=== Migration summary ===");
  console.log(JSON.stringify(counts, null, 2));
  console.log(`Manifest: ${MANIFEST_PATH}`);
  if (counts.error > 0) {
    console.log(
      `\n${counts.error} error(s). Inspect with: grep '"status":"error"' ${MANIFEST_PATH}`,
    );
  }
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
