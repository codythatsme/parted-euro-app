"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "~/components/ui/button";
import { usePendingOrder } from "~/components/pending-order-provider";

export function PendingOrderIndicator() {
  const { count, openFinalize } = usePendingOrder();

  if (count === 0) return null;

  return (
    <Button variant="outline" size="sm" onClick={openFinalize} className="gap-2">
      <ShoppingCart className="h-4 w-4" />
      <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
        {count}
      </span>
    </Button>
  );
}
