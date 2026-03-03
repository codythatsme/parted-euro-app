"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { AspectRatio } from "~/components/ui/aspect-ratio";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  X,
  GripVertical,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { type AdminInventoryItem } from "~/trpc/shared";
import { useDebounce } from "~/hooks/use-debounce";
import { FilterableCarSelect } from "~/components/ui/filterable-car-select";
import { VirtualizedCombobox } from "~/components/ui/virtualized-combobox";
import { UploadDropzone } from "~/components/CloudinaryUpload";
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
import {
  usePostInventoryDialogs,
  type InventoryCreateResult,
} from "./post-inventory-dialogs";

// ── Mode discriminant ────────────────────────────────────────

export type PartInventoryFormMode =
  | { kind: "addPart" }
  | { kind: "editPart"; defaults: PartDefaults }
  | { kind: "addInventory"; prefillPart?: { partNo: string; name?: string } }
  | { kind: "editInventory"; defaults: AdminInventoryItem }
  | { kind: "duplicateInventory"; defaults: AdminInventoryItem };

/** Subset of part fields needed for editPart mode. */
export type PartDefaults = {
  partNo: string;
  alternatePartNumbers: string | null;
  name: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  costPrice: number | null;
  cars: { id: string }[];
  partTypes: { id: string }[];
};

// ── Image types ──────────────────────────────────────────────

type ImageItem = {
  id: string;
  url: string;
  order: number;
  isFromPartImages?: boolean;
};

type PartImage = {
  id: string;
  url: string;
  order: number;
  partNo: string | null;
  variant?: string | null;
};

// ── SortableImage component ──────────────────────────────────

const SortableImage = ({
  image,
  onRemove,
}: {
  image: ImageItem;
  onRemove: (id: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: image.id });

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

// ── Schema ───────────────────────────────────────────────────

const formSchema = z.object({
  // Inventory fields
  id: z.string().optional(),
  donorVin: z.string().optional().nullable(),
  inventoryLocationId: z.string().optional().nullable(),
  variant: z.string().optional().nullable(),
  status: z
    .enum(["AVAILABLE", "RESERVED", "SOLD", "RETURNED"])
    .default("AVAILABLE"),
  count: z.coerce.number().int().min(1, "Count must be at least 1"),
  images: z
    .array(z.object({ id: z.string(), url: z.string(), order: z.number() }))
    .optional(),

  // Part selection (inventory modes with existing part)
  partDetailsId: z.string().optional(),
  isNewPart: z.boolean().default(false),

  // Part fields
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

  // addPart mode: optional inventory creation
  createInventory: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

// ── Helpers ──────────────────────────────────────────────────

/** Whether mode includes inventory editing/creation. */
function modeHasInventory(mode: PartInventoryFormMode): boolean {
  return mode.kind !== "editPart";
}

/** Whether mode needs the part-search popover (addInventory UX). */
function modeHasPartSearch(mode: PartInventoryFormMode): boolean {
  return (
    mode.kind === "addInventory" ||
    mode.kind === "editInventory" ||
    mode.kind === "duplicateInventory"
  );
}

// ── Component ────────────────────────────────────────────────

type PartInventoryFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PartInventoryFormMode;
};

export function PartInventoryForm({
  open,
  onOpenChange,
  mode,
}: PartInventoryFormProps) {
  // ── State ────────────────────────────────────────────────

  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);
  const [partTypesOpen, setPartTypesOpen] = useState(false);
  const [partSearchOpen, setPartSearchOpen] = useState(false);
  const [isNewPart, setIsNewPart] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [formErrors, setFormErrors] = useState<string | null>(null);
  const [accordionValue, setAccordionValue] = useState<string[]>([
    "inventory-info",
  ]);
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

  // addPart mode: existing part selected from autocomplete
  const [existingPartSelected, setExistingPartSelected] = useState(false);

  // Deferred blur check: set when input blurs before search results arrive
  const [pendingBlurCheck, setPendingBlurCheck] = useState(false);

  // Location modal
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const utils = api.useUtils();

  // ── Post-submit dialogs ──────────────────────────────────

  const postDialogs = usePostInventoryDialogs({
    onComplete: () => {
      onOpenChange(false);
    },
  });

  // ── Queries ──────────────────────────────────────────────

  const { data: searchResults = [], isLoading: isSearching } =
    api.part.searchByPartNo.useQuery(
      { search: debouncedSearchTerm },
      { enabled: debouncedSearchTerm.length >= 2 },
    );

  const { data: donorOptions = [] } = api.donor.getAllDonorsWithCars.useQuery();
  const { data: locationOptions = [] } =
    api.location.getAllLocations.useQuery();
  const { data: carOptions = [] } = api.part.getAllCars.useQuery();
  const { data: partTypeOptions = [] } = api.part.getAllPartTypes.useQuery();

  const inventoryDefaults =
    mode.kind === "editInventory" || mode.kind === "duplicateInventory"
      ? mode.defaults
      : undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getFormDefaults(mode),
  });

  const watchedPartDetailsId = form.watch("partDetailsId");
  const watchedPartNo = form.watch("partNo");
  const shouldCreateInventory = form.watch("createInventory");

  // For addPart mode, use the partNo field for the autocomplete lookup
  const partLookupId =
    mode.kind === "addPart"
      ? existingPartSelected
        ? watchedPartNo
        : undefined
      : watchedPartDetailsId;

  const { data: partDetails, refetch: refetchPartDetails } =
    api.part.getById.useQuery(
      { partNo: partLookupId ?? "" },
      { enabled: !!partLookupId && !isNewPart },
    );

  const partImagesQuery = api.part.getImagesByPartNo.useQuery(
    { partNo: partLookupId ?? "" },
    { enabled: !!partLookupId && !isNewPart },
  );
  const partImages = (partImagesQuery.data ?? []) as PartImage[];

  const groupedPartImages = useMemo(() => {
    const groups = new Map<string, PartImage[]>();
    for (const img of partImages) {
      const key = img.variant?.trim() ?? "Uncategorized";
      const arr = groups.get(key) ?? [];
      arr.push(img);
      groups.set(key, arr);
    }
    return groups;
  }, [partImages]);

  // ── DnD sensors ──────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ── Mutations ────────────────────────────────────────────

  const createPartMutation = api.part.create.useMutation({
    onError: (error) => {
      toast.error(`Error creating part: ${error.message}`);
    },
  });
  const updatePartMutation = api.part.update.useMutation({
    onError: (error) => {
      toast.error(`Error updating part: ${error.message}`);
    },
  });
  const createInventoryMutation = api.inventory.create.useMutation({
    onError: (error) => {
      toast.error(`Error creating inventory: ${error.message}`);
    },
  });
  const updateInventoryMutation = api.inventory.update.useMutation({
    onError: (error) => {
      toast.error(`Error updating inventory: ${error.message}`);
    },
  });
  const createLocationMutation = api.location.create.useMutation({
    onSuccess: (data) => {
      toast.success("Location created");
      setIsLocationModalOpen(false);
      setIsCreatingLocation(false);
      void utils.location.getAllLocations.invalidate();
      form.setValue("inventoryLocationId", data.id);
    },
    onError: (error) => {
      toast.error(`Error creating location: ${error.message}`);
      setIsCreatingLocation(false);
    },
  });

  const locationForm = useForm({
    defaultValues: { name: "" },
    resolver: zodResolver(
      z.object({ name: z.string().min(1, "Location name is required") }),
    ),
  });

  const isSubmitting =
    form.formState.isSubmitting ||
    createPartMutation.isPending ||
    updatePartMutation.isPending ||
    createInventoryMutation.isPending ||
    updateInventoryMutation.isPending ||
    postDialogs.isAllocating;

  // ── Effects ──────────────────────────────────────────────

  // Populate part fields when part details load (inventory modes)
  useEffect(() => {
    if (!partDetails) return;

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
    if (Array.isArray(partDetails.cars)) {
      carIds = partDetails.cars.map((car) => car.id);
      form.setValue("cars", carIds);
      setSelectedCars(carIds);
    }

    let typeIds: string[] = [];
    if (Array.isArray(partDetails.partTypes)) {
      typeIds = partDetails.partTypes.map((type) => type.id);
      form.setValue("partTypes", typeIds);
      setSelectedPartTypes(typeIds);
    }

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

    if (partDetails.defaultLocationId && !form.getValues("inventoryLocationId")) {
      form.setValue("inventoryLocationId", partDetails.defaultLocationId);
    }
  }, [partDetails, form]);

  // Load part details on edit
  useEffect(() => {
    if (
      (mode.kind === "editInventory" || mode.kind === "duplicateInventory") &&
      mode.defaults.partDetailsId
    ) {
      form.setValue("partDetailsId", mode.defaults.partDetailsId);
    }
  }, [mode, form]);

  // Accordion expansion for new part creation
  useEffect(() => {
    if (mode.kind === "addPart") {
      if (existingPartSelected) {
        setAccordionValue(["part-info", "inventory-info"]);
      } else if (shouldCreateInventory) {
        setAccordionValue(["part-info", "inventory-info"]);
      } else {
        setAccordionValue(["part-info"]);
      }
    } else if (isNewPart) {
      setAccordionValue(["part-info", "inventory-info"]);
    } else {
      setAccordionValue(["inventory-info"]);
    }
  }, [isNewPart, mode.kind, existingPartSelected, shouldCreateInventory]);

  // addPart mode: autocomplete handler
  const handleAutocompleteSelect = useCallback(
    (partNo: string) => {
      setExistingPartSelected(true);
      form.setValue("partNo", partNo);
      form.setValue("createInventory", true);
      setPartSearchOpen(false);
      setSearchTerm("");
    },
    [form],
  );

  
  // Retroactive blur check: fires when search results arrive after the input
  // already blurred (e.g. user pastes and immediately clicks away).
  useEffect(() => {
    if (mode.kind !== "addPart") return;
    if (!pendingBlurCheck) return;
    if (existingPartSelected) return;
    if (searchResults.length === 0) return;

    const typedPartNo = form.getValues("partNo")?.trim() ?? "";
    if (typedPartNo.length === 0) return;

    const exactMatch = searchResults.find(
      (r) => r.value.toLowerCase() === typedPartNo.toLowerCase(),
    );

    if (exactMatch) {
      handleAutocompleteSelect(exactMatch.value);
    }
    setPendingBlurCheck(false);
  }, [searchResults, pendingBlurCheck, mode.kind, existingPartSelected, form, handleAutocompleteSelect]);

  // Reset on open
  useEffect(() => {
    if (!open) return;

    setIsNewPart(false);
    setExistingPartSelected(false);
    setPendingBlurCheck(false);
    setSelectedCars([]);
    setSelectedPartTypes([]);
    setSearchTerm("");
    setImages([]);
    setInitialPartValues(null);
    setFormErrors(null);

    const defaults = getFormDefaults(mode);
    form.reset(defaults);

    // Pre-populate cars/partTypes for editPart
    if (mode.kind === "editPart") {
      const carIds = mode.defaults.cars.map((c) => c.id);
      const typeIds = mode.defaults.partTypes.map((t) => t.id);
      setSelectedCars(carIds);
      setSelectedPartTypes(typeIds);
    }

    // Images from defaults
    if (
      (mode.kind === "editInventory" || mode.kind === "duplicateInventory") &&
      mode.defaults.images
    ) {
      if (mode.kind === "duplicateInventory") {
        setImages(
          mode.defaults.images.map((img) => ({
            id: crypto.randomUUID(),
            url: img.url,
            order: img.order,
          })),
        );
      } else {
        setImages(
          mode.defaults.images.map((img) => ({
            id: img.id,
            url: img.url,
            order: img.order,
          })),
        );
      }
    }

    // Trigger refetch for edit
    if (
      (mode.kind === "editInventory" || mode.kind === "duplicateInventory") &&
      mode.defaults.partDetailsId
    ) {
      void refetchPartDetails();
    }
  }, [open, mode, form, refetchPartDetails]);

  // ── Handlers ─────────────────────────────────────────────

  const invalidateAfterMutation = (partNo?: string) => {
    void utils.inventory.getAll.invalidate();
    void utils.part.getAll.invalidate();
    void utils.listings.getAllAdmin.invalidate();
    if (partNo) {
      void utils.part.getById.invalidate({ partNo });
      void utils.part.getImagesByPartNo.invalidate({ partNo });
    }
  };

  const handleImageUpload = (
    results: { url: string; id: string }[],
  ) => {
    const newImages = results.map((result, index) => ({
      id: result.id,
      url: result.url,
      order: images.length + index,
    }));
    setImages((prev) =>
      [...prev, ...newImages].sort((a, b) => a.order - b.order),
    );
  };

  const handleImageRemove = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id.toString();
    const overId = over.id.toString();
    if (activeId === overId) return;
    setImages((items) => {
      const oldIndex = items.findIndex((item) => item.id === activeId);
      const newIndex = items.findIndex((item) => item.id === overId);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  // Part search handlers (addInventory modes)
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

  const handleClearExistingPart = () => {
    setExistingPartSelected(false);
    form.setValue("partNo", "");
    form.setValue("name", "");
    form.setValue("alternatePartNumbers", "");
    form.setValue("weight", 0);
    form.setValue("length", 0);
    form.setValue("width", 0);
    form.setValue("height", 0);
    form.setValue("costPrice", 0);
    form.setValue("cars", []);
    form.setValue("partTypes", []);
    form.setValue("createInventory", false);
    setSelectedCars([]);
    setSelectedPartTypes([]);
    setInitialPartValues(null);
  };

  const handlePartTypeSelect = (value: string) => {
    const next = selectedPartTypes.includes(value)
      ? selectedPartTypes.filter((id) => id !== value)
      : [...selectedPartTypes, value];
    setSelectedPartTypes(next);
    form.setValue("partTypes", next);
  };

  const handleCreateLocation = () => {
    void locationForm.handleSubmit((values) => {
      setIsCreatingLocation(true);
      createLocationMutation.mutate({ name: values.name });
    })();
  };

  // ── Submit ───────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    try {
      setFormErrors(null);

      const wantsSold = values.status === "SOLD";
      const statusForApi = wantsSold ? "AVAILABLE" : values.status;
      const imagesWithOrder = images.map((img, index) => ({
        ...img,
        order: index,
      }));

      // ── addPart mode ──────────────────────────────────────
      if (mode.kind === "addPart") {
        if (existingPartSelected) {
          // Existing part selected — skip part creation, create inventory
          const inventoryResult = await createInventoryMutation.mutateAsync({
            partDetailsId: values.partNo ?? "",
            donorVin: values.donorVin,
            inventoryLocationId: values.inventoryLocationId,
            variant: values.variant,
            status: statusForApi,
            count: values.count,
            images: imagesWithOrder,
          });
          const { keepOpen } = postDialogs.handleResult(
            inventoryResult,
            values.partNo ?? "",
            {
              partName: values.name,
              costPrice: values.costPrice,
              wantsSold,
            },
          );
          invalidateAfterMutation(values.partNo);
          if (!keepOpen) onOpenChange(false);
          return;
        }

        // New part — create PartDetail
        const createdPart = await createPartMutation.mutateAsync({
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
        });

        if (values.createInventory) {
          const inventoryResult = await createInventoryMutation.mutateAsync({
            partDetailsId: createdPart.partNo,
            donorVin: values.donorVin,
            inventoryLocationId: values.inventoryLocationId,
            variant: values.variant,
            status: statusForApi,
            count: values.count,
            images: imagesWithOrder,
          });
          const { keepOpen } = postDialogs.handleResult(
            inventoryResult,
            createdPart.partNo,
            {
              partName: values.name,
              costPrice: values.costPrice,
              wantsSold,
            },
          );
          toast.success(
            `Part ${createdPart.partNo} and inventory created`,
          );
          invalidateAfterMutation(createdPart.partNo);
          if (!keepOpen) onOpenChange(false);
        } else {
          toast.success(`Part ${createdPart.partNo} created`);
          invalidateAfterMutation(createdPart.partNo);
          onOpenChange(false);
        }
        return;
      }

      // ── editPart mode ─────────────────────────────────────
      if (mode.kind === "editPart") {
        await updatePartMutation.mutateAsync({
          partNo: mode.defaults.partNo,
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
        toast.success(`Part ${values.partNo} updated`);
        invalidateAfterMutation(values.partNo);
        onOpenChange(false);
        return;
      }

      // ── Inventory modes (addInventory / editInventory / duplicateInventory) ──
      const isDuplicating = mode.kind === "duplicateInventory";
      const isEditing = mode.kind === "editInventory";

      // Determine if we need to create a new part
      const needsNewPart = isNewPart;

      if (needsNewPart) {
        const newPart = await createPartMutation.mutateAsync({
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
        });
        toast.success(`Part ${values.partNo} created`);

        if (isEditing && !isDuplicating && inventoryDefaults) {
          await updateInventoryMutation.mutateAsync({
            id: inventoryDefaults.id,
            data: {
              partDetailsId: newPart.partNo,
              donorVin: values.donorVin,
              inventoryLocationId: values.inventoryLocationId,
              variant: values.variant,
              status: statusForApi,
              images: imagesWithOrder,
            },
          });
          toast.success("Inventory updated");
          if (wantsSold) {
            postDialogs.handleResult(
              {
                assignment: {
                  createdPartIds: [inventoryDefaults.id],
                  autoAssignedListingId: null,
                  needsSelection: false,
                  noCandidates: false,
                  candidateListings: [],
                },
              },
              newPart.partNo,
              {
                partName: values.name,
                costPrice: values.costPrice,
                wantsSold,
              },
            );
          }
          invalidateAfterMutation(newPart.partNo);
          void utils.part.getAllPartDetails.invalidate();
          onOpenChange(false);
        } else {
          const createResult = await createInventoryMutation.mutateAsync({
            partDetailsId: newPart.partNo,
            donorVin: values.donorVin,
            inventoryLocationId: values.inventoryLocationId,
            variant: values.variant,
            status: statusForApi,
            count: values.count,
            images: imagesWithOrder,
          });
          const { keepOpen } = postDialogs.handleResult(
            createResult,
            newPart.partNo,
            {
              partName: values.name,
              costPrice: values.costPrice,
              wantsSold,
            },
          );
          invalidateAfterMutation(newPart.partNo);
          void utils.part.getAllPartDetails.invalidate();
          if (!keepOpen) onOpenChange(false);
        }
        return;
      }

      // Existing part — maybe update part fields if changed
      const hasChanges =
        initialPartValues &&
        hasPartValueChanges(values, initialPartValues, selectedCars, selectedPartTypes);

      if (hasChanges && values.partDetailsId) {
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
        toast.success(`Part ${values.partNo} updated`);
      }

      // Update or create inventory
      if (isEditing && !isDuplicating && inventoryDefaults) {
        await updateInventoryMutation.mutateAsync({
          id: inventoryDefaults.id,
          data: {
            partDetailsId: values.partDetailsId ?? "",
            donorVin: values.donorVin,
            inventoryLocationId: values.inventoryLocationId,
            variant: values.variant,
            status: statusForApi,
            images: imagesWithOrder,
          },
        });
        toast.success("Inventory updated");
        if (wantsSold) {
          postDialogs.handleResult(
            {
              assignment: {
                createdPartIds: [inventoryDefaults.id],
                autoAssignedListingId: null,
                needsSelection: false,
                noCandidates: false,
                candidateListings: [],
              },
            },
            values.partDetailsId ?? "",
            {
              partName: values.name ?? partDetails?.name,
              costPrice: values.costPrice,
              wantsSold,
            },
          );
        }
        invalidateAfterMutation(values.partDetailsId);
        onOpenChange(false);
      } else {
        const createResult = await createInventoryMutation.mutateAsync({
          partDetailsId: values.partDetailsId ?? "",
          donorVin: values.donorVin,
          inventoryLocationId: values.inventoryLocationId,
          variant: values.variant,
          status: statusForApi,
          count: values.count,
          images: imagesWithOrder,
        });
        const partNo = values.partDetailsId ?? "";
        const { keepOpen } = postDialogs.handleResult(
          createResult,
          partNo,
          {
            partName: values.name ?? partDetails?.name,
            costPrice: values.costPrice,
            wantsSold,
          },
        );
        invalidateAfterMutation(partNo);
        if (!keepOpen) onOpenChange(false);
      }
    } catch (error) {
      console.error("Form submission error:", error);
      setFormErrors(
        error instanceof Error ? error.message : "An error occurred",
      );
    }
  };

  // ── Derived ──────────────────────────────────────────────

  const dialogTitle = (() => {
    switch (mode.kind) {
      case "addPart":
        return existingPartSelected ? "Add Inventory" : "Add New Part";
      case "editPart":
        return "Edit Part";
      case "addInventory":
        return "Add New Inventory Item";
      case "editInventory":
        return "Edit Inventory Item";
      case "duplicateInventory":
        return "Duplicate Inventory Item";
    }
  })();

  const submitLabel = (() => {
    switch (mode.kind) {
      case "editPart":
      case "editInventory":
        return "Update";
      case "duplicateInventory":
        return "Create Duplicate";
      default:
        return "Create";
    }
  })();

  const showInventorySection =
    mode.kind === "addPart"
      ? existingPartSelected || shouldCreateInventory
      : modeHasInventory(mode);

  const partFieldsReadOnly =
    mode.kind === "addPart" ? existingPartSelected : false;

  const showPartSearch = modeHasPartSearch(mode);

  // Whether editing part fields is allowed in inventory modes
  const canEditPartFields = true;

  // ── Render ───────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
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

              {/* ── Part search popover (addInventory modes) ── */}
              {showPartSearch && (
                <div className="space-y-2">
                  <FormLabel>Part Selection*</FormLabel>
                  <Popover
                    open={partSearchOpen}
                    onOpenChange={setPartSearchOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={partSearchOpen}
                        className="w-full justify-between"
                      >
                        {isNewPart
                          ? "Create New Part"
                          : watchedPartDetailsId
                            ? partDetails
                              ? `${partDetails.name} (${partDetails.partNo})`
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
                                No parts found for &quot;
                                {debouncedSearchTerm}&quot;
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
                                  onSelect={() =>
                                    handlePartSelect(part.value)
                                  }
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      watchedPartDetailsId === part.value
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
                        {!isSearching &&
                          debouncedSearchTerm.length < 2 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              Type at least 2 characters to search
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
              )}

              {/* ── addPart mode: part number with autocomplete ── */}
              {mode.kind === "addPart" && (
                <PartNumberAutocomplete
                  form={form}
                  searchResults={searchResults}
                  isSearching={isSearching}
                  debouncedSearchTerm={debouncedSearchTerm}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  existingPartSelected={existingPartSelected}
                  onSelect={handleAutocompleteSelect}
                  onClear={handleClearExistingPart}
                  isEditing={false}
                  setPendingBlurCheck={setPendingBlurCheck}
                />
              )}

              <Accordion
                type="multiple"
                value={accordionValue}
                onValueChange={setAccordionValue}
                className="w-full"
              >
                {/* ── Part Information ── */}
                <AccordionItem value="part-info">
                  <AccordionTrigger>Part Information</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    {/* Part number (not shown in addPart mode — already above) */}
                    <div className="grid grid-cols-2 gap-4">
                      {mode.kind !== "addPart" && (
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
                                  disabled={!(isNewPart && (mode.kind === "addInventory" || mode.kind === "duplicateInventory"))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
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
                                disabled={partFieldsReadOnly}
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
                              disabled={partFieldsReadOnly}
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
                                disabled={partFieldsReadOnly}
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
                                disabled={partFieldsReadOnly}
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
                                disabled={partFieldsReadOnly}
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
                                disabled={partFieldsReadOnly}
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
                                disabled={partFieldsReadOnly}
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
                      render={({ field: _field }) => (
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
                              disabled={!canEditPartFields}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="partTypes"
                      render={({ field: _field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Part Categories</FormLabel>
                          <Popover
                            modal={true}
                            open={partTypesOpen}
                            onOpenChange={setPartTypesOpen}
                          >
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={partTypesOpen}
                                  className={cn(
                                    "justify-between",
                                    !selectedPartTypes.length &&
                                      "text-muted-foreground",
                                  )}
                                  disabled={!canEditPartFields}
                                >
                                  {selectedPartTypes.length > 0
                                    ? `${selectedPartTypes.length} categor${selectedPartTypes.length > 1 ? "ies" : "y"} selected`
                                    : "Select categories"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0">
                              <Command>
                                <CommandInput placeholder="Search categories..." />
                                <CommandEmpty>
                                  No category found.
                                </CommandEmpty>
                                <CommandGroup className="max-h-64 overflow-y-auto">
                                  <CommandList>
                                    {partTypeOptions.map((type) => (
                                      <CommandItem
                                        keywords={[type.label]}
                                        key={type.value}
                                        value={type.value}
                                        onSelect={() =>
                                          handlePartTypeSelect(type.value)
                                        }
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedPartTypes.includes(
                                              type.value,
                                            )
                                              ? "opacity-100"
                                              : "opacity-0",
                                          )}
                                        />
                                        {type.label}
                                      </CommandItem>
                                    ))}
                                  </CommandList>
                                </CommandGroup>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {selectedPartTypes.length > 0 && (
                            <div className="relative mt-1 flex flex-wrap gap-1">
                              {selectedPartTypes.map((id) => {
                                const type = partTypeOptions.find(
                                  (t) => t.value === id,
                                );
                                return (
                                  type && (
                                    <Badge
                                      key={id}
                                      variant="secondary"
                                      className="flex items-center gap-1"
                                    >
                                      {type.label}
                                      {canEditPartFields && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          className="h-4 w-4 p-0 hover:bg-transparent"
                                          onClick={() =>
                                            handlePartTypeSelect(id)
                                          }
                                        >
                                          <span className="sr-only">
                                            Remove
                                          </span>
                                          <span className="text-xs">
                                            ×
                                          </span>
                                        </Button>
                                      )}
                                    </Badge>
                                  )
                                );
                              })}
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* ── Inventory Information ── */}
                {modeHasInventory(mode) && (
                  <AccordionItem value="inventory-info">
                    <AccordionTrigger>
                      Inventory Information
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      {/* addPart mode: checkbox gate */}
                      {mode.kind === "addPart" && !existingPartSelected && (
                        <FormField
                          control={form.control}
                          name="createInventory"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={(checked) =>
                                    field.onChange(Boolean(checked))
                                  }
                                />
                              </FormControl>
                              <div className="grid gap-1.5">
                                <FormLabel className="cursor-pointer">
                                  Create inventory now (optional)
                                </FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                      )}

                      {showInventorySection && (
                        <>
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
                                    field.onChange(
                                      value === "none" ? null : value,
                                    )
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
                                      {
                                        value: "none",
                                        label: "Not assigned",
                                      },
                                      ...locationOptions,
                                    ]}
                                    value={field.value ?? "none"}
                                    onChange={(value) =>
                                      field.onChange(
                                        value === "none" ? null : value,
                                      )
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
                                    onClick={() => {
                                      locationForm.reset({ name: "" });
                                      setIsLocationModalOpen(true);
                                    }}
                                    disabled={isSubmitting}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="count"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    {mode.kind === "editInventory"
                                      ? "Count"
                                      : "Create Multiple"}
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={1}
                                      {...field}
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
                                  <FormLabel>Variant</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Variant (e.g., color, size)"
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
                            name="status"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="AVAILABLE">
                                      Available
                                    </SelectItem>
                                    <SelectItem value="RESERVED">
                                      Reserved
                                    </SelectItem>
                                    <SelectItem value="SOLD">
                                      Sold
                                    </SelectItem>
                                    <SelectItem value="RETURNED">
                                      Returned
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {inventoryDefaults && (
                            <div className="text-xs text-muted-foreground">
                              Allocated To:{" "}
                              <span className="font-medium text-foreground">
                                {inventoryDefaults.allocatedToListing?.title ??
                                  "Unallocated"}
                              </span>
                            </div>
                          )}

                          {/* Images section */}
                          <div className="space-y-2">
                            <FormLabel>Images</FormLabel>
                            <div className="rounded-md border p-4">
                              <div className="mb-4">
                                <UploadDropzone
                                  config={{ mode: "auto" }}
                                  endpoint="inventoryImage"
                                  onBeforeUploadBegin={(files) => {
                                    const compressPromises = files.map(
                                      (file) =>
                                        new Promise<File>(
                                          (resolve, _reject) => {
                                            if (
                                              !file.type.startsWith("image/")
                                            ) {
                                              resolve(file);
                                              return;
                                            }
                                            new Compressor(file, {
                                              quality: 0.8,
                                              maxWidth: 1920,
                                              maxHeight: 1080,
                                              convertSize: 1000000,
                                              success: (compressedFile) => {
                                                resolve(
                                                  new File(
                                                    [compressedFile],
                                                    file.name,
                                                    {
                                                      type: compressedFile.type,
                                                    },
                                                  ),
                                                );
                                              },
                                              error: (err) => {
                                                console.error(
                                                  "Compression error:",
                                                  err,
                                                );
                                                resolve(file);
                                              },
                                            });
                                          },
                                        ),
                                    );
                                    return Promise.all(compressPromises);
                                  }}
                                  onClientUploadComplete={(res) => {
                                    if (res) {
                                      handleImageUpload(
                                        res.map((img) => ({
                                          url: img.serverData.url,
                                          id:
                                            img.serverData.id ??
                                            img.id ??
                                            crypto.randomUUID(),
                                        })),
                                      );
                                      toast.success("Images uploaded");
                                    }
                                  }}
                                  onUploadError={(error: Error) => {
                                    toast.error(
                                      `Upload error: ${error.message}`,
                                    );
                                  }}
                                  className="ut-label:text-lg ut-allowed-content:text-muted-foreground ut-upload-icon:text-muted-foreground rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 transition-all hover:border-muted-foreground/50"
                                />
                              </div>

                              {/* Part image library */}
                              {Array.isArray(partImages) &&
                                partImages.length > 0 &&
                                !isNewPart &&
                                !(
                                  mode.kind === "addPart" &&
                                  !existingPartSelected
                                ) && (
                                  <PartImageLibrary
                                    partImages={partImages}
                                    groupedPartImages={groupedPartImages}
                                    images={images}
                                    setImages={setImages}
                                  />
                                )}

                              {/* Current images with DnD reorder */}
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
                                    strategy={
                                      verticalListSortingStrategy
                                    }
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
                        </>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}
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
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submitLabel}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Location creation modal */}
      <Dialog
        open={isLocationModalOpen}
        onOpenChange={setIsLocationModalOpen}
      >
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
                      <Input
                        placeholder="Enter location name"
                        {...field}
                      />
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

      {postDialogs.dialogElements}
    </>
  );
}

// ── PartNumberAutocomplete ───────────────────────────────────
// Used in addPart mode: shows an inline autocomplete dropdown
// when typing an existing part number.

type PartNumberAutocompleteProps = {
  form: ReturnType<typeof useForm<FormValues>>;
  searchResults: { value: string; label: string }[];
  isSearching: boolean;
  debouncedSearchTerm: string;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  existingPartSelected: boolean;
  onSelect: (partNo: string) => void;
  onClear: () => void;
  isEditing: boolean;
  setPendingBlurCheck: (v: boolean) => void;
};

function PartNumberAutocomplete({
  form,
  searchResults,
  isSearching,
  debouncedSearchTerm,
  searchTerm,
  setSearchTerm,
  existingPartSelected,
  onSelect,
  onClear,
  isEditing,
  setPendingBlurCheck,
}: PartNumberAutocompleteProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Show dropdown when there are results and user is typing
  useEffect(() => {
    if (
      !existingPartSelected &&
      debouncedSearchTerm.length >= 2 &&
      searchResults.length > 0
    ) {
      setDropdownOpen(true);
    } else {
      setDropdownOpen(false);
    }
  }, [debouncedSearchTerm, searchResults, existingPartSelected]);

  return (
    <div className="relative">
      <FormField
        control={form.control}
        name="partNo"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Part Number*</FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input
                  placeholder="Enter part number"
                  {...field}
                  value={field.value ?? ""}
                  disabled={isEditing || existingPartSelected}
                  onChange={(e) => {
                    field.onChange(e);
                    setSearchTerm(e.target.value);
                  }}
                  onBlur={(e) => {
                    field.onBlur();
                    if (existingPartSelected) return;
                    const typed = e.target.value.trim();
                    if (typed.length === 0) return;
                    const match = searchResults.find(
                      (r) => r.value.toLowerCase() === typed.toLowerCase(),
                    );
                    if (match) {
                      onSelect(match.value);
                    } else if (typed.length >= 2) {
                      // Results may still be in-flight; check when they arrive
                      setPendingBlurCheck(true);
                    }
                    setDropdownOpen(false);
                  }}
                />
              </FormControl>
              {existingPartSelected && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Autocomplete dropdown */}
      {dropdownOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-1">
            {isSearching ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto">
                {searchResults.map((part) => (
                  <button
                    key={part.value}
                    type="button"
                    className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(part.value);
                      setDropdownOpen(false);
                    }}
                  >
                    {part.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PartImageLibrary ─────────────────────────────────────────
// Shows part images grouped by variant with "Add all" / individual add buttons.

type PartImageLibraryProps = {
  partImages: PartImage[];
  groupedPartImages: Map<string, PartImage[]>;
  images: ImageItem[];
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>;
};

function PartImageLibrary({
  partImages,
  groupedPartImages,
  images,
  setImages,
}: PartImageLibraryProps) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {partImages.length} image
          {partImages.length !== 1 ? "s" : ""} available for this part
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const newImages = partImages
              .filter(
                (img) => !images.some((existing) => existing.url === img.url),
              )
              .map((img) => ({
                id: img.id,
                url: img.url,
                order: img.order,
                isFromPartImages: true,
              }));
            setImages((prev) =>
              [...prev, ...newImages].sort((a, b) => a.order - b.order),
            );
          }}
        >
          Use all images
        </Button>
      </div>
      <div className="space-y-4">
        {Array.from(groupedPartImages.entries()).map(
          ([variantLabel, imgs]) => (
            <div key={variantLabel} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{variantLabel}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newImages = imgs
                      .filter(
                        (img) =>
                          !images.some(
                            (existing) => existing.url === img.url,
                          ),
                      )
                      .map((img) => ({
                        id: img.id,
                        url: img.url,
                        order: img.order,
                        isFromPartImages: true,
                      }));
                    if (newImages.length === 0) {
                      toast.info("All images from this group already added");
                      return;
                    }
                    setImages((prev) =>
                      [...prev, ...newImages].sort(
                        (a, b) => a.order - b.order,
                      ),
                    );
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
                      const isAlreadyAdded = images.some(
                        (img) => img.url === image.url,
                      );
                      if (!isAlreadyAdded) {
                        setImages((prev) =>
                          [
                            ...prev,
                            {
                              id: image.id,
                              url: image.url,
                              order: image.order,
                              isFromPartImages: true,
                            },
                          ].sort((a, b) => a.order - b.order),
                        );
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
                        <Button type="button" variant="secondary" size="sm">
                          {images.some((img) => img.url === image.url)
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
  );
}

// ── Utility functions ────────────────────────────────────────

function getFormDefaults(mode: PartInventoryFormMode): FormValues {
  switch (mode.kind) {
    case "addPart":
      return {
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
        createInventory: true,
        isNewPart: false,
        donorVin: null,
        inventoryLocationId: null,
        variant: null,
        status: "AVAILABLE",
        count: 1,
        images: [],
      };
    case "editPart":
      return {
        partNo: mode.defaults.partNo,
        alternatePartNumbers: mode.defaults.alternatePartNumbers ?? "",
        name: mode.defaults.name,
        weight: mode.defaults.weight,
        length: mode.defaults.length,
        width: mode.defaults.width,
        height: mode.defaults.height,
        costPrice: mode.defaults.costPrice ?? 0,
        cars: mode.defaults.cars.map((c) => c.id),
        partTypes: mode.defaults.partTypes.map((t) => t.id),
        createInventory: false,
        isNewPart: false,
        donorVin: null,
        inventoryLocationId: null,
        variant: null,
        status: "AVAILABLE",
        count: 1,
        images: [],
      };
    case "addInventory":
      return {
        partDetailsId: mode.prefillPart?.partNo ?? "",
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
        createInventory: false,
        donorVin: null,
        inventoryLocationId: null,
        variant: null,
        status: "AVAILABLE",
        count: 1,
        images: [],
      };
    case "editInventory":
      return {
        id: mode.defaults.id,
        partDetailsId: mode.defaults.partDetailsId ?? "",
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
        createInventory: false,
        donorVin: mode.defaults.donorVin ?? null,
        inventoryLocationId: mode.defaults.inventoryLocationId ?? null,
        variant: mode.defaults.variant ?? null,
        status: mode.defaults.status ?? "AVAILABLE",
        count: 1,
        images: [],
      };
    case "duplicateInventory":
      return {
        partDetailsId: mode.defaults.partDetailsId ?? "",
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
        createInventory: false,
        donorVin: mode.defaults.donorVin ?? null,
        inventoryLocationId: mode.defaults.inventoryLocationId ?? null,
        variant: mode.defaults.variant ?? null,
        status: mode.defaults.status ?? "AVAILABLE",
        count: 1,
        images: [],
      };
  }
}

function hasPartFieldChanges(
  values: FormValues,
  partDetails: {
    partNo?: string;
    name?: string;
    alternatePartNumbers?: string | null;
    weight?: number;
    length?: number;
    width?: number;
    height?: number;
    costPrice?: number | null;
    cars?: { id: string }[];
    partTypes?: { id: string }[];
  },
  selectedCars: string[],
  selectedPartTypes: string[],
): boolean {
  return (
    values.partNo !== partDetails.partNo ||
    values.name !== partDetails.name ||
    values.alternatePartNumbers !== (partDetails.alternatePartNumbers ?? "") ||
    values.weight !== partDetails.weight ||
    values.length !== partDetails.length ||
    values.width !== partDetails.width ||
    values.height !== partDetails.height ||
    values.costPrice !== (partDetails.costPrice ?? 0) ||
    JSON.stringify(selectedCars) !==
      JSON.stringify(partDetails.cars?.map((c) => c.id) ?? []) ||
    JSON.stringify(selectedPartTypes) !==
      JSON.stringify(partDetails.partTypes?.map((t) => t.id) ?? [])
  );
}

function hasPartValueChanges(
  values: FormValues,
  initial: {
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
  },
  selectedCars: string[],
  selectedPartTypes: string[],
): boolean {
  return (
    values.partNo !== initial.partNo ||
    values.name !== initial.name ||
    values.alternatePartNumbers !== initial.alternatePartNumbers ||
    values.weight !== initial.weight ||
    values.length !== initial.length ||
    values.width !== initial.width ||
    values.height !== initial.height ||
    values.costPrice !== initial.costPrice ||
    JSON.stringify(selectedCars) !== JSON.stringify(initial.cars) ||
    JSON.stringify(selectedPartTypes) !== JSON.stringify(initial.partTypes)
  );
}
