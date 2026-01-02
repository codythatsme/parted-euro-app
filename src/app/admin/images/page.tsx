"use client";

import { useState, useMemo } from "react";
import { useAdminTitle } from "~/hooks/use-admin-title";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { genUploader } from "uploadthing/client";
import type { OurFileRouter } from "~/server/uploadthing";
import { Image as ImageIcon, Plus, Check, Upload, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { AspectRatio } from "~/components/ui/aspect-ratio";

import Compressor from "compressorjs";

// Define the form schema
const formSchema = z.object({
  partNo: z.string().trim().min(1, "Part number is required"),
  variant: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type ExistingImage = {
  id: string;
  url: string;
  order: number;
  variant?: string | null;
};

// Generate the typed uploader
const { uploadFiles } = genUploader<OurFileRouter>();

export default function MobileUploadPage() {
  useAdminTitle("Images");
  const [currentPartNo, setCurrentPartNo] = useState<string>("");
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<
    { url: string; id: string; order: number }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Fetch existing images for the part number
  const utils = api.useUtils();
  const { data: existingImages, isLoading: loadingExistingImages } =
    api.part.getImagesByPartNo.useQuery(
      { partNo: currentPartNo },
      { enabled: !!currentPartNo },
    );

  const groupedExistingImages = useMemo(() => {
    const groups = new Map<string, ExistingImage[]>();
    (existingImages ?? []).forEach((img: ExistingImage) => {
      const key = (img.variant?.trim?.() ?? "Uncategorized") || "Uncategorized";
      const arr = groups.get(key) ?? [];
      arr.push(img);
      groups.set(key, arr);
    });
    return Array.from(groups.entries());
  }, [existingImages]);

  // Delete existing image mutation
  const deleteExistingImageMutation = api.part.deleteImage.useMutation({
    onSuccess: () => {
      toast.success("Image deleted successfully");
      // Invalidate and refetch the images
      void utils.part.getImagesByPartNo.invalidate({ partNo: currentPartNo });
    },
    onError: (error) => {
      toast.error(`Error deleting image: ${error.message ?? "Unknown error"}`);
    },
  });

  // Create form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partNo: "",
      variant: "",
    },
  });

  // Reset the form state when starting a new upload session
  const resetForm = () => {
    form.reset({ partNo: "", variant: "" });
    setCurrentPartNo("");
    setCurrentVariant(null);
    setUploadedImages([]);
    setUploadComplete(false);
    setSelectedFiles([]);
    setSuccessCount((prev) => prev); // Maintain the success count
  };

  // Handle form submission
  const onSubmit = (values: FormValues) => {
    setCurrentPartNo(values.partNo.trim());
    setCurrentVariant(values.variant?.trim() ? values.variant.trim() : null);
    setUploadedImages([]);
    setUploadComplete(false);
  };

  // (legacy helper removed; handled via upload flow)

  // Handle file selection and automatically start upload
  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0 || !currentPartNo) return;

    setSelectedFiles(files);

    // Automatically start upload
    setUploading(true);
    try {
      // Sort files alphabetically by filename
      const sortedFiles = [...files].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );

      // Process and compress files first
      const processedFiles: File[] = [];
      for (const file of sortedFiles) {
        let processedFile = file;

        // Compress image files
        if (file.type.startsWith("image/")) {
          processedFile = await new Promise<File>((resolve, _reject) => {
            new Compressor(file, {
              quality: 0.8,
              maxWidth: 1920,
              maxHeight: 1080,
              convertSize: 1000000,
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

        processedFiles.push(processedFile);
      }

      // Upload files one by one with their correct index
      const uploadResults = [];
      for (let i = 0; i < processedFiles.length; i++) {
        const file = processedFiles[i];
        if (!file) continue; // Skip if file is undefined

        const result = await uploadFiles("partImage", {
          files: [file],
          headers: {
            partNo: currentPartNo,
            fileIndex: i.toString(),
            variant: currentVariant ?? "",
          },
        });

        if (result?.[0]) {
          uploadResults.push(result[0]);
        }
      }

      // Handle successful uploads
      if (uploadResults.length > 0) {
        const newImages = uploadResults.map((result, index) => ({
          url: result.url,
          id: crypto.randomUUID(),
          order: index,
        }));

        setUploadedImages((prev) => [...prev, ...newImages]);
        setSuccessCount((prev) => prev + uploadResults.length);
        setUploadComplete(true);
        setSelectedFiles([]); // Clear selected files

        // Invalidate the existing images query to refresh the data
        void utils.part.getImagesByPartNo.invalidate({ partNo: currentPartNo });

        toast.success(
          `${uploadResults.length} image${uploadResults.length !== 1 ? "s" : ""} uploaded successfully`,
        );
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        `Error uploading images: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setUploading(false);
      // Clear the file input
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  // Handle deleting existing images from database
  const handleDeleteExistingImage = (imageId: string) => {
    deleteExistingImageMutation.mutate({ imageId });
  };

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">Mobile Image Upload</h1>
        <p className="mt-1 text-muted-foreground">
          Upload part images on-the-go to assign to inventory items later
        </p>
      </div>

      <div className="mb-4 rounded-md bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
        <div className="flex items-center">
          <span className="mr-2 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300">
            Tip
          </span>
          <p>
            You&apos;ve successfully uploaded <strong>{successCount}</strong>{" "}
            images in this session.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Enter Part Number</CardTitle>
            <CardDescription>
              Enter the part number to associate with the uploaded images
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="partNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Part Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter part number"
                          {...field}
                          disabled={!!currentPartNo}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="variant"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variant / Notes (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Driver side // Black leather"
                          {...field}
                          disabled={!!currentPartNo}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!!currentPartNo}
                >
                  {currentPartNo ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Part number set
                    </>
                  ) : (
                    "Continue to upload"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Existing Images Section */}
        {currentPartNo && (
          <Card>
            <CardHeader>
              <CardTitle>Existing Images</CardTitle>
              <CardDescription>
                Currently uploaded images for part number: {currentPartNo}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingExistingImages ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="text-sm text-muted-foreground">
                    Loading existing images...
                  </div>
                </div>
              ) : existingImages && existingImages.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">
                      {existingImages.length} existing image
                      {existingImages.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {groupedExistingImages.map(([variantLabel, imgs]) => (
                      <div key={String(variantLabel)} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">
                            {variantLabel}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {imgs
                            .slice()
                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            .map((image) => (
                              <div
                                key={image.id}
                                className="group relative overflow-hidden rounded-md border"
                              >
                                <AspectRatio ratio={1}>
                                  <img
                                    src={image.url}
                                    alt="Existing part image"
                                    className="h-full w-full object-cover"
                                  />
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                                    onClick={() =>
                                      handleDeleteExistingImage(image.id)
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </AspectRatio>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center rounded-md border-2 border-dashed border-muted p-4">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="mx-auto h-10 w-10 opacity-50" />
                    <p className="mt-2">No existing images found</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Upload Section */}
      {currentPartNo && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Step 2: Upload New Images</CardTitle>
            <CardDescription>
              Upload additional images for part number: {currentPartNo}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Custom File Input */}
              <div className="space-y-4">
                <div className="flex w-full items-center justify-center">
                  <label
                    htmlFor="file-upload"
                    className={`flex h-64 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all ${
                      uploading
                        ? "pointer-events-none border-primary/50 bg-primary/5"
                        : "border-muted-foreground/25 bg-muted/10 hover:border-muted-foreground/50"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center pb-6 pt-5">
                      {uploading ? (
                        <>
                          <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <p className="mb-2 text-sm font-semibold text-primary">
                            Uploading {selectedFiles.length} files...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Please wait while your images are being processed
                          </p>
                        </>
                      ) : (
                        <>
                          <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                          <p className="mb-2 text-sm text-muted-foreground">
                            <span className="font-semibold">
                              Click to upload
                            </span>{" "}
                            or drag and drop
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Images will be uploaded automatically and ordered
                            alphabetically
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>

                {/* Upload Progress or Status */}
                {uploading && selectedFiles.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center">
                      <ImageIcon className="mr-2 h-4 w-4" />
                      <span className="text-sm font-medium">
                        Processing files
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {uploadedImages.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">
                      {uploadedImages.length} new image
                      {uploadedImages.length !== 1 ? "s" : ""} uploaded
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {uploadedImages.map((image) => (
                      <div
                        key={image.id}
                        className="overflow-hidden rounded-md border"
                      >
                        <AspectRatio ratio={1}>
                          <img
                            src={image.url}
                            alt="Uploaded part"
                            className="h-full w-full object-cover"
                          />
                        </AspectRatio>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            {uploadComplete && (
              <Button onClick={resetForm} className="ml-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add another part
              </Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
