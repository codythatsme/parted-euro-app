"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { type AdminOrdersItem } from "~/trpc/shared";
import { PickSheetButton } from "./pick-sheet-pdf";

// Format currency
const formatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

const formatPrice = (price: number) => formatter.format(price);

// Get badge variant based on order status
const getStatusBadge = (status: string) => {
  switch (status?.toLowerCase()) {
    case "pending":
      return "secondary";
    case "paid":
      return "default";
    case "processing":
      return "default";
    case "shipped":
      return "secondary";
    case "ready for pickup":
      return "secondary";
    case "completed":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
};

type OrderDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: AdminOrdersItem;
};

export function OrderDetailsDialog({
  open,
  onOpenChange,
  order,
}: OrderDetailsDialogProps) {
  const date = new Date(order.createdAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  const subtotal = order.subtotal;
  const shipping = (order.shipping ?? 0) * 100;
  const total = subtotal + shipping;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div>
              Order Details{" "}
              <span className="ml-2 font-mono text-sm font-normal">
                {order.id}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <PickSheetButton order={order} />
              <Badge variant={getStatusBadge(order.status)}>{order.status}</Badge>
            </div>
          </DialogTitle>
          <DialogDescription>Order placed on {formattedDate}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Customer Information</h3>
            <div className="rounded-md border p-3">
              <p className="font-medium">{order.name}</p>
              <p className="text-sm">{order.email}</p>
              {order.phoneNumber && (
                <p className="text-sm">{order.phoneNumber}</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Shipping Information</h3>
            <div className="rounded-md border p-3">
              <p className="text-sm">
                <span className="font-medium">Method:</span>{" "}
                {order.shippingMethod ?? "Not specified"}
              </p>
              {order.shippingAddress && (
                <p className="text-sm">
                  <span className="font-medium">Address:</span>{" "}
                  {order.shippingAddress}
                </p>
              )}
              {order.trackingNumber && (
                <p className="text-sm">
                  <span className="font-medium">Tracking:</span>{" "}
                  {order.trackingNumber}
                  {order.carrier && ` (${order.carrier})`}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 font-semibold">Order Items</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.orderItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        {item.listing.images?.[0] && (
                          <img
                            src={item.listing.images[0].url}
                            alt={item.listing.title}
                            className="h-12 w-12 rounded-md object-cover"
                          />
                        )}
                        <div>
                          {item.listing.title}
                          <div className="max-w-[300px] truncate text-xs text-muted-foreground">
                            Part #:{" "}
                            {item.allocatedParts
                              .map((allocated) => allocated.part.partDetails.partNo)
                              .join(", ")}
                          </div>
                          <div className="max-w-[300px] truncate text-xs text-muted-foreground">
                            Donor VIN:{" "}
                            {item.allocatedParts
                              .map((allocated) => allocated.part.donor?.vin ?? "N/A")
                              .join(", ")}
                          </div>
                          <div className="max-w-[300px] truncate text-xs text-muted-foreground">
                            Location:{" "}
                            {item.allocatedParts
                              .map(
                                (allocated) =>
                                  allocated.part.inventoryLocation?.name ?? "N/A",
                              )
                              .join(", ")}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(item.unitPrice ?? item.listing.price)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice((item.unitPrice ?? item.listing.price) * item.quantity)}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Subtotal row */}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-medium">
                    Subtotal
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPrice(subtotal)}
                  </TableCell>
                </TableRow>

                {/* Shipping row */}
                {shipping > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">
                      Shipping
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(shipping)}
                    </TableCell>
                  </TableRow>
                )}

                {/* Total row */}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {formatPrice(total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
