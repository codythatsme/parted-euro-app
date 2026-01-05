export type UploadEndpoint =
  | "homepageImage"
  | "inventoryImage"
  | "partImage"
  | "donorImage";

export type UploadMetadata = {
  partNo?: string;
  fileIndex?: string;
  variant?: string;
};

export type UploadResult = {
  url: string;
  id?: string;
  publicId?: string;
  serverData: {
    url: string;
    id?: string;
    partNo?: string;
    order?: number;
    variant?: string | null;
  };
};

export type UploadOptions = {
  endpoint: UploadEndpoint;
  file: File;
  metadata?: UploadMetadata;
  onProgress?: (percent: number) => void;
};

type SignatureResponse = {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  context?: string;
};

export async function uploadToCloudinary(
  options: UploadOptions,
): Promise<UploadResult> {
  const { endpoint, file, metadata, onProgress } = options;

  // Step 1: Get signature from our API
  const signatureResponse = await fetch("/api/cloudinary/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, metadata }),
  });

  if (!signatureResponse.ok) {
    const error = await signatureResponse.json();
    throw new Error(error.error || "Failed to get upload signature");
  }

  const signatureData: SignatureResponse = await signatureResponse.json();

  // Step 2: Upload to Cloudinary
  const formData = new FormData();
  formData.append("file", file);
  formData.append("signature", signatureData.signature);
  formData.append("timestamp", signatureData.timestamp.toString());
  formData.append("api_key", signatureData.apiKey);
  formData.append("folder", signatureData.folder);
  if (signatureData.context) {
    formData.append("context", signatureData.context);
  }

  const cloudinaryResponse = await new Promise<{
    secure_url: string;
    public_id: string;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));

    xhr.send(formData);
  });

  // Step 3: Call upload-complete to save to database
  const completeResponse = await fetch("/api/cloudinary/upload-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      url: cloudinaryResponse.secure_url,
      publicId: cloudinaryResponse.public_id,
      metadata,
    }),
  });

  if (!completeResponse.ok) {
    const error = await completeResponse.json();
    throw new Error(error.error || "Failed to complete upload");
  }

  const serverData = await completeResponse.json();

  return {
    url: cloudinaryResponse.secure_url,
    id: serverData.id,
    publicId: cloudinaryResponse.public_id,
    serverData,
  };
}

// Helper to upload multiple files
export async function uploadMultipleToCloudinary(
  files: File[],
  endpoint: UploadEndpoint,
  metadata?: Omit<UploadMetadata, "fileIndex">,
  onFileProgress?: (fileIndex: number, percent: number) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    const result = await uploadToCloudinary({
      endpoint,
      file,
      metadata: {
        ...metadata,
        fileIndex: i.toString(),
      },
      onProgress: (percent) => onFileProgress?.(i, percent),
    });

    results.push(result);
  }

  return results;
}
