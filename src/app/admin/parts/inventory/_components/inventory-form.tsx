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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  Search,
  X,
  GripVertical,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { type AdminInventoryItem } from "~/trpc/shared";
import { useDebounce } from "~/hooks/use-debounce";
import { VirtualizedMultiSelect } from "~/components/ui/virtualized-multi-select";
import { AspectRatio } from "~/components/ui/aspect-ratio";
import { UploadButton, UploadDropzone } from "~/components/UploadThing";
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
import Compressor from "compressorjs";
import { FilterableCarSelect } from "~/components/ui/filterable-car-select";
import { VirtualizedCombobox } from "~/components/ui/virtualized-combobox";

// Define image item type for DnD
type ImageItem = {
  id: string;
  url: string;
  order: number;
  isFromPartImages?: boolean;
};

// Add an interface for part images
interface PartImage {
  id: string;
  url: string;
  order: number;
  partNo: string | null;
  variant?: string | null;
}

// Define interfaces for API requests
interface CreateInventoryInput {
  partDetailsId: string;
  donorVin?: string | null;
  inventoryLocationId?: string | null;
  variant?: string | null;
  quantity: number;
  images?: ImageItem[];
}

interface UpdateInventoryInput {
  id: string;
  data: CreateInventoryInput;
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
            alt="Part"
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

interface InventoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: AdminInventoryItem;
  isEditing?: boolean;
  isDuplicating?: boolean;
}

// Split the validation for better type safety
// Combined schema for part and inventory
const formSchema = z
  .object({
    // Inventory fields
    id: z.string().optional(),
    donorVin: z.string().optional().nullable(),
    inventoryLocationId: z.string().optional().nullable(),
    variant: z.string().optional().nullable(),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    images: z
      .array(
        z.object({
          id: z.string(),
          url: z.string(),
          order: z.number(),
        }),
      )
      .optional(),

    // Part fields
    partDetailsId: z.string().optional(), // Make this optional to allow new part creation
    isNewPart: z.boolean().default(false),
    partNo: z.string().trim().optional(),
    alternatePartNumbers: z.string().optional(),
    name: z.string().optional(),
    weight: z.coerce.number().optional(),
    length: z.coerce.number().optional(),
    width: z.coerce.number().optional(),
    height: z.coerce.number().optional(),
    costPrice: z.coerce.number().optional(),
    cars: z.array(z.string()).default([]),
    partTypes: z.array(z.string()).default([]),
  })
  // Validate existing part selection (when isNewPart is false)
  .refine(({ isNewPart, partDetailsId }) => isNewPart || !!partDetailsId, {
    message: "Part selection is required",
    path: ["partDetailsId"],
  })
  // Validate new part fields (when isNewPart is true)
  .refine(
    ({ isNewPart, partNo, name, weight, length, width, height }) =>
      !isNewPart ||
      (!!partNo &&
        !!name &&
        weight !== undefined &&
        length !== undefined &&
        width !== undefined &&
        height !== undefined),
    {
      message: "Required fields missing for new part",
      path: ["partNo"],
    },
  );

type FormValues = z.infer<typeof formSchema>;

export function InventoryForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
  isDuplicating = false,
}: InventoryFormProps) {
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [partSearchOpen, setPartSearchOpen] = useState(false);
  const [isNewPart, setIsNewPart] = useState(false);
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [initialPartValues, setInitialPartValues] = useState<{
    partNo: string;
    name: string;
    alternatePartNumbers?: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    costPrice?: number;
    cars: string[];
    partTypes: string[];
  } | null>(null);
  const [formErrors, setFormErrors] = useState<string | null>(null);

  const utils = api.useUtils();

  // Fetch search results based on debounced search term
  const { data: searchResults = [], isLoading: isSearching } =
    api.part.searchByPartNo.useQuery(
      { search: debouncedSearchTerm },
      { enabled: debouncedSearchTerm.length >= 2 },
    );

  // Fetch options for select fields
  // Note: We no longer need to fetch all parts upfront
  const { data: donorOptions = [] } = api.donor.getAllDonorsWithCars.useQuery();
  const { data: locationOptions = [] } =
    api.location.getAllLocations.useQuery();
  const { data: carOptions = [] } = api.part.getAllCars.useQuery();
  const { data: partTypeOptions = [] } = api.part.getAllPartTypes.useQuery();

  // DnD sensors for image reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Create form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: isEditing && !isDuplicating ? defaultValues?.id : undefined,
      partDetailsId: defaultValues?.partDetailsId ?? "",
      donorVin: defaultValues?.donorVin ?? null,
      inventoryLocationId: defaultValues?.inventoryLocationId ?? null,
      variant: defaultValues?.variant ?? null,
      quantity: defaultValues?.quantity ?? 1,
      isNewPart: false,
      partNo: "",
      alternatePartNumbers: "",
      name: "",
      weight: 0,
      length: 0,
      width: 0,
      height: 0,
      costPrice: 0,
      cars: [],
      partTypes: [],
      images: [],
    },
  });

  // Create a separate form for location creation
  const locationForm = useForm({
    defaultValues: {
      name: "",
    },
    resolver: zodResolver(
      z.object({
        name: z.string().min(1, "Location name is required"),
      }),
    ),
  });

  // Mutations for create, update, and create new location
  const createInventoryMutation = api.inventory.create.useMutation({
    onError: (error) => {
      toast.error(`Error creating inventory item: ${error.message}`);
    },
  });

  const updateInventoryMutation = api.inventory.update.useMutation({
    onError: (error) => {
      toast.error(`Error updating inventory item: ${error.message}`);
    },
  });

  const createPartMutation = api.part.create.useMutation({
    onError: (error) => {
      toast.error(`Error creating part: ${error.message}`);
    },
  });

  const createLocationMutation = api.location.create.useMutation({
    onSuccess: (data) => {
      toast.success("Location created successfully");
      setIsLocationModalOpen(false);
      setNewLocationName("");
      setIsCreatingLocation(false);
      void utils.location.getAllLocations.invalidate();
      // Set the new location as the selected value
      form.setValue("inventoryLocationId", data.id);
    },
    onError: (error) => {
      toast.error(`Error creating location: ${error.message}`);
      setIsCreatingLocation(false);
    },
  });

  const updatePartMutation = api.part.update.useMutation({
    onError: (error) => {
      toast.error(`Error updating part: ${error.message}`);
    },
  });

  const isSubmitting =
    form.formState.isSubmitting ||
    createInventoryMutation.isPending ||
    updateInventoryMutation.isPending ||
    createPartMutation.isPending;

  // For the part selection dropdown
  const selectedPartId = form.watch("partDetailsId");
  const selectedPartDetails = React.useMemo(() => {
    return selectedPartId
      ? searchResults.find((part) => part.value === selectedPartId)
      : null;
  }, [selectedPartId, searchResults]);

  // Try to fetch part images if the API endpoint exists
  const partImagesQuery = api.part.getImagesByPartNo.useQuery(
    { partNo: selectedPartId ?? "" },
    {
      enabled: !!selectedPartId && !isNewPart,
    },
  );

  const partImages = (partImagesQuery.data ?? []) as PartImage[];

  // Group part images by variant for display
  const groupedPartImages = React.useMemo(() => {
    const groups = new Map<string, PartImage[]>();
    for (const img of partImages) {
      const key = img.variant?.trim() ?? "Uncategorized";
      const arr = groups.get(key) ?? [];
      arr.push(img);
      groups.set(key, arr);
    }
    return groups;
  }, [partImages]);

  // We need to fetch full part details when selecting a part
  // Let's use getById query instead
  const { data: partDetails, refetch: refetchPartDetails } =
    api.part.getById.useQuery(
      { partNo: selectedPartId ?? "" },
      {
        enabled: !!selectedPartId && !isNewPart,
      },
    );

  // Modify the effect that populates part details to also save initial values
  useEffect(() => {
    if (partDetails) {
      // Always populate the form with part details, regardless of editing state
      const partNo = partDetails.partNo ?? "";
      const name = partDetails.name ?? "";
      const alternatePartNumbers = partDetails.alternatePartNumbers ?? "";
      const weight = partDetails.weight ?? 0;
      const length = partDetails.length ?? 0;
      const width = partDetails.width ?? 0;
      const height = partDetails.height ?? 0;
      const costPrice = partDetails.costPrice ?? 0;

      form.setValue("name", name);
      form.setValue("partNo", partNo);
      form.setValue("alternatePartNumbers", alternatePartNumbers);
      form.setValue("weight", weight);
      form.setValue("length", length);
      form.setValue("width", width);
      form.setValue("height", height);
      form.setValue("costPrice", costPrice);

      let carIds: string[] = [];
      if (partDetails.cars && Array.isArray(partDetails.cars)) {
        carIds = partDetails.cars.map((car) => car.id);
        form.setValue("cars", carIds);
        setSelectedCars(carIds);
      }

      let typeIds: string[] = [];
      if (partDetails.partTypes && Array.isArray(partDetails.partTypes)) {
        typeIds = partDetails.partTypes.map((type) => type.id);
        form.setValue("partTypes", typeIds);
        setSelectedPartTypes(typeIds);
      }

      // Save initial values to compare against when submitting
      setInitialPartValues({
        partNo,
        name,
        alternatePartNumbers,
        weight,
        length,
        width,
        height,
        costPrice,
        cars: carIds,
        partTypes: typeIds,
      });
    }
  }, [partDetails, form]);

  // When editing, load part details
  useEffect(() => {
    if (defaultValues && isEditing && defaultValues.partDetailsId) {
      form.setValue("partDetailsId", defaultValues.partDetailsId);
    }
  }, [defaultValues, isEditing, form]);

  // Add state for accordion open values
  const [accordionValue, setAccordionValue] = useState<string[]>([
    "inventory-info",
  ]);

  // Update accordion value when isNewPart changes
  useEffect(() => {
    if (isNewPart) {
      setAccordionValue(["part-info", "inventory-info"]);
    } else {
      setAccordionValue(["inventory-info"]);
    }
  }, [isNewPart]);

  // Reset form and state when dialog opens or defaultValues change
  useEffect(() => {
    if (open) {
      // Reset state variables
      setIsNewPart(false);
      setSelectedCars([]);
      setSelectedPartTypes([]);
      setSearchTerm("");
      setImages([]);
      setInitialPartValues(null);
      setFormErrors(null);
      setAccordionValue(["inventory-info"]);

      // Reset form with new default values
      form.reset({
        id: isEditing && !isDuplicating ? defaultValues?.id : undefined,
        partDetailsId: defaultValues?.partDetailsId ?? "",
        donorVin: defaultValues?.donorVin ?? null,
        inventoryLocationId: defaultValues?.inventoryLocationId ?? null,
        variant: defaultValues?.variant ?? null,
        quantity: defaultValues?.quantity ?? 1,
        isNewPart: false,
        partNo: "",
        alternatePartNumbers: "",
        name: "",
        weight: 0,
        length: 0,
        width: 0,
        height: 0,
        costPrice: 0,
        cars: [],
        partTypes: [],
        images: [],
      });

      // If this is an edit operation, trigger refetch of part details
      if (isEditing && defaultValues?.partDetailsId) {
        void refetchPartDetails();
      }

      // Initialize images from default values
      if (defaultValues?.images) {
        if (isDuplicating) {
          // For duplicating, create new IDs while keeping other properties
          setImages(
            defaultValues.images.map((img) => ({
              id: crypto.randomUUID(), // Generate new ID
              url: img.url,
              order: img.order,
            })),
          );
        } else {
          // For editing, keep existing IDs
          setImages(
            defaultValues.images.map((img) => ({
              id: img.id,
              url: img.url,
              order: img.order,
            })),
          );
        }
      }
    }
  }, [open, defaultValues, isEditing, isDuplicating, form, refetchPartDetails]);

  // Handle image upload completion
  const handleImageUpload = (
    results: {
      url: string;
      id: string;
    }[],
  ) => {
    const newImages = results.map((result, index) => ({
      id: result.id,
      url: result.url,
      order: images.length + index,
    }));

    setImages((prev) => {
      const combined = [...prev, ...newImages];
      // Sort by order to maintain proper sequence
      return combined.sort((a, b) => a.order - b.order);
    });
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

  const onSubmit = async (values: FormValues) => {
    try {
      setFormErrors(null);

      // Include ordered images
      const imagesWithOrder = images.map((img, index) => ({
        ...img,
        order: index, // Update order based on current array position
      }));

      // For duplication, we need special handling - if any part details changed, create a new part
      const needsNewPart =
        isDuplicating &&
        (values.partNo !== partDetails?.partNo ||
          values.name !== partDetails?.name ||
          values.alternatePartNumbers !== partDetails?.alternatePartNumbers ||
          values.weight !== partDetails?.weight ||
          values.length !== partDetails?.length ||
          values.width !== partDetails?.width ||
          values.height !== partDetails?.height ||
          values.costPrice !== partDetails?.costPrice ||
          JSON.stringify(selectedCars) !==
            JSON.stringify(partDetails?.cars?.map((car) => car.id) ?? []) ||
          JSON.stringify(selectedPartTypes) !==
            JSON.stringify(
              partDetails?.partTypes?.map((type) => type.id) ?? [],
            ));

      // If it's a new part or duplicating with changes, create a new part
      if (isNewPart || needsNewPart) {
        const partData = {
          partNo: values.partNo ?? "",
          alternatePartNumbers: values.alternatePartNumbers ?? "",
          name: values.name ?? "",
          weight: values.weight ?? 0,
          length: values.length ?? 0,
          width: values.width ?? 0,
          height: values.height ?? 0,
          costPrice: values.costPrice ?? 0,
          cars: selectedCars,
          partTypes: selectedPartTypes,
        };

        try {
          const newPart = await createPartMutation.mutateAsync(partData);
          toast.success(`Part ${values.partNo} created successfully`);

          // After creating the part, proceed with inventory creation using the new partDetailsId
          if (newPart && newPart.partNo) {
            const inventoryData: CreateInventoryInput = {
              partDetailsId: newPart.partNo,
              donorVin: values.donorVin,
              inventoryLocationId: values.inventoryLocationId,
              variant: values.variant,
              quantity: values.quantity,
              images: imagesWithOrder,
            };

            if (isEditing && !isDuplicating && defaultValues) {
              await updateInventoryMutation.mutateAsync({
                id: defaultValues.id,
                data: inventoryData,
              });
              toast.success("Inventory item updated successfully");
            } else {
              await createInventoryMutation.mutateAsync(inventoryData);
              toast.success("Inventory item created successfully");
            }

            // Success - close the form
            onOpenChange(false);
            void utils.inventory.getAll.invalidate();
            void utils.part.getAllPartDetails.invalidate();
            void utils.part.getById.invalidate({ partNo: newPart.partNo });
            void utils.part.getImagesByPartNo.invalidate({
              partNo: newPart.partNo,
            });
          } else {
            setFormErrors("Failed to create part. Please try again.");
          }
        } catch (error) {
          console.error("Error creating part:", error);
          setFormErrors(
            "Error creating part: " +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      } else {
        // Handle existing part updates
        const hasPartChanges =
          initialPartValues &&
          (values.partNo !== initialPartValues.partNo ||
            values.name !== initialPartValues.name ||
            values.alternatePartNumbers !==
              initialPartValues.alternatePartNumbers ||
            values.weight !== initialPartValues.weight ||
            values.length !== initialPartValues.length ||
            values.width !== initialPartValues.width ||
            values.height !== initialPartValues.height ||
            values.costPrice !== initialPartValues.costPrice ||
            JSON.stringify(selectedCars) !==
              JSON.stringify(initialPartValues.cars) ||
            JSON.stringify(selectedPartTypes) !==
              JSON.stringify(initialPartValues.partTypes));

        // If part details have changed, update the part
        if (hasPartChanges && values.partDetailsId && !isDuplicating) {
          try {
            await updatePartMutation.mutateAsync({
              partNo: values.partDetailsId,
              data: {
                partNo: values.partNo ?? "",
                alternatePartNumbers: values.alternatePartNumbers ?? "",
                name: values.name ?? "",
                weight: values.weight ?? 0,
                length: values.length ?? 0,
                width: values.width ?? 0,
                height: values.height ?? 0,
                costPrice: values.costPrice ?? 0,
                cars: selectedCars,
                partTypes: selectedPartTypes,
              },
            });
            toast.success(`Part ${values.partNo} updated successfully`);
          } catch (error) {
            console.error("Error updating part:", error);
            setFormErrors(
              "Error updating part: " +
                (error instanceof Error ? error.message : String(error)),
            );
            return;
          }
        }

        // Update or create inventory item
        try {
          if (isEditing && !isDuplicating && defaultValues) {
            const updateData: UpdateInventoryInput = {
              id: defaultValues.id,
              data: {
                partDetailsId: values.partDetailsId ?? "",
                donorVin: values.donorVin,
                inventoryLocationId: values.inventoryLocationId,
                variant: values.variant,
                quantity: values.quantity,
                images: imagesWithOrder,
              },
            };
            await updateInventoryMutation.mutateAsync(updateData);
            toast.success("Inventory item updated successfully");
          } else {
            const createData: CreateInventoryInput = {
              partDetailsId: values.partDetailsId ?? "",
              donorVin: values.donorVin,
              inventoryLocationId: values.inventoryLocationId,
              variant: values.variant,
              quantity: values.quantity,
              images: imagesWithOrder,
            };
            await createInventoryMutation.mutateAsync(createData);
            toast.success("Inventory item created successfully");
          }

          // Success - close the form
          onOpenChange(false);
          void utils.inventory.getAll.invalidate();
          if (values.partDetailsId) {
            void utils.part.getById.invalidate({
              partNo: values.partDetailsId,
            });
            void utils.part.getImagesByPartNo.invalidate({
              partNo: values.partDetailsId,
            });
          }
        } catch (error) {
          console.error("Error with inventory operation:", error);
          setFormErrors(
            "Error with inventory: " +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }
    } catch (error) {
      console.error("Error in form submission:", error);
      setFormErrors("An error occurred while submitting the form");
    }
  };

  // Debug form errors
  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) {
      console.log("Form validation errors:", form.formState.errors);
    }
  }, [form.formState.errors]);

  const handleCreateLocation = () => {
    void locationForm.handleSubmit((values) => {
      setIsCreatingLocation(true);
      createLocationMutation.mutate({ name: values.name });
    })();
  };

  const handleAddNewLocation = () => {
    locationForm.reset({ name: "" });
    setIsLocationModalOpen(true);
  };

  const handlePartSelect = (partDetailsId: string) => {
    form.setValue("partDetailsId", partDetailsId);
    form.setValue("isNewPart", false);
    setIsNewPart(false);
    setPartSearchOpen(false);
    setSearchTerm("");
  };

  const handleCreateNewPart = () => {
    form.setValue("isNewPart", true);
    setIsNewPart(true);
    // Reset part fields
    form.setValue("partDetailsId", "");
    form.setValue("partNo", searchTerm);
    form.setValue("name", "");
    form.setValue("alternatePartNumbers", "");
    form.setValue("weight", 0);
    form.setValue("length", 0);
    form.setValue("width", 0);
    form.setValue("height", 0);
    form.setValue("costPrice", 0);
    form.setValue("cars", []);
    form.setValue("partTypes", []);
    setSelectedCars([]);
    setSelectedPartTypes([]);
    setPartSearchOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? "Edit Inventory Item"
                : isDuplicating
                  ? "Duplicate Inventory Item"
                  : "Add New Inventory Item"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {formErrors && (
                <div className="rounded bg-destructive/15 p-3 text-sm text-destructive">
                  {formErrors}
                </div>
              )}

              {form.formState.errors.root?.message && (
                <div className="rounded bg-destructive/15 p-3 text-sm text-destructive">
                  {form.formState.errors.root.message}
                </div>
              )}

              {Object.keys(form.formState.errors).length > 0 &&
                !formErrors &&
                !form.formState.errors.root?.message && (
                  <div className="rounded bg-destructive/15 p-3 text-sm text-destructive">
                    Please fix the highlighted errors below to continue.
                  </div>
                )}

              <div className="space-y-2">
                <FormLabel>Part Selection*</FormLabel>
                <Popover open={partSearchOpen} onOpenChange={setPartSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={partSearchOpen}
                      className="w-full justify-between"
                    >
                      {isNewPart
                        ? "Create New Part"
                        : form.watch("partDetailsId")
                          ? searchResults.find(
                              (p) => p.value === form.watch("partDetailsId"),
                            )?.label || partDetails?.name
                            ? `${partDetails?.name} (${partDetails?.partNo})`
                            : "Select a part"
                          : "Select or create a part"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search parts by number or name..."
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                        className="w-full"
                      />
                      {isSearching && (
                        <div className="py-6 text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!isSearching &&
                        debouncedSearchTerm.length >= 2 &&
                        searchResults.length === 0 && (
                          <div className="p-4 text-center">
                            <p className="text-sm text-muted-foreground">
                              No parts found for &quot;{debouncedSearchTerm}
                              &quot;
                            </p>
                            <Button
                              onClick={handleCreateNewPart}
                              size="sm"
                              className="mt-2"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create New Part
                            </Button>
                          </div>
                        )}
                      {!isSearching && searchResults.length > 0 && (
                        <CommandGroup heading="Parts">
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            {searchResults.map((part) => (
                              <CommandItem
                                key={part.value}
                                value={part.value}
                                onSelect={() => handlePartSelect(part.value)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    form.watch("partDetailsId") === part.value
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {part.label}
                              </CommandItem>
                            ))}
                          </CommandList>
                        </CommandGroup>
                      )}
                      {!isSearching && debouncedSearchTerm.length < 2 && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          Type at least 2 characters to search for parts
                        </div>
                      )}
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem onSelect={handleCreateNewPart}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create New Part
                        </CommandItem>
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <Accordion
                type="multiple"
                value={accordionValue}
                onValueChange={setAccordionValue}
                className="w-full"
              >
                <AccordionItem value="part-info">
                  <AccordionTrigger>Part Information</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="partNo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Part Number*</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter part number"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="alternatePartNumbers"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Alternate Part Numbers</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Comma separated alternate numbers"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name*</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter part name"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="weight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Weight (kg)*</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Weight in kg"
                                {...field}
                                min={0}
                                step={0.01}
                                value={field.value ?? 0}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="costPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost Price ($)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Cost price"
                                {...field}
                                min={0}
                                step={0.01}
                                value={field.value ?? 0}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="length"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Length (cm)*</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Length"
                                {...field}
                                min={0}
                                step={0.1}
                                value={field.value ?? 0}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="width"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Width (cm)*</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Width"
                                {...field}
                                min={0}
                                step={0.1}
                                value={field.value ?? 0}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="height"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Height (cm)*</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Height"
                                {...field}
                                min={0}
                                step={0.1}
                                value={field.value ?? 0}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="cars"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Compatible Cars</FormLabel>
                          <FormControl>
                            <FilterableCarSelect
                              options={carOptions}
                              value={selectedCars}
                              onChange={(values) => {
                                setSelectedCars(values);
                                form.setValue("cars", values);
                              }}
                              placeholder="Select cars"
                              searchPlaceholder="Search cars..."
                              height="300px"
                              disabled={!isNewPart && !isEditing}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="partTypes"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Part Categories</FormLabel>
                          <FormControl>
                            <VirtualizedMultiSelect
                              options={partTypeOptions}
                              value={selectedPartTypes}
                              onChange={(values) => {
                                setSelectedPartTypes(values);
                                form.setValue("partTypes", values);
                              }}
                              placeholder="Select categories"
                              searchPlaceholder="Search categories..."
                              height="300px"
                              disabled={!isNewPart && !isEditing}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="inventory-info">
                  <AccordionTrigger>Inventory Information</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="donorVin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Donor Car</FormLabel>
                          <VirtualizedCombobox
                            options={[
                              { value: "none", label: "None" },
                              ...donorOptions,
                            ]}
                            value={field.value ?? "none"}
                            onChange={(value) =>
                              field.onChange(value === "none" ? null : value)
                            }
                            placeholder="Select a donor car (optional)"
                            searchPlaceholder="Search donor cars..."
                            disabled={isSubmitting}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="inventoryLocationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <div className="flex gap-2">
                            <VirtualizedCombobox
                              options={[
                                { value: "none", label: "Not assigned" },
                                ...locationOptions,
                              ]}
                              value={field.value ?? "none"}
                              onChange={(value) =>
                                field.onChange(value === "none" ? null : value)
                              }
                              placeholder="Select a location (optional)"
                              searchPlaceholder="Search locations..."
                              disabled={isSubmitting}
                              triggerClassName="w-full"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={handleAddNewLocation}
                              disabled={isSubmitting}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity*</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} />
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
                          <FormLabel>Variant</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Variant (e.g., color, size, etc.)"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <FormLabel>Images</FormLabel>
                      <div className="rounded-md border p-4">
                        <div className="mb-4">
                          <UploadDropzone
                            config={{ mode: "auto" }}
                            endpoint="inventoryImage"
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
                                        console.error(
                                          "Compression error:",
                                          err,
                                        );
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
                                handleImageUpload(
                                  res.map((img) => img.serverData),
                                );
                                toast.success("Images uploaded successfully");
                              }
                            }}
                            onUploadError={(error: Error) => {
                              toast.error(
                                `Error uploading images: ${error.message}`,
                              );
                            }}
                            className="ut-label:text-lg ut-allowed-content:text-muted-foreground ut-upload-icon:text-muted-foreground rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 transition-all hover:border-muted-foreground/50"
                          />
                        </div>

                        {Array.isArray(partImages) &&
                          partImages.length > 0 &&
                          !isNewPart && (
                            <div className="mb-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">
                                  {partImages.length} image
                                  {partImages.length !== 1 ? "s" : ""} available
                                  for this part
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    // Add all part images to the current images
                                    const newImages = partImages
                                      .filter(
                                        (img) =>
                                          !images.some(
                                            (existing) =>
                                              existing.url === img.url,
                                          ),
                                      )
                                      .map((img) => ({
                                        id: img.id,
                                        url: img.url,
                                        order: img.order, // Use the original order from database
                                        isFromPartImages: true,
                                      }));

                                    setImages((prev) => {
                                      const combined = [...prev, ...newImages];
                                      // Sort by order to maintain proper sequence
                                      return combined.sort(
                                        (a, b) => a.order - b.order,
                                      );
                                    });
                                  }}
                                >
                                  Use all images
                                </Button>
                              </div>
                              <div className="space-y-4">
                                {Array.from(groupedPartImages.entries()).map(
                                  ([variantLabel, imgs]) => (
                                    <div
                                      key={variantLabel}
                                      className="space-y-2"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="text-sm font-semibold">
                                          {variantLabel}
                                        </div>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            const newImages = imgs
                                              .filter(
                                                (img) =>
                                                  !images.some(
                                                    (existing) =>
                                                      existing.url === img.url,
                                                  ),
                                              )
                                              .map((img) => ({
                                                id: img.id,
                                                url: img.url,
                                                order: img.order,
                                                isFromPartImages: true,
                                              }));

                                            if (newImages.length === 0) {
                                              toast.info(
                                                "All images from this group are already added",
                                              );
                                              return;
                                            }

                                            setImages((prev) => {
                                              const combined = [
                                                ...prev,
                                                ...newImages,
                                              ];
                                              return combined.sort(
                                                (a, b) => a.order - b.order,
                                              );
                                            });

                                            toast.success(
                                              `${newImages.length} image${newImages.length === 1 ? "" : "s"} added from ${variantLabel}`,
                                            );
                                          }}
                                        >
                                          Add all
                                        </Button>
                                      </div>
                                      <div className="grid grid-cols-4 gap-2">
                                        {imgs.map((image) => (
                                          <div
                                            key={image.id}
                                            className="group relative cursor-pointer overflow-hidden rounded-md border"
                                            onClick={() => {
                                              const isAlreadyAdded =
                                                images.some(
                                                  (img) =>
                                                    img.url === image.url,
                                                );
                                              if (!isAlreadyAdded) {
                                                setImages((prev) => {
                                                  const newImage = {
                                                    id: image.id,
                                                    url: image.url,
                                                    order: image.order,
                                                    isFromPartImages: true,
                                                  };
                                                  const combined = [
                                                    ...prev,
                                                    newImage,
                                                  ];
                                                  return combined.sort(
                                                    (a, b) => a.order - b.order,
                                                  );
                                                });
                                                toast.success(
                                                  "Image added to selection",
                                                );
                                              } else {
                                                toast.info(
                                                  "Image already in selection",
                                                );
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
                                                <Button
                                                  type="button"
                                                  variant="secondary"
                                                  size="sm"
                                                >
                                                  {images.some(
                                                    (img) =>
                                                      img.url === image.url,
                                                  )
                                                    ? "Already added"
                                                    : "Add to selection"}
                                                </Button>
                                              </div>
                                            </AspectRatio>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ),
                                )}
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() => {
                    if (Object.keys(form.formState.errors).length > 0) {
                      console.log(
                        "Validation errors on submit:",
                        form.formState.errors,
                      );
                    }
                  }}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing
                    ? "Update"
                    : isDuplicating
                      ? "Create Duplicate"
                      : "Create"}
                </Button>
              </DialogFooter>

              {/* Debug section in development only */}
              {process.env.NODE_ENV === "development" &&
                Object.keys(form.formState.errors).length > 0 && (
                  <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
                    <strong>Form validation errors:</strong>
                    <pre className="mt-2 overflow-auto">
                      {JSON.stringify(form.formState.errors, null, 2)}
                    </pre>
                  </div>
                )}
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create new location dialog */}
      <Dialog open={isLocationModalOpen} onOpenChange={setIsLocationModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New Location</DialogTitle>
          </DialogHeader>
          <Form {...locationForm}>
            <form
              onSubmit={locationForm.handleSubmit(handleCreateLocation)}
              className="space-y-4"
            >
              <FormField
                control={locationForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Name*</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter location name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsLocationModalOpen(false)}
                  disabled={isCreatingLocation}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreatingLocation}>
                  {isCreatingLocation && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
