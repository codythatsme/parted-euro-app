type Transform = {
  width?: number;
  quality?: "auto" | number;
  format?: "auto" | "webp" | "jpg" | "png";
};

const UPLOAD_MARKER = "/image/upload/";

export function cloudinaryUrl(url: string, transform: Transform = {}): string {
  const idx = url.indexOf(UPLOAD_MARKER);
  if (idx === -1) return url;

  const prefix = url.slice(0, idx + UPLOAD_MARKER.length);
  const tail = url.slice(idx + UPLOAD_MARKER.length);

  const firstSegment = tail.split("/")[0] ?? "";
  const alreadyTransformed = /(^|,)[a-z]_/i.test(firstSegment);
  if (alreadyTransformed) return url;

  const parts: string[] = [];
  parts.push(`f_${transform.format ?? "auto"}`);
  parts.push(`q_${transform.quality ?? "auto"}`);
  if (transform.width) parts.push(`c_limit,w_${transform.width}`);

  return `${prefix}${parts.join(",")}/${tail}`;
}

export function cloudinarySrcSet(url: string, widths: number[]): string {
  return widths
    .map((w) => `${cloudinaryUrl(url, { width: w })} ${w}w`)
    .join(", ");
}
