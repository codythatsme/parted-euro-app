// Client-side upload helper. Posts the file (multipart) to our own API route,
// which streams it to R2 and persists the DB row. Mirrors the previous
// Cloudinary client's public surface so call sites barely change.
import { z } from "zod";
import {
  endpointFolder as _endpointFolder,
  type UploadEndpoint,
} from "./media-endpoints";

export { type UploadEndpoint };

export type UploadMetadata = {
  partNo?: string;
  fileIndex?: string;
  variant?: string;
};

// Shape returned by /api/media/upload (the persisted-row summary). Validated
// at the boundary rather than asserted, so a malformed response is caught.
const serverDataSchema = z.object({
  url: z.string(),
  id: z.string().optional(),
  partNo: z.string().optional(),
  order: z.number().optional(),
  variant: z.string().nullable().optional(),
});

type ServerData = z.infer<typeof serverDataSchema>;

const errorResponseSchema = z.object({ error: z.string().optional() });

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export type UploadResult = {
  url: string;
  id?: string;
  serverData: ServerData;
};

export type UploadOptions = {
  endpoint: UploadEndpoint;
  file: File;
  metadata?: UploadMetadata;
  onProgress?: (percent: number) => void;
};

export async function uploadToR2(options: UploadOptions): Promise<UploadResult> {
  const { endpoint, file, metadata, onProgress } = options;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("endpoint", endpoint);
  if (metadata && Object.keys(metadata).length > 0) {
    formData.append("metadata", JSON.stringify(metadata));
  }

  const serverData = await new Promise<ServerData>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = serverDataSchema.safeParse(
          safeJsonParse(xhr.responseText),
        );
        if (parsed.success) resolve(parsed.data);
        else reject(new Error("Malformed upload response"));
      } else {
        const parsed = errorResponseSchema.safeParse(
          safeJsonParse(xhr.responseText),
        );
        const message =
          parsed.success && parsed.data.error
            ? parsed.data.error
            : `Upload failed with status ${xhr.status}`;
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
  });

  return {
    url: serverData.url,
    id: serverData.id,
    serverData,
  };
}

// Helper to upload multiple files sequentially with per-file progress.
export async function uploadMultipleToR2(
  files: File[],
  endpoint: UploadEndpoint,
  metadata?: Omit<UploadMetadata, "fileIndex">,
  onFileProgress?: (fileIndex: number, percent: number) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    const result = await uploadToR2({
      endpoint,
      file,
      metadata: { ...metadata, fileIndex: i.toString() },
      onProgress: (percent) => onFileProgress?.(i, percent),
    });

    results.push(result);
  }

  return results;
}

// Re-export so consumers that only import from this module keep working.
export const endpointFolder = _endpointFolder;
