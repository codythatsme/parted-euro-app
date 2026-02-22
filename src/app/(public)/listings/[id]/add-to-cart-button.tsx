"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { Loader2 } from "lucide-react";
import { ShoppingCart, Plus, Minus, Check } from "lucide-react";
import { toast } from "sonner";

type ListingType = {
  id: string;
  title: string;
  price: number | null;
  images: { url: string }[];
  stock: number;
};

interface AddToCartButtonProps {
  listing: ListingType;
  inStock: boolean;
}

export function AddToCartButton({ listing, inStock }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const utils = api.useUtils();
  const addItemMutation = api.cart.addItem.useMutation({
    onSuccess: async () => {
      await utils.cart.getCart.invalidate();
      await utils.cart.getCartSummary.invalidate();
    },
  });

  const maxQuantity = listing.stock ?? 0;

  const handleAddToCart = async () => {
    if (!inStock) return;

    await addItemMutation.mutateAsync({ listingId: listing.id, quantity });
    setIsAdded(true);
    toast.success(`${listing.title} added to cart`);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const incrementQuantity = () => {
    if (quantity < maxQuantity) {
      setQuantity(quantity + 1);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  return (
    <div className="space-y-4">
      {inStock ? (
        <>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border">
              <button
                onClick={decrementQuantity}
                disabled={quantity <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-l-md border-r text-sm disabled:opacity-50"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="flex h-10 w-12 items-center justify-center px-2 text-center text-sm">
                {quantity}
              </span>
              <button
                onClick={incrementQuantity}
                disabled={quantity >= maxQuantity}
                className="flex h-10 w-10 items-center justify-center rounded-r-md border-l text-sm disabled:opacity-50"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {maxQuantity} available
            </p>
          </div>

          <Button
            onClick={handleAddToCart}
            className="w-full"
            size="lg"
            disabled={isAdded || addItemMutation.isPending}
          >
            {isAdded ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Added to Cart
              </>
            ) : addItemMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
              </>
            )}
          </Button>
        </>
      ) : (
        <Button disabled size="lg" className="w-full">
          Out of Stock
        </Button>
      )}
    </div>
  );
}
