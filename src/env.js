import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    DATABASE_URL: z.string().url(),
    STRIPE_PUBLIC: z.string(),
    STRIPE_SECRET: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),
    AUSPOST_API_KEY: z.string(),
    // Cloudflare R2 (S3-compatible) media storage.
    R2_ACCOUNT_ID: z.string(),
    R2_ACCESS_KEY_ID: z.string(),
    R2_SECRET_ACCESS_KEY: z.string(),
    R2_BUCKET_NAME: z.string(),
    // Public origin that serves the R2 bucket (custom domain on Cloudflare),
    // e.g. https://parted-storage.codythatsme.dev. No trailing slash.
    R2_PUBLIC_BASE_URL: z.string().url(),
    XERO_CLIENT_ID: z.string(),
    XERO_CLIENT_SECRET: z.string(),
    XERO_REDIRECT_URI: z.string(),
    XERO_SCOPES: z.string(),
    XERO_BANK_ACCOUNT: z.string(),
    EBAY_APP_ID: z.string(),
    EBAY_CERT_ID: z.string(),
    EBAY_SITE_ID: z.string(),
    EBAY_RU_NAME: z.string(),
    EBAY_SCOPES: z.string(),
    EBAY_MERCHANT_KEY: z.string(),
    // EBAY_FULFILLMENT_ID: z.string(),
    EBAY_PAYMENT_ID: z.string(),
    EBAY_RETURN_ID: z.string(),
    RESEND_API_KEY: z.string(),
    SENTRY_AUTH_TOKEN: z.string(),
    // Optional: only needed for the RealOEM compatible-cars lookup. Kept
    // optional so the app still boots if they're not deployed.
    BRIGHT_DATA_API_KEY: z.string().optional(),
    BRIGHT_DATA_ZONE_NAME: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: z.string(),
    // Public origin that serves R2 media to the browser. Mirrors
    // R2_PUBLIC_BASE_URL (kept separate so it can be exposed client-side).
    NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL: z.string().url(),
    // Optional Cloudflare Image Transformations base, e.g.
    // https://parted-storage.codythatsme.dev/cdn-cgi/image. When unset, images
    // are served at their original size (no on-the-fly resizing). Only set this
    // once "Image Transformations" is enabled for the zone.
    NEXT_PUBLIC_IMAGE_TRANSFORM_BASE_URL: z.string().url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
    STRIPE_PUBLIC: process.env.STRIPE_PUBLIC,
    STRIPE_SECRET: process.env.STRIPE_SECRET,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    AUSPOST_API_KEY: process.env.AUSPOST_API_KEY,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
    NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL:
      process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL,
    NEXT_PUBLIC_IMAGE_TRANSFORM_BASE_URL:
      process.env.NEXT_PUBLIC_IMAGE_TRANSFORM_BASE_URL,
    XERO_CLIENT_ID: process.env.XERO_CLIENT_ID,
    XERO_CLIENT_SECRET: process.env.XERO_CLIENT_SECRET,
    XERO_REDIRECT_URI: process.env.XERO_REDIRECT_URI,
    XERO_SCOPES: process.env.XERO_SCOPES,
    XERO_BANK_ACCOUNT: process.env.XERO_BANK_ACCOUNT,
    EBAY_APP_ID: process.env.EBAY_APP_ID,
    EBAY_CERT_ID: process.env.EBAY_CERT_ID,
    EBAY_SITE_ID: process.env.EBAY_SITE_ID,
    EBAY_RU_NAME: process.env.EBAY_RU_NAME,
    EBAY_SCOPES: process.env.EBAY_SCOPES,
    EBAY_MERCHANT_KEY: process.env.EBAY_MERCHANT_KEY,
    // EBAY_FULFILLMENT_ID: process.env.EBAY_FULFILLMENT_ID,
    EBAY_PAYMENT_ID: process.env.EBAY_PAYMENT_ID,
    EBAY_RETURN_ID: process.env.EBAY_RETURN_ID,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    BRIGHT_DATA_API_KEY: process.env.BRIGHT_DATA_API_KEY,
    BRIGHT_DATA_ZONE_NAME: process.env.BRIGHT_DATA_ZONE_NAME,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
