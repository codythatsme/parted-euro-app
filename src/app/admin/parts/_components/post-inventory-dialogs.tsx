"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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
import { VirtualizedCombobox } from "~/components/ui/virtualized-combobox";
import { usePendingOrder } from "~/components/pending-order-provider";
import { api } from "~/trpc/react";
import { ListingForm } from "~/app/admin/listings/_components/listing-form";

// ── Shared types ─────────────────────────────────────────────

type ListingAssignmentCandidate = {
  id: string;
  title: string;
};

export type InventoryCreateAssignment = {
  createdPartIds: string[];
  autoAssignedListingId: string | null;
  needsSelection: boolean;
  noCandidates: boolean;
  candidateListings: ListingAssignmentCandidate[];
};

export type InventoryCreateResult = {
  assignment: InventoryCreateAssignment;
};

type PendingListingAssignment = {
  partNo: string;
  createdPartIds: string[];
  candidateListings: ListingAssignmentCandidate[];
};

type PendingListingCreate = {
  partNo: string;
  partName: string;
  createdPartIds: string[];
};

type SoldPartPrompt = {
  partIds: string[];
  description: string;
  partNo: string;
  costPrice: number;
};

// ── Hook ─────────────────────────────────────────────────────

type UsePostInventoryDialogsOpts = {
  onComplete: (partNo?: string) => void;
};

/**
 * Encapsulates the post-inventory-creation dialog cascade:
 * 1. Listing assignment selection (multiple candidate listings)
 * 2. "No listing found" prompt → optional inline ListingForm
 * 3. Sold-to-pending-order prompt
 *
 * Returns `handleResult` to kick off the cascade after inventory
 * creation, and `dialogElements` to render in JSX.
 */
export function usePostInventoryDialogs({
  onComplete,
}: UsePostInventoryDialogsOpts) {
  const [pendingListingAssignment, setPendingListingAssignment] =
    useState<PendingListingAssignment | null>(null);
  const [selectedListingId, setSelectedListingId] = useState("");
  const [pendingListingCreate, setPendingListingCreate] =
    useState<PendingListingCreate | null>(null);
  const [showListingForm, setShowListingForm] = useState(false);
  const [soldPartPrompt, setSoldPartPrompt] = useState<SoldPartPrompt | null>(
    null,
  );

  const pendingOrder = usePendingOrder();
  const utils = api.useUtils();

  const allocateMutation = api.listings.allocateInventory.useMutation({
    onError: (error) => {
      toast.error(`Failed to assign inventory: ${error.message}`);
    },
  });

  const invalidate = (partNo?: string) => {
    void utils.inventory.getAll.invalidate();
    void utils.part.getAll.invalidate();
    void utils.listings.getAllAdmin.invalidate();
    if (partNo) {
      void utils.part.getById.invalidate({ partNo });
      void utils.part.getImagesByPartNo.invalidate({ partNo });
    }
  };

  // ── Public: process an InventoryCreateResult ───────────────

  /**
   * Call after a successful inventory creation. Decides which
   * dialog (if any) to show and returns whether the caller
   * should keep its own dialog open.
   */
  const handleResult = (
    result: InventoryCreateResult,
    partNo: string,
    opts: {
      partName?: string;
      costPrice?: number;
      wantsSold?: boolean;
    },
  ): { keepOpen: boolean } => {
    const { partName = "", costPrice = 0, wantsSold = false } = opts;

    if (wantsSold) {
      setSoldPartPrompt({
        partIds: result.assignment.createdPartIds,
        description: `${partName} - ${partNo}`,
        partNo,
        costPrice,
      });
      return { keepOpen: false };
    }

    if (result.assignment.noCandidates) {
      setPendingListingCreate({
        partNo,
        partName,
        createdPartIds: result.assignment.createdPartIds,
      });
      toast.success("Inventory item created");
      return { keepOpen: false };
    }

    if (result.assignment.needsSelection) {
      setPendingListingAssignment({
        partNo,
        createdPartIds: result.assignment.createdPartIds,
        candidateListings: result.assignment.candidateListings,
      });
      setSelectedListingId(
        result.assignment.candidateListings[0]?.id ?? "",
      );
      toast.success(
        "Inventory item created. Select which listing should receive it.",
      );
      return { keepOpen: true };
    }

    // Auto-assigned or no listing needed
    if (result.assignment.autoAssignedListingId) {
      toast.success("Inventory item created and auto-assigned to listing");
    } else {
      toast.success("Inventory item created successfully");
    }
    return { keepOpen: false };
  };

  // ── Internal handlers ──────────────────────────────────────

  const clearAssignment = () => {
    setPendingListingAssignment(null);
    setSelectedListingId("");
  };

  const handleLeaveUnallocated = () => {
    const partNo = pendingListingAssignment?.partNo;
    toast.message("Inventory left unallocated");
    clearAssignment();
    invalidate(partNo);
    onComplete(partNo);
  };

  const handleConfirmAssignment = async () => {
    if (!pendingListingAssignment || !selectedListingId) {
      toast.error("Please select a listing");
      return;
    }
    try {
      await allocateMutation.mutateAsync({
        listingId: selectedListingId,
        assignPartIds: pendingListingAssignment.createdPartIds,
        unassignPartIds: [],
      });
      toast.success("Inventory assigned to listing");
      const partNo = pendingListingAssignment.partNo;
      clearAssignment();
      invalidate(partNo);
      onComplete(partNo);
    } catch (error) {
      console.error("Error assigning inventory to listing:", error);
    }
  };

  // ── Dialog elements ────────────────────────────────────────

  const dialogElements = (
    <>
      {/* Listing selection dialog */}
      <Dialog
        open={!!pendingListingAssignment}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleLeaveUnallocated();
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Choose Listing for New Inventory</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Multiple active listings use part{" "}
              <span className="font-medium text-foreground">
                {pendingListingAssignment?.partNo}
              </span>
              . Select which listing should receive this inventory now.
            </p>
            <VirtualizedCombobox
              options={(
                pendingListingAssignment?.candidateListings ?? []
              ).map((l) => ({ value: l.id, label: l.title }))}
              value={selectedListingId}
              onChange={setSelectedListingId}
              placeholder="Select a listing"
              searchPlaceholder="Search listings..."
              disabled={allocateMutation.isPending}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleLeaveUnallocated}
              disabled={allocateMutation.isPending}
            >
              Leave Unallocated
            </Button>
            <Button
              type="button"
              onClick={handleConfirmAssignment}
              disabled={allocateMutation.isPending || !selectedListingId}
            >
              {allocateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Assign Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No listing found prompt */}
      <Dialog
        open={!!pendingListingCreate && !showListingForm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingListingCreate(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>No Listing Found</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            No listing exists for{" "}
            <span className="font-medium text-foreground">
              {pendingListingCreate?.partNo}
            </span>
            . Would you like to create one now?
          </p>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingListingCreate(null)}
            >
              No
            </Button>
            <Button type="button" onClick={() => setShowListingForm(true)}>
              Create Listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline listing form */}
      {showListingForm && pendingListingCreate && (
        <ListingForm
          open={showListingForm}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setShowListingForm(false);
              invalidate(pendingListingCreate.partNo);
              setPendingListingCreate(null);
            }
          }}
          initialPart={{
            ids: pendingListingCreate.createdPartIds,
            name: pendingListingCreate.partName,
            partNo: pendingListingCreate.partNo,
          }}
        />
      )}

      {/* Sold-to-pending-order prompt */}
      <AlertDialog
        open={soldPartPrompt !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSoldPartPrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add to pending order?</AlertDialogTitle>
            <AlertDialogDescription>
              {soldPartPrompt?.partIds.length === 1
                ? "This part has been created. Would you like to add it to a pending order?"
                : `${soldPartPrompt?.partIds.length} parts created. Add them to a pending order?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Skip</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!soldPartPrompt) return;
                for (const partId of soldPartPrompt.partIds) {
                  pendingOrder.addItem({
                    partId,
                    partNo: soldPartPrompt.partNo,
                    description: soldPartPrompt.description,
                    price: soldPartPrompt.costPrice,
                  });
                }
                toast.success(
                  `Added ${soldPartPrompt.partIds.length} item(s) to pending order`,
                );
                setSoldPartPrompt(null);
              }}
            >
              Add to Order
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (!soldPartPrompt) return;
                for (const partId of soldPartPrompt.partIds) {
                  pendingOrder.addItem({
                    partId,
                    partNo: soldPartPrompt.partNo,
                    description: soldPartPrompt.description,
                    price: soldPartPrompt.costPrice,
                  });
                }
                pendingOrder.openFinalize();
                setSoldPartPrompt(null);
              }}
            >
              Create Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return {
    handleResult,
    dialogElements,
    isAllocating: allocateMutation.isPending,
  } as const;
}
