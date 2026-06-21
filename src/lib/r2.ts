// Server-only Cloudflare R2 (S3-compatible) helpers. Imported by the upload
// route and migration scripts. Never import this from client components — it
// pulls in the AWS SDK and reads server-only credentials.
import { randomUUID } from "node:crypto";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { env } from "~/env";
import { endpointFolder, type UploadEndpoint } from "./media-endpoints";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** File extension for a content type, defaulting to "bin" for unknown types. */
export function extForContentType(contentType: string): string {
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXT_BY_CONTENT_TYPE[base] ?? "bin";
}

/** Deterministic, date-bucketed key for a freshly uploaded asset. */
export function buildMediaKey(endpoint: UploadEndpoint, ext: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${endpointFolder(endpoint)}/${date}/${randomUUID()}.${ext}`;
}

/** Public URL the browser will hit for a given object key. */
export function mediaPublicUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL}/${key.replace(/^\/+/, "")}`;
}

export async function putMedia(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      // Keys are content-stable (uuid for uploads, source-derived for the
      // migration), so the asset at a key never changes — cache forever.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

/** Returns true if an object already exists at the given key. */
export async function mediaExists(key: string): Promise<boolean> {
  try {
    await r2.send(
      new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
    );
    return true;
  } catch (error) {
    if (error instanceof S3ServiceException) {
      if (
        error.name === "NotFound" ||
        error.name === "NoSuchKey" ||
        error.$metadata.httpStatusCode === 404
      ) {
        return false;
      }
    }
    throw error;
  }
}
