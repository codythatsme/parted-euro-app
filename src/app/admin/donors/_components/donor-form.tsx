"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { type DonorWithCar } from "./columns";
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  X,
} from "lucide-react";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn, formatDate } from "~/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "~/components/ui/command";
import { AspectRatio } from "~/components/ui/aspect-ratio";
import { UploadDropzone } from "~/components/CloudinaryUpload";
import Compressor from "compressorjs";
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

// Define image item type for DnD
type ImageItem = {
  id: string;
  url: string;
  order: number;
};

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
    transform: transform ? CSS.Transform.toString(transform) : undefined,
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
            alt="Donor"
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

// Define the form schema
const donorFormSchema = z.object({
  vin: z.string().min(1, "VIN is required"),
  cost: z.coerce.number().min(0, "Cost must be a positive number"),
  carId: z.string().min(1, "Car is required"),
  year: z.coerce.number().int().min(1900, "Year must be after 1900"),
  mileage: z.coerce.number().int().min(0, "Mileage must be a positive number"),
  imageUrl: z.string().optional(),
  hideFromSearch: z.boolean().default(false),
  dateInStock: z.date().optional().nullable(),
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

type DonorFormValues = z.infer<typeof donorFormSchema>;

interface DonorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: DonorWithCar;
  isEditing?: boolean;
}

export function DonorForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
}: DonorFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [carOpen, setCarOpen] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [carSearchInput, setCarSearchInput] = useState("");

  // DnD sensors for image reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Set up the form with default values
  const form = useForm<DonorFormValues>({
    resolver: zodResolver(donorFormSchema),
    defaultValues: defaultValues
      ? {
          vin: defaultValues.vin,
          cost: defaultValues.cost,
          carId: defaultValues.carId,
          year: defaultValues.year,
          mileage: defaultValues.mileage,
          hideFromSearch: defaultValues.hideFromSearch,
          dateInStock: defaultValues.dateInStock,
          images: defaultValues.images,
        }
      : {
          vin: "",
          cost: 0,
          carId: "",
          year: new Date().getFullYear(),
          mileage: 0,
          imageUrl: "",
          hideFromSearch: false,
          dateInStock: null,
          images: [],
        },
  });

  // Initialize images from default values when available
  useEffect(() => {
    if (defaultValues?.images && defaultValues.images.length > 0) {
      setImages(
        defaultValues.images.map((img) => ({
          id: img.id,
          url: img.url,
          order: img.order,
        })),
      );
    }
  }, [defaultValues]);

  // Reset images and form when dialog closes
  useEffect(() => {
    if (!open) {
      if (!isEditing) {
        form.reset();
      }
      // When dialog closes, reset images state if not in edit mode
      if (!isEditing || !defaultValues) {
        setImages([]);
      }
    }
  }, [open, isEditing, defaultValues, form]);

  // Fetch car options for the select input
  const carOptionsQuery = api.donor.getAllCars.useQuery();
  const allCarOptions = carOptionsQuery.data ?? [];

  // Filter car options based on search input
  const filteredCarOptions = allCarOptions.filter((car) =>
    car.label.toLowerCase().includes(carSearchInput.toLowerCase()),
  );

  // TRPC mutations for creating and updating donors
  const utils = api.useUtils();
  const createDonor = api.donor.create.useMutation({
    onSuccess: () => {
      void utils.donor.getAll.invalidate();
      toast.success("Donor added successfully");
      form.reset();
      onOpenChange(false);
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(`Error adding donor: ${error.message}`);
      setIsSaving(false);
    },
  });

  const updateDonor = api.donor.update.useMutation({
    onSuccess: () => {
      void utils.donor.getAll.invalidate();
      toast.success("Donor updated successfully");
      onOpenChange(false);
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(`Error updating donor: ${error.message}`);
      setIsSaving(false);
    },
  });

  // Helper function to get the car label from its ID
  const getCarLabel = (carId: string) => {
    const car = allCarOptions.find((c) => c.value === carId);
    return car?.label ?? "";
  };

  // Handle image upload
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

  // Form submission handler
  function onSubmit(data: DonorFormValues) {
    setIsSaving(true);

    // Update the images array with the current order before submission
    const updatedImages = images.map((img, index) => ({
      id: img.id,
      url: img.url,
      order: index,
    }));

    const formData = {
      ...data,
      images: updatedImages,
    };

    if (isEditing && defaultValues) {
      // Update existing donor
      updateDonor.mutate({
        vin: defaultValues.vin,
        data: formData,
      });
    } else {
      // Create new donor
      createDonor.mutate(formData);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen && !isEditing) {
          form.reset();
          setImages([]);
        }
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Donor" : "Add New Donor"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this donors information"
              : "Add a new donor to your inventory"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-6 py-4"
          >
            {/* VIN Field - only editable when creating a new donor */}
            <FormField
              control={form.control}
              name="vin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VIN</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter VIN number"
                      {...field}
                      disabled={isEditing}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Car Selection with Command */}
            <FormField
              control={form.control}
              name="carId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Car</FormLabel>
                  <Popover
                    modal={true}
                    open={carOpen}
                    onOpenChange={(open) => {
                      setCarOpen(open);
                      if (!open) {
                        setCarSearchInput("");
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={carOpen}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value
                            ? getCarLabel(field.value)
                            : "Select a car..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search cars..."
                          value={carSearchInput}
                          onValueChange={setCarSearchInput}
                        />
                        <CommandEmpty>No car found.</CommandEmpty>
                        <CommandGroup className="max-h-[300px] overflow-y-auto">
                          {filteredCarOptions.map((car) => (
                            <CommandItem
                              keywords={[car.label]}
                              key={car.value}
                              value={car.label}
                              onSelect={() => {
                                form.setValue("carId", car.value);
                                setCarOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  car.value === field.value
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              {car.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* Year Field */}
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="2010"
                        {...field}
                        onChange={(e) => field.onChange(+e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Mileage Field */}
              <FormField
                control={form.control}
                name="mileage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mileage</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="150000"
                        {...field}
                        onChange={(e) => field.onChange(+e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Cost Field */}
            <FormField
              control={form.control}
              name="cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="5000.00"
                      {...field}
                      onChange={(e) => field.onChange(+e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date In Stock Field */}
            <FormField
              control={form.control}
              name="dateInStock"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date In Stock</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value ? (
                            formatDate(field.value)
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value ?? undefined}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Images Field */}
            <div className="space-y-2">
              <FormLabel>Images</FormLabel>
              <div className="rounded-md border p-4">
                {/* Image Upload Dropzone */}
                <div className="mb-4">
                  <UploadDropzone
                    config={{ mode: "auto" }}
                    endpoint="donorImage"
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

                {/* Sortable Image List */}
                <div className="my-4 border-t pt-4">
                  <div className="mb-2 flex items-center">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">
                      {images.length === 0
                        ? "No images added yet"
                        : `${images.length} image${images.length > 1 ? "s" : ""} (drag to reorder)`}
                    </span>
                  </div>

                  {/* DnD Context for Sorting */}
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

            {/* Hide From Search Field */}
            <FormField
              control={form.control}
              name="hideFromSearch"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Hide from search</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      This donor won&apos;t appear in searches if checked.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving
                  ? "Saving..."
                  : isEditing
                    ? "Save Changes"
                    : "Add Donor"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
