"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
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
import { toast } from "sonner";
import { type Location } from "./columns";

interface DeleteLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: Location | null;
}

export function DeleteLocationDialog({
  open,
  onOpenChange,
  location,
}: DeleteLocationDialogProps) {
  const router = useRouter();
  const utils = api.useUtils();

  const deleteLocation = api.location.delete.useMutation({
    onSuccess: () => {
      toast.success("Location deleted successfully");
      onOpenChange(false);
      // Invalidate the location queries to trigger a refetch
      void utils.location.getAll.invalidate();
      router.refresh();
    },
    onError: (error) => {
      toast.error(`Error deleting location: ${error.message}`);
    },
  });

  const handleDelete = () => {
    if (location) {
      deleteLocation.mutate({ id: location.id });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            location
            {location?.name ? ` "${location.name}"` : ""} from the database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
