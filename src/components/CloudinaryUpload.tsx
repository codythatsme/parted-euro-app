"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import Compressor from "compressorjs";
import {
  uploadToCloudinary,
  type UploadEndpoint,
  type UploadResult,
  type UploadMetadata,
} from "~/lib/cloudinary-client";
import { Upload } from "lucide-react";

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB
const MAX_FILE_COUNT = 30;

type UploadDropzoneProps = {
  endpoint: UploadEndpoint;
  metadata?: UploadMetadata;
  config?: {
    mode?: "auto" | "manual";
  };
  onBeforeUploadBegin?: (files: File[]) => Promise<File[]> | File[];
  onClientUploadComplete?: (results: UploadResult[]) => void;
  onUploadError?: (error: Error) => void;
  className?: string;
};

export function UploadDropzone({
  endpoint,
  metadata,
  config,
  onBeforeUploadBegin,
  onClientUploadComplete,
  onUploadError,
  className,
}: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (files: File[]): string | null => {
    if (files.length > MAX_FILE_COUNT) {
      return `Maximum ${MAX_FILE_COUNT} files allowed`;
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return `File "${file.name}" exceeds 16MB limit`;
      }
      if (!file.type.startsWith("image/")) {
        return `File "${file.name}" is not an image`;
      }
    }

    return null;
  };

  const handleUpload = useCallback(
    async (files: File[]) => {
      const validationError = validateFiles(files);
      if (validationError) {
        const error = new Error(validationError);
        onUploadError?.(error);
        return;
      }

      setIsUploading(true);
      setProgress(0);

      try {
        // Apply preprocessing if provided
        const processedFiles = onBeforeUploadBegin
          ? await onBeforeUploadBegin(files)
          : files;

        const results: UploadResult[] = [];
        const totalFiles = processedFiles.length;

        for (let i = 0; i < processedFiles.length; i++) {
          const file = processedFiles[i];
          if (!file) continue;

          const result = await uploadToCloudinary({
            endpoint,
            file,
            metadata: {
              ...metadata,
              fileIndex: i.toString(),
            },
            onProgress: (fileProgress) => {
              // Calculate overall progress
              const completedFiles = i;
              const overallProgress = Math.round(
                ((completedFiles + fileProgress / 100) / totalFiles) * 100,
              );
              setProgress(overallProgress);
            },
          });

          results.push(result);
        }

        setProgress(100);
        onClientUploadComplete?.(results);
      } catch (error) {
        onUploadError?.(
          error instanceof Error ? error : new Error("Upload failed"),
        );
      } finally {
        setIsUploading(false);
        setProgress(0);
      }
    },
    [endpoint, metadata, onBeforeUploadBegin, onClientUploadComplete, onUploadError],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && (config?.mode === "auto" || !config?.mode)) {
        void handleUpload(files);
      }
    },
    [handleUpload, config?.mode],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0 && (config?.mode === "auto" || !config?.mode)) {
        void handleUpload(files);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleUpload, config?.mode],
  );

  return (
    <div
      className={cn(
        "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-all",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        isUploading && "pointer-events-none opacity-60",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium">Uploading... {progress}%</p>
        </div>
      ) : (
        <>
          <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="mb-1 text-lg font-medium">
            {isDragOver ? "Drop files here" : "Choose files or drag and drop"}
          </p>
          <p className="text-sm text-muted-foreground">
            Images up to 16MB (max {MAX_FILE_COUNT} files)
          </p>
        </>
      )}
    </div>
  );
}

type UploadButtonProps = {
  endpoint: UploadEndpoint;
  metadata?: UploadMetadata;
  onBeforeUploadBegin?: (files: File[]) => Promise<File[]> | File[];
  onClientUploadComplete?: (results: UploadResult[]) => void;
  onUploadError?: (error: Error) => void;
  className?: string;
};

export function UploadButton({
  endpoint,
  metadata,
  onBeforeUploadBegin,
  onClientUploadComplete,
  onUploadError,
  className,
}: UploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (files: File[]): string | null => {
    if (files.length > MAX_FILE_COUNT) {
      return `Maximum ${MAX_FILE_COUNT} files allowed`;
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return `File "${file.name}" exceeds 16MB limit`;
      }
      if (!file.type.startsWith("image/")) {
        return `File "${file.name}" is not an image`;
      }
    }

    return null;
  };

  const handleUpload = useCallback(
    async (files: File[]) => {
      const validationError = validateFiles(files);
      if (validationError) {
        const error = new Error(validationError);
        onUploadError?.(error);
        return;
      }

      setIsUploading(true);

      try {
        // Apply preprocessing if provided
        const processedFiles = onBeforeUploadBegin
          ? await onBeforeUploadBegin(files)
          : files;

        const results: UploadResult[] = [];

        for (let i = 0; i < processedFiles.length; i++) {
          const file = processedFiles[i];
          if (!file) continue;

          const result = await uploadToCloudinary({
            endpoint,
            file,
            metadata: {
              ...metadata,
              fileIndex: i.toString(),
            },
          });

          results.push(result);
        }

        onClientUploadComplete?.(results);
      } catch (error) {
        onUploadError?.(
          error instanceof Error ? error : new Error("Upload failed"),
        );
      } finally {
        setIsUploading(false);
      }
    },
    [endpoint, metadata, onBeforeUploadBegin, onClientUploadComplete, onUploadError],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        void handleUpload(files);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleUpload],
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className={cn(
          "rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50",
          className,
        )}
      >
        {isUploading ? "Uploading..." : "Choose Files"}
      </button>
    </>
  );
}

// Compression helper for image files
function compressFile(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    new Compressor(file, {
      quality: 0.8, // 80% quality
      maxWidth: 1920,
      maxHeight: 1080,
      convertSize: 1000000, // Convert to JPEG if > 1MB
      success: (compressedFile) => {
        const newFile = new File([compressedFile], file.name, {
          type: compressedFile.type,
        });
        resolve(newFile);
      },
      error: (err) => {
        console.error("Compression error:", err);
        resolve(file); // Use original file if compression fails
      },
    });
  });
}

export function HomepageImageUploader() {
  const router = useRouter();

  const onUploadError = useCallback((error: Error) => {
    toast.error(`Error uploading images: ${error.message}`);
  }, []);

  return (
    <UploadButton
      endpoint="homepageImage"
      onBeforeUploadBegin={async (files) => {
        const compressed = await Promise.all(files.map(compressFile));
        return compressed;
      }}
      onClientUploadComplete={() => {
        toast.success("Images uploaded successfully!");
        router.refresh();
      }}
      onUploadError={onUploadError}
      className="bg-primary font-medium text-sm px-4 py-2.5 rounded-md text-white hover:bg-primary/90"
    />
  );
}

export function HomepageImageUploadZone({
  className,
  onUploadComplete,
}: {
  className?: string;
  onUploadComplete?: () => void;
}) {
  const router = useRouter();

  const onUploadError = useCallback((error: Error) => {
    toast.error(`Error uploading images: ${error.message}`);
  }, []);

  return (
    <UploadDropzone
      config={{ mode: "auto" }}
      endpoint="homepageImage"
      onBeforeUploadBegin={async (files) => {
        const compressed = await Promise.all(files.map(compressFile));
        return compressed;
      }}
      onClientUploadComplete={() => {
        toast.success("Images uploaded successfully!");
        onUploadComplete?.();
      }}
      onUploadError={onUploadError}
      className={cn(
        "ut-label:text-lg ut-allowed-content:text-muted-foreground ut-upload-icon:text-muted-foreground rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-all hover:border-muted-foreground/50",
        className,
      )}
    />
  );
}
