"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { X, ShoppingBag, Trash2, Plus, Minus, Loader2 } from "lucide-react";
import { formatCurrency } from "~/lib/utils";
import { api } from "~/trpc/react";
import { useCartUI } from "~/components/cart-provider";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import Link from "next/link";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useIsMobile } from "~/hooks/use-mobile";
import { Skeleton } from "~/components/ui/skeleton";

// Define a type for the combined cart item data
type PopulatedCartItem = {
  listingId: string;
  quantity: number;
  title?: string;
  price?: number | null;
  imageUrl?: string | null;
};

export function CartDrawer() {
  const { isOpen, close } = useCartUI();
  const isMobile = useIsMobile();

  const utils = api.useUtils();
  const { data: items = [], isLoading } = api.cart.getCart.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  const removeItemMutation = api.cart.removeItem.useMutation({
    onSuccess: () => utils.cart.getCart.invalidate(),
  });
  const updateItemMutation = api.cart.updateItem.useMutation({
    onSuccess: () => utils.cart.getCart.invalidate(),
  });
  const clearCartMutation = api.cart.clear.useMutation({
    onSuccess: () => utils.cart.getCart.invalidate(),
  });

  const populatedCart = items as PopulatedCartItem[];

  const subtotal = useMemo(() => {
    return populatedCart.reduce(
      (total, item) => total + (item.price ?? 0) * item.quantity,
      0,
    );
  }, [populatedCart]);

  const itemCount = populatedCart.reduce(
    (count, item) => count + item.quantity,
    0,
  );

  return (
    <Drawer
      open={isOpen}
      onOpenChange={close}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent
        className={isMobile ? "max-h-[85vh]" : "ml-auto h-full max-w-[400px]"}
      >
        <DrawerHeader className="px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <DrawerTitle className="flex items-center gap-2 text-xl font-semibold">
              <ShoppingBag className="h-5 w-5" />
              Your Cart {itemCount > 0 && `(${itemCount})`}
            </DrawerTitle>
            <DrawerClose className="rounded-full p-1 text-muted-foreground hover:bg-secondary">
              <X className="h-5 w-5" />
            </DrawerClose>
          </div>
          <DrawerDescription>
            {populatedCart.length === 0
              ? "Your cart is empty."
              : "Review your items before checkout."}
          </DrawerDescription>
        </DrawerHeader>

        {populatedCart.length > 0 ? (
          <>
            <ScrollArea className="px-4 sm:px-6">
              <div className="space-y-4 py-2">
                {isLoading && populatedCart.length > 0
                  ? // Show skeletons while loading data for existing cart items
                    populatedCart.map((item) => (
                      <CartItemSkeleton key={item.listingId} />
                    ))
                  : // Show populated items once data is loaded
                    populatedCart.map((item) => (
                      <CartItemDisplay
                        key={item.listingId}
                        item={item}
                        onRemove={() =>
                          removeItemMutation.mutateAsync({
                            listingId: item.listingId,
                          })
                        }
                        onUpdateQuantity={(quantity) =>
                          updateItemMutation.mutateAsync({
                            listingId: item.listingId,
                            quantity,
                          })
                        }
                      />
                    ))}
              </div>
            </ScrollArea>

            <DrawerFooter className="px-4 sm:px-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    {isLoading ? (
                      <Skeleton className="h-5 w-20" />
                    ) : (
                      <span className="font-medium">
                        {formatCurrency(subtotal)}
                      </span>
                    )}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between font-medium">
                    <span>Total</span>
                    {isLoading ? (
                      <Skeleton className="h-5 w-20" />
                    ) : (
                      <span>{formatCurrency(subtotal)}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Link
                    prefetch={true}
                    href="/checkout"
                    className="w-full"
                    onClick={close}
                    aria-disabled={isLoading}
                  >
                    <Button className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />{" "}
                          Loading...
                        </span>
                      ) : (
                        "Proceed to Checkout"
                      )}
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => clearCartMutation.mutate()}
                    disabled={isLoading || clearCartMutation.isPending}
                  >
                    {clearCartMutation.isPending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Clearing
                      </span>
                    ) : (
                      "Clear Cart"
                    )}
                  </Button>
                </div>
              </div>
            </DrawerFooter>
          </>
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 px-4 py-8 text-center sm:px-6">
            <ShoppingBag className="h-16 w-16 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Your cart is empty</h3>
              <p className="text-sm text-muted-foreground">
                Add items to your cart to see them here.
              </p>
            </div>
            <Link href="/listings" onClick={close}>
              <Button variant="default">Browse Products</Button>
            </Link>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

// Updated Helper component to render a cart item using PopulatedCartItem
function CartItemDisplay({
  item,
  onRemove,
  onUpdateQuantity,
}: {
  item: PopulatedCartItem;
  onRemove: () => Promise<unknown>;
  onUpdateQuantity: (quantity: number) => Promise<unknown>;
}) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isIncLoading, setIsIncLoading] = useState(false);
  const [isDecLoading, setIsDecLoading] = useState(false);
  const handleDec = async () => {
    setIsDecLoading(true);
    try {
      await onUpdateQuantity(Math.max(1, item.quantity - 1));
    } finally {
      setIsDecLoading(false);
    }
  };
  const handleInc = async () => {
    setIsIncLoading(true);
    try {
      await onUpdateQuantity(item.quantity + 1);
    } finally {
      setIsIncLoading(false);
    }
  };
  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove();
    } finally {
      setIsRemoving(false);
    }
  };
  return (
    <div className="flex items-start gap-4 rounded-lg border p-3">
      {/* Product image */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.title ?? "Listing image"}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-secondary-foreground">
            <ShoppingBag className="h-6 w-6" />
          </div>
        )}
      </div>

      {/* Product details */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-medium">{item.title ?? "Loading..."}</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.price != null ? formatCurrency(item.price) : "-"}
            </p>
          </div>
          <button
            onClick={handleRemove}
            className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            disabled={isRemoving || isIncLoading || isDecLoading}
          >
            {isRemoving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            <span className="sr-only">Remove</span>
          </button>
        </div>

        {/* Quantity selector */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center rounded-md border">
            <button
              onClick={handleDec}
              disabled={
                item.quantity <= 1 || isDecLoading || isIncLoading || isRemoving
              }
              className="flex h-8 w-8 items-center justify-center rounded-l-md border-r text-sm disabled:opacity-50"
            >
              {isDecLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span className="sr-only">Decrease quantity</span>
            </button>
            <span className="flex h-8 min-w-[2rem] items-center justify-center px-2 text-center text-sm">
              {item.quantity}
            </span>
            <button
              onClick={handleInc}
              disabled={isIncLoading || isDecLoading || isRemoving}
              className="flex h-8 w-8 items-center justify-center rounded-r-md border-l text-sm disabled:opacity-50"
            >
              {isIncLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              <span className="sr-only">Increase quantity</span>
            </button>
          </div>
          <p className="ml-auto text-sm font-medium">
            {item.price != null
              ? formatCurrency(item.price * item.quantity)
              : "-"}
          </p>
        </div>
      </div>
    </div>
  );
}

// Skeleton component for loading state
function CartItemSkeleton() {
  return (
    <div className="flex items-start gap-4 rounded-lg border p-3">
      <Skeleton className="h-16 w-16 shrink-0 rounded-md" />
      <div className="flex flex-1 flex-col space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/4" />
        <div className="mt-2 flex items-center justify-between">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    </div>
  );
}
