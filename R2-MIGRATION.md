# Cloudinary/UploadThing → Cloudflare R2 migration

Image hosting moved off Cloudinary + UploadThing (`utfs.io`) onto a single R2
bucket served via the `parted-storage.codythatsme.dev` custom domain.

## What changed in the app

- **Upload**: browser → `POST /api/media/upload` (multipart, admin-auth'd) →
  server streams to R2 via the S3 API and writes the DB row. Replaces the old
  Cloudinary signed direct-upload. (`src/lib/r2.ts`, `src/lib/media-client.ts`,
  `src/components/MediaUpload.tsx`, `src/app/api/media/upload/route.ts`)
- **Rendering / resizing**: `mediaUrl()` / `mediaSrcSet()`
  (`src/lib/media-url.ts`) replace `cloudinaryUrl()`. They emit Cloudflare Image
  Transformation URLs (`/cdn-cgi/image/<opts>/<path>`) **only** when
  `NEXT_PUBLIC_IMAGE_TRANSFORM_BASE_URL` is set; otherwise they return the URL
  unchanged. Non-R2 URLs always pass through untouched.
- All `cloudinary*` modules, `/api/cloudinary/*`, and the `cloudinary` dep were
  removed. Added `@aws-sdk/client-s3` + `image-size`.

## Env vars (all in `.env`)

```
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   # credentials
R2_BUCKET_NAME=parted-storage                           # bucket name
R2_PUBLIC_BASE_URL=https://parted-storage.codythatsme.dev
NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL=https://parted-storage.codythatsme.dev
# Optional — only set once Image Transformations are enabled on the zone:
NEXT_PUBLIC_IMAGE_TRANSFORM_BASE_URL=https://parted-storage.codythatsme.dev/cdn-cgi/image
```

`R2_PUBLIC_BASE_URL` and `NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL` must be the same
origin, or transforms won't recognise media URLs as first-party.

## Migration scripts (`scripts/`)

- `lib/legacy-media.ts` — **single source of truth** for the URL→R2-key mapping,
  shared by the scrape and the rewrite so a rewritten URL always points at an
  object the scrape created. Cloudinary keys preserve the public_id path;
  UploadThing keys become `legacy/<opaqueKey>`.
- `migrate-media-to-r2.ts` — downloads every distinct legacy image referenced in
  the DB and uploads it to R2. Idempotent (HEAD-skip + manifest), resumable,
  concurrent. Writes `scripts/data/r2-migration-manifest.jsonl` (gitignored).
- `rewrite-media-urls.ts` — rewrites DB URLs old→R2. Dry-run by default;
  `--execute` to apply. Host-filtered + idempotent (safe to re-run). Refuses to
  `--execute` if the scrape manifest still has unresolved upload errors
  (`--force` overrides).
- `analyze-image-urls.ts` — read-only profiler to confirm DB URL hosts.

## Status (local)

Done and verified locally:
- 21,494 distinct images scraped to R2 (0 errors, ~4.1 GB). The bucket is shared
  with prod, so **the bytes are already in place for prod** — no re-scrape needed.
- Local DB rewritten: 0 `cloudinary`/`utfs.io` URLs remain.
- Public serving + `next/image` optimization against R2 verified (HTTP 200).

## Prod cutover (run when ready)

The R2 bucket is already populated, so prod only needs the DB URL rewrite. The
script targets `PROD_DB_URL` from `.env` by default. Run from this checkout (so
the scrape manifest is present for the safety check):

```bash
# 1. Dry run first — eyeball the counts and sample mappings:
bun run scripts/rewrite-media-urls.ts

# 2. Apply:
bun run scripts/rewrite-media-urls.ts --execute
```

(Use `--database-url="postgres://…"` to override the target, e.g. for a local DB.)

Deploy the app code together with (or before) the rewrite. Old Cloudinary/utfs
URLs keep rendering until the rewrite runs (the host stays allow-listed), so
ordering is not fragile. The rewrite is idempotent — safe to re-run.

## Follow-ups

- To enable on-the-fly resizing: turn on **Image Transformations** for the
  `parted-storage.codythatsme.dev` zone in the Cloudflare dashboard, then set
  `NEXT_PUBLIC_IMAGE_TRANSFORM_BASE_URL`.
- After prod is fully migrated, remove the legacy `res.cloudinary.com` / `utfs.io`
  entries from `next.config.js` `remotePatterns`.
