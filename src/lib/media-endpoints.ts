// Isomorphic (no server/client-only deps): shared between the upload client,
// the upload route, and the R2 server lib so the endpoint set never drifts.

export const UPLOAD_ENDPOINTS = [
  "homepageImage",
  "inventoryImage",
  "partImage",
  "donorImage",
  "contactImage",
] as const;

export type UploadEndpoint = (typeof UPLOAD_ENDPOINTS)[number];

/** R2 key prefix for newly uploaded media, mirroring the old Cloudinary folders. */
export function endpointFolder(endpoint: UploadEndpoint): string {
  return `parted-euro/${endpoint}`;
}
