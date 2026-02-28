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
import { type AdminCarItem } from "~/trpc/shared";

export const carFormSchema = z.object({
  id: z.string().optional(),
  make: z.string().min(1, "Make is required"),
  series: z.string().min(1, "Series is required"),
  generation: z.string().min(1, "Generation is required"),
  model: z.string().min(1, "Model is required"),
  body: z.string().optional(),
});

export type CarFormValues = z.infer<typeof carFormSchema>;

interface CarFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: AdminCarItem;
  isEditing?: boolean;
}

export function CarForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
}: CarFormProps) {
  const router = useRouter();
  const utils = api.useUtils();

  // Convert the AdminCarItem type to CarFormValues
  const formDefaultValues: CarFormValues = defaultValues
    ? {
        make: defaultValues.make,
        series: defaultValues.series,
        generation: defaultValues.generation,
        model: defaultValues.model,
        body: defaultValues.body ?? "",
      }
    : {
        make: "",
        series: "",
        generation: "",
        model: "",
        body: "",
      };

  const form = useForm<CarFormValues>({
    resolver: zodResolver(carFormSchema),
    defaultValues: formDefaultValues,
  });

  const createCar = api.car.create.useMutation({
    onSuccess: () => {
      toast.success("Car created successfully");
      form.reset();
      onOpenChange(false);
      // Invalidate the car queries to trigger a refetch
      void utils.car.getAll.invalidate();
      void utils.car.getAllSeries.invalidate();
      router.refresh();
    },
    onError: (error) => {
      toast.error(`Error creating car: ${error.message}`);
    },
  });

  const updateCar = api.car.update.useMutation({
    onSuccess: () => {
      toast.success("Car updated successfully");
      form.reset();
      onOpenChange(false);
      // Invalidate the car queries to trigger a refetch
      void utils.car.getAll.invalidate();
      void utils.car.getAllSeries.invalidate();
      router.refresh();
    },
    onError: (error) => {
      toast.error(`Error updating car: ${error.message}`);
    },
  });

  function onSubmit(values: CarFormValues) {
    if (isEditing && defaultValues?.id) {
      updateCar.mutate({
        id: defaultValues.id,
        data: values,
      });
    } else {
      createCar.mutate(values);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Car" : "Add New Car"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 py-4"
          >
            <FormField
              control={form.control}
              name="make"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Make</FormLabel>
                  <FormControl>
                    <Input placeholder="BMW" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="series"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Series</FormLabel>
                  <FormControl>
                    <Input placeholder="3 Series" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="generation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Generation</FormLabel>
                  <FormControl>
                    <Input placeholder="E46" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Input placeholder="330i" {...field} />
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
