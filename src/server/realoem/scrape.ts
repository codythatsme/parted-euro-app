/**
 * RealOEM BMW part cross-reference scraper — Bright Data Web Unlocker edition.
 *
 * realoem.com is behind a Cloudflare managed challenge, but it serves the
 * fitment list as static server HTML, so this is a stateless HTTP fetch per
 * URL (no browser) routed through Bright Data's Web Unlocker, parsed with
 * cheerio. Output tuples map 1:1 onto Car @@unique([make, chassisCode, model,
 * body, engine]); the match → Car.id step lives in ./match.ts.
 *
 * Env (optional at boot, required at call time): BRIGHT_DATA_API_KEY,
 * BRIGHT_DATA_ZONE_NAME. Server-only.
 */

import * as cheerio from "cheerio";
import { env } from "~/env";

const BASE = "https://www.realoem.com/bmw/enUS/partxref";
const UNLOCKER_ENDPOINT = "https://api.brightdata.com/request";
const REQUEST_TIMEOUT_MS = 45_000;

// BMW car series only: 1–8 Series, X#, Z#, i / iX, M#. Skips MINI,
// Rolls-Royce, motorcycles. Tested against the brand-stripped label.
const CAR_RX = /^(\d\s+Series\b|X\d\b|Z\d\b|i\d?\b|M\d\b)/i;

// realoem labels chassis with the make ("BMW 1 Series F20") but variant rows
// don't ("1 Series F20"). Strip it from both so the row→chassis mapping lines up.
const stripBrand = (s: string): string => s.replace(/^BMW\s+/i, "").trim();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface RealoemTuple {
  make: "BMW";
  chassisCode: string;
  model: string;
  body: string;
  engine: string;
}

export interface RealoemScrapeResult {
  partNo: string;
  requestCount: number;
  tuples: RealoemTuple[];
  skipped: number;
}

interface VariantRow {
  seriesAndChassis: string;
  model: string;
  body: string;
  engine: string;
}

/** Fetch a URL's raw HTML through Bright Data Web Unlocker (clears Cloudflare). */
async function fetchUnlocked(url: string): Promise<string> {
  const apiKey = env.BRIGHT_DATA_API_KEY;
  const zone = env.BRIGHT_DATA_ZONE_NAME;
  if (!apiKey || !zone) {
    throw new Error(
      "RealOEM lookup is not configured: set BRIGHT_DATA_API_KEY and BRIGHT_DATA_ZONE_NAME.",
    );
  }
  const res = await fetch(UNLOCKER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ zone, url, format: "raw" }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Web Unlocker HTTP ${res.status} for ${url}: ${text.slice(0, 300)}`);
  }
  return text;
}

function parseTopChassis(
  $: cheerio.CheerioAPI,
): { chassisCode: string; displayText: string }[] {
  const seen = new Set<string>();
  const out: { chassisCode: string; displayText: string }[] = [];
  $('a[href*="partxref"][href*="series="]').each((_, el) => {
    const href = $(el).attr("href");
    if (href === undefined) return;
    const series = new URL(href, "https://www.realoem.com").searchParams.get("series");
    if (!series || seen.has(series)) return;
    seen.add(series);
    out.push({ chassisCode: series, displayText: $(el).text().trim() });
  });
  return out;
}

function parseVariantRows($: cheerio.CheerioAPI): VariantRow[] {
  const out: VariantRow[] = [];
  $("li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    const colon = t.indexOf(":");
    const head = colon >= 0 ? t.slice(0, colon) : t;
    const parts = head.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 6) return;
    const last = parts[parts.length - 1];
    if (last === undefined || !/^\([^)]+\)$/.test(last)) return;
    const [seriesAndChassis, model, body, engine] = parts;
    if (
      seriesAndChassis === undefined ||
      model === undefined ||
      body === undefined ||
      engine === undefined
    ) {
      return;
    }
    out.push({ seriesAndChassis, model, body, engine });
  });
  return out;
}

/** Scrape every BMW variant the given part fits. Returns deduped tuples. */
export async function scrapeRealoemPart(partNo: string): Promise<RealoemScrapeResult> {
  // 1. Top-level chassis list.
  const topHtml = await fetchUnlocked(`${BASE}?q=${encodeURIComponent(partNo)}`);
  const top = parseTopChassis(cheerio.load(topHtml));
  if (top.length === 0) {
    // Distinguish "Cloudflare blocked us" from "part genuinely has no BMW fitments".
    const looksLikeRealoem = /realoem|partxref|\/bmw\//i.test(topHtml);
    if (!looksLikeRealoem) {
      throw new Error("RealOEM page not retrieved (possible Cloudflare block).");
    }
    return { partNo, requestCount: 1, tuples: [], skipped: 0 };
  }

  // 2. Filter to BMW car chassis.
  let skipped = 0;
  const carChassis = top.filter((t) => {
    const label = stripBrand(t.displayText);
    if (!CAR_RX.test(label) || /ALPINA/i.test(t.displayText)) {
      skipped += 1;
      return false;
    }
    return true;
  });

  // Map a row's first segment ("3 Series F30 LCI") → URL token ("F30N").
  const prefixToCode = carChassis
    .map(({ chassisCode, displayText }) => {
      const label = stripBrand(displayText);
      const m = /^(.*?)\s+\(\d/.exec(label);
      return { chassisCode, prefix: (m?.[1] ?? label).trim() };
    })
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const codeForRow = (seriesAndChassis: string): string | null => {
    const needle = stripBrand(seriesAndChassis);
    for (const { prefix, chassisCode } of prefixToCode) {
      if (needle === prefix) return chassisCode;
    }
    return null;
  };

  // 3. Bulk fetch with truncation-retry (realoem caps responses ~1000 rows).
  const tuples = new Map<string, RealoemTuple>();
  let queue = carChassis.map((c) => c.chassisCode);
  let requestCount = 1; // top-level

  while (queue.length) {
    requestCount += 1;
    const url = `${BASE}?q=${encodeURIComponent(partNo)}&series=${queue.join(",")}`;
    const rows = parseVariantRows(cheerio.load(await fetchUnlocked(url)));

    const seenInResponse = new Set<string>();
    let lastCode: string | null = null;
    for (const r of rows) {
      if (/ALPINA/i.test(r.model) || /ALPINA/i.test(r.seriesAndChassis)) continue;
      const code = codeForRow(r.seriesAndChassis);
      if (!code) continue;
      seenInResponse.add(code);
      lastCode = code;
      const key = `${code}|${r.model}|${r.body}|${r.engine}`;
      if (tuples.has(key)) continue;
      tuples.set(key, {
        make: "BMW",
        chassisCode: code,
        model: r.model,
        body: r.body,
        engine: r.engine,
      });
    }

    const missing = queue.filter((c) => !seenInResponse.has(c));
    if (missing.length === 0) break;
    const nextQueue = new Set(missing);
    if (lastCode) nextQueue.add(lastCode);
    queue = Array.from(nextQueue);
    await sleep(600);
  }

  return { partNo, requestCount, tuples: Array.from(tuples.values()), skipped };
}
