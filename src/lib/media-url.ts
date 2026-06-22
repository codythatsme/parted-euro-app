// Isomorphic image-URL helper that replaces the old Cloudinary URL builder.
//
// First-party R2 media is resized on the fly via Cloudflare Image
// Transformations (the /cdn-cgi/image/<options>/<path> URL form). When the
// transform base is not configured, or the URL is not first-party media
// (e.g. a legacy res.cloudinary.com / utfs.io URL still in the DB during the
// cutover window, or a Google avatar), the URL is returned untouched so
// nothing breaks.
import { env } from "~/env";

export type MediaTransform = {
  width?: number;
  // 1-100. Cloudflare has no "auto" quality, unlike Cloudinary's q_auto.
  quality?: number;
  format?: "auto" | "webp" | "avif" | "jpeg" | "png";
  // scale-down ≈ Cloudinary c_limit: never upscale past the original.
  fit?: "scale-down" | "contain" | "cover";
};

const MEDIA_BASE = env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL;
const TRANSFORM_BASE = env.NEXT_PUBLIC_IMAGE_TRANSFORM_BASE_URL;

function isFirstPartyMedia(url: string): boolean {
  return url.startsWith(`${MEDIA_BASE}/`);
}

export function mediaUrl(url: string, transform: MediaTransform = {}): string {
  // No-op (return unchanged) when transforms are disabled, the URL is not
  // first-party media, or it is already a transform URL. The last check keeps
  // mediaUrl idempotent so a double call can't nest /cdn-cgi/image/ paths.
  if (
    !TRANSFORM_BASE ||
    !isFirstPartyMedia(url) ||
    url.includes("/cdn-cgi/image/")
  ) {
    return url;
  }

  const path = url.slice(MEDIA_BASE.length); // keeps the leading "/"
  const options = [
    `format=${transform.format ?? "auto"}`,
    `quality=${transform.quality ?? 85}`,
    `fit=${transform.fit ?? "scale-down"}`,
  ];
  if (transform.width) options.push(`width=${transform.width}`);

  return `${TRANSFORM_BASE}/${options.join(",")}${path}`;
}

export function mediaSrcSet(url: string, widths: number[]): string {
  return widths.map((w) => `${mediaUrl(url, { width: w })} ${w}w`).join(", ");
}
