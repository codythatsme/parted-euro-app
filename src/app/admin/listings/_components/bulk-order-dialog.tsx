"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { type AdminListingsItem } from "~/trpc/shared";
import { api } from "~/trpc/react";

export type OrderItem = {
  listingId: string;
  quantity: number;
  price: number;
};

// Input value state type to handle raw string inputs
type OrderItemInput = {
  listingId: string;
  quantityValue: string;
  priceValue: string;
};

interface BulkOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedListings: AdminListingsItem[];
  onOrderCreate: (orderItems: OrderItem[]) => void;
}

export function BulkOrderDialog({
  open,
  onOpenChange,
  selectedListings,
  onOrderCreate,
}: BulkOrderDialogProps) {
  // Track raw input values
  const [inputValues, setInputValues] = useState<OrderItemInput[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const utils = api.useUtils();
  const bulkReduceMutation = api.listings.markPartsSold.useMutation({
    onSuccess: async () => {
      await utils.listings.getAllAdmin.invalidate();
    },
  });

  // Initialize input values when dialog opens or selected listings change
  useEffect(() => {
    if (open && selectedListings.length > 0) {
      setInputValues(
        selectedListings.map((listing) => ({
          listingId: listing.id,
          priceValue: listing.price.toString(),
          quantityValue: "1",
        })),
      );
    }
  }, [open, selectedListings]);

  const handleQuantityChange = (listingId: string, value: string) => {
    setInputValues((prev) =>
      prev.map((item) =>
        item.listingId === listingId ? { ...item, quantityValue: value } : item,
      ),
    );
  };

  const handlePriceChange = (listingId: string, value: string) => {
    setInputValues((prev) =>
      prev.map((item) =>
        item.listingId === listingId ? { ...item, priceValue: value } : item,
      ),
    );
  };

  const handleCreateOrder = () => {
    setIsSubmitting(true);
    try {
      // Convert string values to numbers at submission time
      // Multiply price by 100 to convert from dollars to cents
      const orderItems: OrderItem[] = inputValues.map((input) => ({
        listingId: input.listingId,
        quantity: parseInt(input.quantityValue) || 1,
        price: parseFloat(input.priceValue) || 0,
      }));

      onOrderCreate(orderItems);
      toast.success("Order created successfully");
      onOpenChange(false);
    } catch {
      toast.error("Failed to create order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateEbayOrder = async () => {
    try {
      const items = inputValues.map((input) => ({
        listingId: input.listingId,
        quantity: parseInt(input.quantityValue) || 1,
      }));
      if (items.length === 0) return;
      await bulkReduceMutation.mutateAsync({ items });
      toast.success("eBay order created. Inventory marked sold.");
      onOpenChange(false);
    } catch {
      toast.error("Failed to create eBay order");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>Create Order</DialogTitle>
          <DialogDescription>
            Create a new order for {selectedListings.length} selected{" "}
            {selectedListings.length === 1 ? "listing" : "listings"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto py-4">
          {selectedListings.map((listing, index) => {
            const inputValue = inputValues.find(
              (item) => item.listingId === listing.id,
            );

            return (
              <div
                key={listing.id}
                className={`mb-4 rounded-md border p-4 ${
                  index !== selectedListings.length - 1 ? "mb-4" : ""
                }`}
              >
                <h4 className="mb-2 font-medium">{listing.title}</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`price-${listing.id}`}>Price</Label>
                    <Input
                      id={`price-${listing.id}`}
                      type="text"
                      inputMode="decimal"
                      value={inputValue?.priceValue ?? ""}
                      onChange={(e) =>
                        handlePriceChange(listing.id, e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`quantity-${listing.id}`}>Quantity</Label>
                    <Input
                      id={`quantity-${listing.id}`}
                      type="text"
                      inputMode="numeric"
                      value={inputValue?.quantityValue ?? ""}
                      onChange={(e) =>
                        handleQuantityChange(listing.id, e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCreateEbayOrder}
            disabled={bulkReduceMutation.isPending}
          >
            {bulkReduceMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create eBay Order
          </Button>
          <Button
            type="button"
            onClick={handleCreateOrder}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
