"use client";

import { useState, useEffect } from "react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "~/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { Loader2, X, GripVertical, Image as ImageIcon } from "lucide-react";
import { AspectRatio } from "~/components/ui/aspect-ratio";
import { cn } from "~/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { UploadButton, UploadDropzone } from "~/components/CloudinaryUpload";
import { Badge } from "~/components/ui/badge";
import { type AdminListingsItem } from "~/trpc/shared";
import Compressor from "compressorjs";
import {
  VirtualizedMultiSelect,
  type VirtualizedOption,
} from "~/components/ui/virtualized-multi-select";
import {
  FilterableInventorySelect,
  type InventoryOption,
} from "~/components/ui/filterable-inventory-select";

// Define image item type for DnD
type ImageItem = {
  id: string;
  url: string;
  order: number;
};

// Add an interface for part images
interface PartImage {
  id: string;
  url: string;
  order: number;
  partNo: string | null;
}

// Sortable image component
const SortableImage = ({
  image,
  onRemove,
}: {
  image: ImageItem;
  onRemove: (id: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: image.id,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex items-center gap-2 rounded-md bg-muted/40 p-2"
    >
      <div className="cursor-grab touch-none" {...attributes} {...listeners}>
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="relative h-16 w-16 overflow-hidden rounded-md">
        <AspectRatio ratio={1}>
          <img
            src={image.url}
            alt="Product"
            className="h-full w-full object-cover"
          />
        </AspectRatio>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-6 w-6 bg-muted/50 text-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        onClick={() => onRemove(image.id)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};

interface ListingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: AdminListingsItem;
  isEditing?: boolean;
  initialPart?: {
    id: string;
    name?: string;
    partNo?: string;
  };
}

const formSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  condition: z.string().min(1, "Condition is required"),
  price: z.coerce.number().positive("Price must be positive"),
  parts: z.array(z.string()).min(1, "At least one part is required"),
  images: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        order: z.number(),
      }),
    )
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function ListingForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
  initialPart,
}: ListingFormProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [partImages, setPartImages] = useState<PartImage[]>([]);
  const utils = api.useUtils();

  // DnD sensors for image reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Fetch options for part selection
  const { data: partOptions = [] } = api.inventory.getAllForSelect.useQuery();

  // Type assertion to ensure partOptions matches the expected InventoryOption type
  const inventoryOptions = partOptions as InventoryOption[];

  // When initialPart is provided, fetch its images immediately
  useEffect(() => {
    if (initialPart?.id && !defaultValues) {
      const fetchInitialPartImages = async () => {
        try {
          const inventoryItem = await utils.inventory.getById.fetch({
            id: initialPart.id,
          });

          if (inventoryItem?.images && inventoryItem.images.length > 0) {
            // Add these images to our images state
            const initialImages = inventoryItem.images.map((img) => ({
              id: img.id,
              url: img.url,
              order: img.order,
            }));
            setImages(initialImages);
          }
        } catch (error) {
          console.error(
            `Error fetching images for initial part ${initialPart.id}:`,
            error,
          );
        }
      };

      void fetchInitialPartImages();
    }
  }, [initialPart, defaultValues, utils.inventory.getById]);

  // Fetch images for selected inventory parts
  useEffect(() => {
    if (selectedParts.length === 0) {
      setPartImages([]);
      return;
    }

    const fetchInventoryImages = async () => {
      try {
        let allImages: PartImage[] = [];

        // Fetch each inventory item's images
        for (const partId of selectedParts) {
          try {
            // Get inventory item details including images
            const inventoryItem = await utils.inventory.getById.fetch({
              id: partId,
            });

            if (inventoryItem?.images && inventoryItem.images.length > 0) {
              // Convert to the format we need
              const images = inventoryItem.images.map((img) => ({
                id: img.id,
                url: img.url,
                order: img.order,
                partNo: inventoryItem.partDetailsId,
              }));

              allImages = [...allImages, ...images];
            }
          } catch (error) {
            console.error(
              `Error fetching images for inventory item ${partId}:`,
              error,
            );
          }
        }

        setPartImages(allImages);
      } catch (error) {
        console.error("Error fetching inventory images:", error);
      }
    };

    void fetchInventoryImages();
  }, [selectedParts, utils.inventory.getById]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: defaultValues?.id ?? undefined,
      title: defaultValues?.title ?? "",
      description: defaultValues?.description ?? "",
      condition: defaultValues?.condition ?? "",
      price: defaultValues?.price ?? 0,
      parts: defaultValues?.parts.map((part) => part.id) ?? [],
      images: defaultValues?.images ?? [],
    },
  });

  // Watch for changes to the parts field
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "parts" && value.parts) {
        const parts = value.parts.filter(
          (part): part is string => part !== undefined,
        );
        setSelectedParts(parts);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Initialize images and parts from default values
  useEffect(() => {
    if (defaultValues) {
      // Reset form with new values when defaultValues change
      form.reset({
        id: defaultValues.id,
        title: defaultValues.title,
        description: defaultValues.description,
        condition: defaultValues.condition,
        price: defaultValues.price,
        parts: defaultValues.parts.map((part) => part.id),
        images: defaultValues.images,
      });

      if (defaultValues.images) {
        setImages(
          defaultValues.images.map((img) => ({
            id: img.id,
            url: img.url,
            order: img.order,
          })),
        );
      }
      if (defaultValues.parts) {
        setSelectedParts(defaultValues.parts.map((part) => part.id));
      }
    } else if (initialPart) {
      // If an initial part is provided but no default values, pre-populate with the part
      form.reset({
        id: undefined,
        title: initialPart.name ?? "",
        description: "",
        condition: "",
        price: 0,
        parts: [initialPart.id],
        images: [],
      });
      setSelectedParts([initialPart.id]);
    } else {
      form.reset({
        id: undefined,
        title: "",
        description: "",
        condition: "",
        price: 0,
        parts: [],
        images: [],
      });
      setSelectedParts([]);
      setImages([]);
    }
  }, [defaultValues, initialPart, form]);

  // Mutations for create and update
  const createMutation = api.listings.create.useMutation({
    onSuccess: () => {
      toast.success("Listing created successfully");
      onOpenChange(false);
      void utils.listings.getAllAdmin.invalidate();
      form.reset();
      setImages([]);
      setSelectedParts([]);
    },
    onError: (error) => {
      toast.error(`Error creating listing: ${error.message}`);
    },
  });

  const updateMutation = api.listings.update.useMutation({
    onSuccess: () => {
      toast.success("Listing updated successfully");
      onOpenChange(false);
      void utils.listings.getAllAdmin.invalidate();
    },
    onError: (error) => {
      toast.error(`Error updating listing: ${error.message}`);
    },
  });

  const isSubmitting =
    form.formState.isSubmitting ||
    createMutation.isPending ||
    updateMutation.isPending;

  const onSubmit = (values: FormValues) => {
    // Include ordered images in the submission
    const formData = {
      ...values,
      parts: selectedParts,
      images: images.map((img, index) => ({
        ...img,
        order: index, // Update order based on current array position
      })),
    };

    if (isEditing && defaultValues) {
      updateMutation.mutate({
        id: defaultValues.id,
        data: formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Handle image upload completion
  const handleImageUpload = (results: { url: string }[]) => {
    const newImages = results.map((result, index) => ({
      id: crypto.randomUUID(),
      url: result.url,
      order: images.length + index,
    }));

    setImages((prev) => [...prev, ...newImages]);
  };

  // Handle image removal
  const handleImageRemove = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Handle image reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // If there's no target, return
    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    // If the item was dropped on itself, return
    if (activeId === overId) return;

    setImages((items) => {
      // Find the indexes in a type-safe way
      const oldIndex = items.findIndex((item) => item.id === activeId);
      const newIndex = items.findIndex((item) => item.id === overId);

      // If either item is not found, return the original array
      if (oldIndex === -1 || newIndex === -1) return items;

      // Create a new ordered array
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Listing" : "Add New Listing"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title*</FormLabel>
                  <FormControl>
                    <Input placeholder="Listing title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description*</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Detailed description of the listing"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {[
                          { label: "New", value: "NEW" },
                          { label: "Used", value: "USED_EXCELLENT" },
                          {
                            label: "For Parts Or Not Working",
                            value: "FOR_PARTS_OR_NOT_WORKING",
                          },
                        ].map((condition) => (
                          <SelectItem
                            key={condition.value}
                            value={condition.value}
                          >
                            {condition.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price*</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="parts"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Parts*</FormLabel>
                  <FilterableInventorySelect
                    options={inventoryOptions}
                    value={selectedParts}
                    onChange={(value) => {
                      setSelectedParts(value);
                      form.setValue("parts", value);
                      // set the name of the listing if its the first part
                      if (value.length === 1) {
                        const selectedPart = inventoryOptions.find(
                          (x) => x.value === value[0],
                        );
                        if (selectedPart) {
                          form.setValue(
                            "title",
                            selectedPart.label.split("-")[0]!.trim(),
                          );
                        }
                      }
                    }}
                    placeholder="Select parts"
                    searchPlaceholder="Search parts..."
                    height="300px"
                    disabled={isSubmitting}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Images</FormLabel>
              <div className="rounded-md border p-4">
                <div className="mb-4">
                  <UploadDropzone
                    endpoint="homepageImage"
                    onBeforeUploadBegin={(files) => {
                      // Create a promise for each file to be compressed
                      const compressPromises = files.map(
                        (file) =>
                          new Promise<File>((resolve, reject) => {
                            // Skip compression for non-image files
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
                                // Create a new file with the original name but compressed content
                                const newFile = new File(
                                  [compressedFile],
                                  file.name,
                                  { type: compressedFile.type },
                                );
                                resolve(newFile);
                              },
                              error: (err) => {
                                console.error("Compression error:", err);
                                // If compression fails, use the original file
                                resolve(file);
                              },
                            });
                          }),
                      );

                      // Return a promise that resolves when all files are compressed
                      return Promise.all(compressPromises);
                    }}
                    onClientUploadComplete={(res) => {
                      if (res) {
                        handleImageUpload(res);
                        toast.success("Images uploaded successfully");
                      }
                    }}
                    onUploadError={(error: Error) => {
                      toast.error(`Error uploading images: ${error.message}`);
                    }}
                    className="ut-label:text-lg ut-allowed-content:text-muted-foreground ut-upload-icon:text-muted-foreground rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 transition-all hover:border-muted-foreground/50"
                  />
                </div>

                {partImages.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">
                        {partImages.length} image
                        {partImages.length !== 1 ? "s" : ""} available from
                        selected parts
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Add all part images that aren't already in selection
                          const newImages = partImages
                            .filter(
                              (img) =>
                                !images.some(
                                  (existing) => existing.id === img.id,
                                ),
                            )
                            .map((img, index) => ({
                              id: img.id,
                              url: img.url,
                              order: images.length + index,
                            }));

                          setImages((prev) => [...prev, ...newImages]);
                        }}
                      >
                        Use all images
                      </Button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {partImages.map((image) => (
                        <div
                          key={image.id}
                          className="group relative cursor-pointer overflow-hidden rounded-md border"
                          onClick={() => {
                            // Check if this image is already in the selection
                            const isAlreadyAdded = images.some(
                              (img) => img.id === image.id,
                            );

                            if (!isAlreadyAdded) {
                              setImages((prev) => [
                                ...prev,
                                {
                                  id: image.id,
                                  url: image.url,
                                  order: images.length,
                                },
                              ]);
                              toast.success("Image added to selection");
                            } else {
                              toast.info("Image already in selection");
                            }
                          }}
                        >
                          <AspectRatio ratio={1}>
                            <img
                              src={image.url}
                              alt="Part"
                              className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button variant="secondary" size="sm">
                                {images.some((img) => img.id === image.id)
                                  ? "Already added"
                                  : "Add to selection"}
                              </Button>
                            </div>
                          </AspectRatio>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="my-4 border-t pt-4">
                  <div className="mb-2 flex items-center">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">
                      {images.length === 0
                        ? "No images added yet"
                        : `${images.length} image${images.length > 1 ? "s" : ""} (drag to reorder)`}
                    </span>
                  </div>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                  >
                    <SortableContext
                      items={images.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid gap-2">
                        {images.map((image) => (
                          <SortableImage
                            key={image.id}
                            image={image}
                            onRemove={handleImageRemove}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
