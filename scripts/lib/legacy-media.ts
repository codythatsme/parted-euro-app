/**
 * Pure URL → R2-key derivation for the Cloudinary/UploadThing → R2 migration.
 *
 * This is the SINGLE SOURCE OF TRUTH shared by:
 *   - scripts/migrate-media-to-r2.ts  (downloads each legacy URL, PUTs to <key>)
 *   - scripts/rewrite-media-urls.ts   (rewrites DB urls to <base>/<key>)
 *
 * Because both derive the key from the same function, a rewritten URL always
 * points at an object the scrape actually created. No network, no env, no
 * side effects — keep it that way.
 *
 * Legacy URL shapes observed in prod data:
 *   Cloudinary: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<public_id>.<ext>
 *               (also seen with http://; never with baked-in transforms)
 *   UploadThing: https://utfs.io/f/<opaqueKey>   (no file extension)
 */

export type LegacySource = "cloudinary" | "utfs";

export type LegacyRef = {
  source: LegacySource;
  /** R2 object key (no leading slash). */
  key: string;
};

const CLOUDINARY_HOSTS = new Set(["res.cloudinary.com"]);
const UTFS_HOST = "utfs.io";
const UPLOAD_MARKER = "/image/upload/";

/** Returns the R2 key + source for a legacy URL, or null if not a legacy host. */
export function parseLegacyUrl(rawUrl: string): LegacyRef | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (CLOUDINARY_HOSTS.has(url.hostname)) {
    const markerIndex = url.pathname.indexOf(UPLOAD_MARKER);
    if (markerIndex === -1) return null;

    const tail = url.pathname.slice(markerIndex + UPLOAD_MARKER.length);
    const segments = tail.split("/").filter((s) => s.length > 0);

    // Drop any leading Cloudinary transformation ("f_auto,q_80") and version
    // ("v1234") segments, in any order, until the real public_id remains.
    // Transform tokens look like "<letter>_<value>". Our data has none, but be
    // defensive so reruns on transformed URLs stay deterministic.
    while (
      segments[0] &&
      (/(^|,)[a-z]_[^/]+/i.test(segments[0]) || /^v\d+$/.test(segments[0]))
    ) {
      segments.shift();
    }

    const key = segments.join("/");
    if (!key) return null;
    return { source: "cloudinary", key };
  }

  if (url.hostname === UTFS_HOST) {
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    const opaque = segments[segments.length - 1];
    if (!opaque) return null;
    // No extension is available from the URL; the scrape sets the object's
    // Content-Type from the download so it still renders correctly.
    return { source: "utfs", key: `legacy/${opaque}` };
  }

  return null;
}

export function legacyKeyForUrl(rawUrl: string): string | null {
  return parseLegacyUrl(rawUrl)?.key ?? null;
}

export function isLegacyMediaUrl(rawUrl: string): boolean {
  return parseLegacyUrl(rawUrl) !== null;
}

/** Build the public R2 URL for a key under a given base origin. */
export function publicUrlForKey(base: string, key: string): string {
  return `${base.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

/** Map a single legacy URL to its R2 public URL, or null if not legacy. */
export function rewriteLegacyUrl(base: string, rawUrl: string): string | null {
  const key = legacyKeyForUrl(rawUrl);
  return key ? publicUrlForKey(base, key) : null;
}

/** Extract http(s) URLs embedded in an HTML/text blob. */
export function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
}
