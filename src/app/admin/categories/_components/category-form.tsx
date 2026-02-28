"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "~/components/ui/button";
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
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { type Category } from "./columns";

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  parentId: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: Category;
  isEditing?: boolean;
}

export function CategoryForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
}: CategoryFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: defaultValues?.id ?? undefined,
      name: defaultValues?.name ?? "",
      parentId: defaultValues?.parentId ?? null,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        id: defaultValues.id,
        name: defaultValues.name,
        parentId: defaultValues.parentId,
      });
    } else {
      form.reset({
        id: undefined,
        name: "",
        parentId: null,
      });
    }
  }, [defaultValues, form, open]);

  const { data: categories } = api.category.getAll.useQuery();

  // Filter out the current category and its children if editing
  const filteredCategories = categories?.items.filter((category) => {
    if (!isEditing) return true;
    return category.id !== defaultValues?.id;
  });

  const createMutation = api.category.create.useMutation({
    onSuccess: () => {
      toast.success("Category created successfully");
      form.reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Error creating category: ${error.message}`);
    },
  });

  const updateMutation = api.category.update.useMutation({
    onSuccess: () => {
      toast.success("Category updated successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Error updating category: ${error.message}`);
    },
  });

  const utils = api.useUtils();

  function onSubmit(values: FormValues) {
    if (isEditing && values.id) {
      updateMutation.mutate(
        {
          id: values.id,
          name: values.name,
          parentId: values.parentId,
        },
        {
          onSuccess: () => {
            void utils.category.getAll.invalidate();
          },
        },
      );
    } else {
      createMutation.mutate(
        {
          name: values.name,
          parentId: values.parentId,
        },
        {
          onSuccess: () => {
            void utils.category.getAll.invalidate();
          },
        },
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Category" : "Add New Category"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Category name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Category</FormLabel>
                  <Select
                    onValueChange={(value) =>
                      field.onChange(value === "none" ? null : value)
                    }
                    value={field.value ?? "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a parent category (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {filteredCategories?.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
