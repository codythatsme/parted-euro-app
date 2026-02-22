"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Checkbox } from "~/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { type Part } from "./columns";
import { FilterableCarSelect } from "~/components/ui/filterable-car-select";
import { VirtualizedCombobox } from "~/components/ui/virtualized-combobox";

// Schema for form validation
const formSchema = z.object({
  partNo: z.string().trim().min(1, "Part number is required"),
  alternatePartNumbers: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  weight: z.coerce.number().min(0, "Weight must be a positive number"),
  length: z.coerce.number().min(0, "Length must be a positive number"),
  width: z.coerce.number().min(0, "Width must be a positive number"),
  height: z.coerce.number().min(0, "Height must be a positive number"),
  costPrice: z.coerce
    .number()
    .min(0, "Cost price must be a positive number")
    .optional(),
  cars: z.array(z.string()).default([]),
  partTypes: z.array(z.string()).default([]),
  createInventory: z.boolean().default(false),
  inventoryDonorVin: z.string().optional().nullable(),
  inventoryLocationId: z.string().optional().nullable(),
  inventoryVariant: z.string().optional().nullable(),
  inventoryCount: z.coerce.number().int().min(1).default(1),
});

type FormValues = z.infer<typeof formSchema>;

interface PartFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: Part;
  isEditing?: boolean;
}

export function PartForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
}: PartFormProps) {
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);
  const [partTypesOpen, setPartTypesOpen] = useState(false);

  // Fetch available cars and part types for selects
  const { data: carOptions = [] } = api.part.getAllCars.useQuery();
  const { data: partTypeOptions = [] } = api.part.getAllPartTypes.useQuery();
  const { data: donorOptions = [] } = api.donor.getAllDonorsWithCars.useQuery();
  const { data: locationOptions = [] } = api.location.getAllLocations.useQuery();
  const utils = api.useUtils();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partNo: defaultValues?.partNo ?? "",
      alternatePartNumbers: defaultValues?.alternatePartNumbers ?? "",
      name: defaultValues?.name ?? "",
      weight: defaultValues?.weight ?? 0,
      length: defaultValues?.length ?? 0,
      width: defaultValues?.width ?? 0,
      height: defaultValues?.height ?? 0,
      costPrice: defaultValues?.costPrice ?? 0,
      cars: [],
      partTypes: [],
      createInventory: false,
      inventoryDonorVin: null,
      inventoryLocationId: null,
      inventoryVariant: null,
      inventoryCount: 1,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        partNo: defaultValues.partNo,
        alternatePartNumbers: defaultValues.alternatePartNumbers ?? "",
        name: defaultValues.name,
        weight: defaultValues.weight,
        length: defaultValues.length,
        width: defaultValues.width,
        height: defaultValues.height,
        costPrice: defaultValues.costPrice ?? 0,
        cars: defaultValues.cars.map((car) => car.id),
        partTypes: defaultValues.partTypes.map((type) => type.id),
        createInventory: false,
        inventoryDonorVin: null,
        inventoryLocationId: null,
        inventoryVariant: null,
        inventoryCount: 1,
      });
      setSelectedCars(defaultValues.cars.map((car) => car.id));
      setSelectedPartTypes(defaultValues.partTypes.map((type) => type.id));
    } else {
      form.reset({
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
        inventoryDonorVin: null,
        inventoryLocationId: null,
        inventoryVariant: null,
        inventoryCount: 1,
      });
      setSelectedCars([]);
      setSelectedPartTypes([]);
    }
  }, [defaultValues, form, open]);

  const createMutation = api.part.create.useMutation();
  const updateMutation = api.part.update.useMutation();
  const createInventoryMutation = api.inventory.create.useMutation();

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    createInventoryMutation.isPending;

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && defaultValues) {
        const updatedPart = await updateMutation.mutateAsync({
          partNo: defaultValues.partNo.trim(),
          data: {
            partNo: values.partNo,
            alternatePartNumbers: values.alternatePartNumbers,
            name: values.name,
            weight: values.weight,
            length: values.length,
            width: values.width,
            height: values.height,
            costPrice: values.costPrice,
            cars: selectedCars,
            partTypes: selectedPartTypes,
          },
        });
        toast.success(`Part ${updatedPart.partNo} updated successfully`);
        onOpenChange(false);
        void utils.part.getAll.invalidate();
        void utils.inventory.getAll.invalidate();
        return;
      }

      const createdPart = await createMutation.mutateAsync({
        partNo: values.partNo,
        alternatePartNumbers: values.alternatePartNumbers,
        name: values.name,
        weight: values.weight,
        length: values.length,
        width: values.width,
        height: values.height,
        costPrice: values.costPrice,
        cars: selectedCars,
        partTypes: selectedPartTypes,
      });

      if (values.createInventory) {
        await createInventoryMutation.mutateAsync({
          partDetailsId: createdPart.partNo,
          donorVin: values.inventoryDonorVin,
          inventoryLocationId: values.inventoryLocationId,
          variant: values.inventoryVariant,
          count: values.inventoryCount,
        });
      }

      toast.success(
        values.createInventory
          ? `Part ${createdPart.partNo} and inventory created successfully`
          : `Part ${createdPart.partNo} created successfully`,
      );
      form.reset();
      setSelectedCars([]);
      setSelectedPartTypes([]);
      onOpenChange(false);
      void utils.part.getAll.invalidate();
      void utils.inventory.getAll.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Failed to save part: ${error.message}`
          : "Failed to save part",
      );
    }
  };

  const handlePartTypeSelect = (value: string) => {
    setSelectedPartTypes((current) => {
      if (current.includes(value)) {
        return current.filter((id) => id !== value);
      } else {
        return [...current, value];
      }
    });
    form.setValue(
      "partTypes",
      selectedPartTypes.includes(value)
        ? selectedPartTypes.filter((id) => id !== value)
        : [...selectedPartTypes, value],
    );
  };

  const shouldCreateInventory = form.watch("createInventory");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Part" : "Add New Part"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        disabled={isEditing}
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
                    <Input placeholder="Enter part name" {...field} />
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
                        value={field.value ?? ""}
                        min={0}
                        step={0.01}
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
                        <CommandEmpty>No category found.</CommandEmpty>
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
                                    selectedPartTypes.includes(type.value)
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
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-4 w-4 p-0 hover:bg-transparent"
                                onClick={() => handlePartTypeSelect(id)}
                              >
                                <span className="sr-only">Remove</span>
                                <span className="text-xs">×</span>
                              </Button>
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

            {!isEditing && (
              <div className="flex flex-col gap-4 rounded-md border p-4">
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

                {shouldCreateInventory && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="inventoryCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Inventory Count</FormLabel>
                            <FormControl>
                              <Input type="number" min={1} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="inventoryVariant"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Variant</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Variant (optional)"
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
                      name="inventoryDonorVin"
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
                            placeholder="Select donor (optional)"
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
                          <FormLabel>Inventory Location</FormLabel>
                          <VirtualizedCombobox
                            options={[
                              { value: "none", label: "Not assigned" },
                              ...locationOptions,
                            ]}
                            value={field.value ?? "none"}
                            onChange={(value) =>
                              field.onChange(value === "none" ? null : value)
                            }
                            placeholder="Select location (optional)"
                            searchPlaceholder="Search locations..."
                            disabled={isSubmitting}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
            )}

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
                {isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
