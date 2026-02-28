"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { type AdminListingsItem } from "~/trpc/shared";

type DeleteListingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: AdminListingsItem;
};

export function DeleteListingDialog({
  open,
  onOpenChange,
  listing,
}: DeleteListingDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const utils = api.useUtils();

  const deleteMutation = api.listings.delete.useMutation({
    onSuccess: () => {
      toast.success("Listing retired successfully");
      onOpenChange(false);
      void utils.listings.getAllAdmin.invalidate();
    },
    onError: (error) => {
      toast.error(`Error deleting listing: ${error.message}`);
      setIsDeleting(false);
    },
  });

  const handleDelete = () => {
    setIsDeleting(true);
    deleteMutation.mutate({ id: listing.id });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Retire Listing</DialogTitle>
          <DialogDescription>
            This will retire &quot;{listing.title}&quot; by setting it inactive.
            Historical order references are preserved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Retire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
