"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { type Category } from "./columns";

interface DeleteCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category;
}

export function DeleteCategoryDialog({
  open,
  onOpenChange,
  category,
}: DeleteCategoryDialogProps) {
  const utils = api.useUtils();

  const deleteMutation = api.category.delete.useMutation({
    onSuccess: () => {
      toast.success("Category deleted successfully");
      onOpenChange(false);
      void utils.category.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(`Error deleting category: ${error.message}`);
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate({
      id: category.id,
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the category &quot;{category.name}
            &quot;. If this category has child categories, they will also be
            affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
