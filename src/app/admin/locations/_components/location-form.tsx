"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "~/trpc/react";
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
import { toast } from "sonner";
import { type Location } from "./columns";

export const locationFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
});

export type LocationFormValues = z.infer<typeof locationFormSchema>;

interface LocationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: Location;
  isEditing?: boolean;
}

export function LocationForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
}: LocationFormProps) {
  const router = useRouter();
  const utils = api.useUtils();

  // Convert the Location type to LocationFormValues
  const formDefaultValues: LocationFormValues = defaultValues
    ? {
        id: defaultValues.id,
        name: defaultValues.name,
      }
    : {
        name: "",
      };

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: formDefaultValues,
  });

  const createLocation = api.location.create.useMutation({
    onSuccess: () => {
      toast.success("Location created successfully");
      form.reset();
      onOpenChange(false);
      // Invalidate the location queries to trigger a refetch
      void utils.location.getAll.invalidate();
      router.refresh();
    },
    onError: (error) => {
      toast.error(`Error creating location: ${error.message}`);
    },
  });

  const updateLocation = api.location.update.useMutation({
    onSuccess: () => {
      toast.success("Location updated successfully");
      form.reset();
      onOpenChange(false);
      // Invalidate the location queries to trigger a refetch
      void utils.location.getAll.invalidate();
      router.refresh();
    },
    onError: (error) => {
      toast.error(`Error updating location: ${error.message}`);
    },
  });

  function onSubmit(values: LocationFormValues) {
    if (isEditing && defaultValues?.id) {
      updateLocation.mutate({
        id: defaultValues.id,
        data: values,
      });
    } else {
      createLocation.mutate(values);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Location" : "Add New Location"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 py-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Shelf A1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button type="submit">{isEditing ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
