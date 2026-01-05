import { v2 as cloudinary } from "cloudinary";
import { env } from "~/env";

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: env.CLOUDINARY_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type UploadEndpoint =
  | "homepageImage"
  | "inventoryImage"
  | "partImage"
  | "donorImage";

// Get folder path based on endpoint type
export function getFolderPath(endpoint: UploadEndpoint): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `parted-euro/${endpoint}/${date}`;
}

// Generate signed upload parameters
export function generateSignedUploadParams(
  endpoint: UploadEndpoint,
  metadata?: Record<string, string>,
): {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  context?: string;
} {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const folder = getFolderPath(endpoint);

  // Build params object for signature
  const paramsToSign: Record<string, string | number> = {
    timestamp,
    folder,
  };

  // Add context if metadata is provided (for partImage endpoint)
  let context: string | undefined;
  if (metadata && Object.keys(metadata).length > 0) {
    context = Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}`)
      .join("|");
    paramsToSign.context = context;
  }

  // Generate signature
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    env.CLOUDINARY_API_SECRET,
  );

  return {
    signature,
    timestamp,
    cloudName: env.CLOUDINARY_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    folder,
    context,
  };
}

export { cloudinary };
