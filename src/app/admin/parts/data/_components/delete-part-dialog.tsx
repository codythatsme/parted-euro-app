"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
interface DeletePartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: { partNo: string; name: string };
}

export function DeletePartDialog({
  open,
  onOpenChange,
  part,
}: DeletePartDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const utils = api.useUtils();

  const deleteMutation = api.part.delete.useMutation({
    onSuccess: () => {
      toast.success("Part deleted successfully");
      onOpenChange(false);
      void utils.part.getAll.invalidate();
      void utils.inventory.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete part: ${error.message}`);
    },
    onSettled: () => {
      setIsDeleting(false);
    },
  });

  const handleDelete = () => {
    setIsDeleting(true);
    deleteMutation.mutate({ partNo: part.partNo });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Part</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the part &quot;{part.name}&quot; (Part No:{" "}
            {part.partNo})? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
