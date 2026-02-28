"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { type AdminListingsItem } from "~/trpc/shared";
import { toast } from "sonner";

type ListingFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: AdminListingsItem;
  isEditing?: boolean;
  initialPart?: {
    id: string;
    name?: string;
    partNo?: string;
  };
};

const componentSchema = z.object({
  partDetailId: z.string().min(1, "Part detail is required"),
  quantity: z.coerce.number().int().min(1),
});

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  condition: z.string().min(1, "Condition is required"),
  price: z.coerce.number().positive("Price must be positive"),
  components: z.array(componentSchema).min(1, "At least one component is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function ListingForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
  initialPart,
}: ListingFormProps) {
  const utils = api.useUtils();
  const { data: partDetails = [] } = api.part.getAllPartDetails.useQuery();
  const { data: inventoryItems = [] } =
    api.inventory.getAvailableForAllocation.useQuery({
      listingId: defaultValues?.id,
    });
  const createMutation = api.listings.create.useMutation();
  const updateMutation = api.listings.update.useMutation();
  const allocateMutation = api.listings.allocateInventory.useMutation();

  const [allocationIds, setAllocationIds] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      condition: "USED_EXCELLENT",
      price: 0,
      components: [{ partDetailId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "components",
  });

  useEffect(() => {
    if (!open) return;

    if (defaultValues) {
      form.reset({
        title: defaultValues.title,
        description: defaultValues.description,
        condition: defaultValues.condition,
        price: defaultValues.price,
        components:
          defaultValues.components.length > 0
            ? defaultValues.components.map((component) => ({
                partDetailId: component.partDetailId,
                quantity: component.quantity,
              }))
            : [{ partDetailId: "", quantity: 1 }],
      });

      const allocatedAvailableIds = defaultValues.allocatedParts
        .filter((part) => part.status === "AVAILABLE")
        .map((part) => part.id);
      setAllocationIds(allocatedAvailableIds);
      return;
    }

    form.reset({
      title: initialPart?.name ?? "",
      description: "",
      condition: "USED_EXCELLENT",
      price: 0,
      components: initialPart?.partNo
        ? [{ partDetailId: initialPart.partNo, quantity: 1 }]
        : [{ partDetailId: "", quantity: 1 }],
    });

    setAllocationIds(initialPart?.id ? [initialPart.id] : []);
  }, [defaultValues, form, initialPart, open]);

  const selectableInventory = inventoryItems;

  const currentAllocatedIds = useMemo(
    () =>
      defaultValues
        ? defaultValues.allocatedParts
            .filter((part) => part.status === "AVAILABLE")
            .map((part) => part.id)
        : [],
    [defaultValues],
  );

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    allocateMutation.isPending;

  const onSubmit = async (values: FormValues) => {
    const basePayload = {
      title: values.title,
      description: values.description,
      condition: values.condition,
      price: values.price,
      components: values.components,
      images: defaultValues?.images ?? [],
    };

    try {
      const listing =
        isEditing && defaultValues
          ? await updateMutation.mutateAsync({
              id: defaultValues.id,
              data: basePayload,
            })
          : await createMutation.mutateAsync(basePayload);

      const listingId = isEditing && defaultValues ? defaultValues.id : listing.id;
      const assignPartIds = allocationIds.filter(
        (id) => !currentAllocatedIds.includes(id),
      );
      const unassignPartIds = currentAllocatedIds.filter(
        (id) => !allocationIds.includes(id),
      );

      if (assignPartIds.length > 0 || unassignPartIds.length > 0) {
        await allocateMutation.mutateAsync({
          listingId,
          assignPartIds,
          unassignPartIds,
        });
      }

      await Promise.all([
        utils.listings.getAllAdmin.invalidate(),
        utils.inventory.getAvailableForAllocation.invalidate(),
      ]);
      toast.success(isEditing ? "Listing updated" : "Listing created");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save listing");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Listing" : "Create Listing"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      className="min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NEW">New</SelectItem>
                        <SelectItem value="USED_EXCELLENT">Used</SelectItem>
                        <SelectItem value="FOR_PARTS_OR_NOT_WORKING">
                          For parts / not working
                        </SelectItem>
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
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-md border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Components</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => append({ partDetailId: "", quantity: 1 })}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Component
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2">
                    <div className="col-span-8">
                      <FormField
                        control={form.control}
                        name={`components.${index}.partDetailId`}
                        render={({ field: componentField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Part Detail</FormLabel>
                            <Select
                              value={componentField.value}
                              onValueChange={componentField.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select part detail" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {partDetails.map((part) => (
                                  <SelectItem key={part.value} value={part.value}>
                                    {part.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="col-span-3">
                      <FormField
                        control={form.control}
                        name={`components.${index}.quantity`}
                        render={({ field: quantityField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Qty</FormLabel>
                            <FormControl>
                              <Input type="number" min={1} {...quantityField} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="col-span-1 flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-4">
              <h3 className="mb-2 text-sm font-semibold">Inventory Allocation</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Select available inventory items to allocate to this listing.
              </p>

              <div className="max-h-[220px] overflow-y-auto rounded border p-2">
                <div className="flex flex-col gap-2">
                  {selectableInventory.map((item) => {
                    const checked = allocationIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setAllocationIds((prev) => [...prev, item.id]);
                              return;
                            }
                            setAllocationIds((prev) =>
                              prev.filter((partId) => partId !== item.id),
                            );
                          }}
                        />
                        <span className="text-xs">
                          {item.partDetails.name} ({item.partDetails.partNo})
                          {item.variant ? ` - ${item.variant}` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : isEditing
                    ? "Update Listing"
                    : "Create Listing"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
