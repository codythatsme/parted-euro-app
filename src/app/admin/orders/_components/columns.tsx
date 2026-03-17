"use client";

import { type ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  Check,
  CircleDot,
  DollarSign,
  Eye,
  FileText,
  MoreHorizontal,
  MoreVertical,
  Package,
  Pencil,
  RefreshCw,
  Truck,
  X,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "~/components/ui/dropdown-menu";
import { Badge } from "~/components/ui/badge";
import { type AdminOrdersItem } from "~/trpc/shared";
import { downloadPickSheet } from "./pick-sheet-pdf";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";

// Format currency
const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
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
      return "default";
    case "ready for pickup":
      return "default";
    case "completed":
      return "default";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
};

interface OrderColumnsProps {
  onViewDetails: (order: AdminOrdersItem) => void;
  onAddTracking: (order: AdminOrdersItem) => void;
  onReadyForPickup: (order: AdminOrdersItem) => void;
  onUpdateStatus: (order: AdminOrdersItem) => void;
  onCompleteOrder: (order: AdminOrdersItem) => void;
  onCancelOrder: (order: AdminOrdersItem) => void;
  onRefreshAddressFromStripe: (order: AdminOrdersItem) => void;
}

/**
 * Returns the columns for the orders data table
 */
export function getOrderColumns({
  onViewDetails,
  onAddTracking,
  onReadyForPickup,
  onUpdateStatus,
  onCompleteOrder,
  onCancelOrder,
  onRefreshAddressFromStripe,
}: OrderColumnsProps): ColumnDef<AdminOrdersItem>[] {
  return [
    {
      accessorKey: "xeroInvoiceRef",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order ID" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.xeroInvoiceId}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created At" />
      ),
      meta: {
        displayName: "Created At",
        icon: Calendar,
        type: "date",
      },
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt);
        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      },
    },
    {
      accessorKey: "name",
      header: "Customer",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.email}
          </span>
          {row.original.phoneNumber && (
            <span className="text-xs text-muted-foreground">
              {row.original.phoneNumber}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        displayName: "Status",
        icon: CircleDot,
        type: "option",
        options: [
          { label: "Pending", value: "Pending" },
          { label: "Paid", value: "Paid" },
          { label: "Processing", value: "Processing" },
          { label: "Shipped", value: "Shipped" },
          { label: "Ready for pickup", value: "Ready for pickup" },
          { label: "COMPLETED", value: "COMPLETED" },
          { label: "Cancelled", value: "Cancelled" },
        ],
      },
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge variant={getStatusBadge(status)}>{status || "Unknown"}</Badge>
        );
      },
    },
    {
      accessorKey: "shippingMethod",
      header: "Shipping",
      meta: {
        displayName: "Shipping",
        icon: Truck,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s, value: s };
        },
      },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.shippingMethod ?? ""}</span>
          {row.original.shipping > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatPrice(row.original.shipping)}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "shippingAddress",
      header: "Address",
      cell: ({ row }) => {
        if (row.original.shippingMethod?.toLowerCase()?.includes("pickup")) {
          return <div>Pickup</div>;
        }

        const order = row.original;

        // Check if we have separate address fields (new format)
        const hasNewAddressFields =
          order.shippingLine1 ??
          order.shippingLine2 ??
          order.shippingCity ??
          order.shippingPostcode ??
          order.shippingCountry ??
          order.shippingState;

        if (hasNewAddressFields) {
          return (
            <div className="max-w-[280px] space-y-1 text-xs leading-relaxed">
              {order.shippingLine1 && (
                <div>
                  <span className="font-medium">Line 1:</span>{" "}
                  {order.shippingLine1}
                </div>
              )}
              {order.shippingLine2 && (
                <div>
                  <span className="font-medium">Line 2:</span>{" "}
                  {order.shippingLine2}
                </div>
              )}
              {order.shippingCity && (
                <div>
                  <span className="font-medium">City:</span>{" "}
                  {order.shippingCity}
                </div>
              )}
              {order.shippingPostcode && (
                <div>
                  <span className="font-medium">Postcode:</span>{" "}
                  {order.shippingPostcode}
                </div>
              )}
              {order.shippingState && (
                <div>
                  <span className="font-medium">State:</span>{" "}
                  {order.shippingState}
                </div>
              )}
              {order.shippingCountry && (
                <div>
                  <span className="font-medium">Country:</span>{" "}
                  {order.shippingCountry}
                </div>
              )}
            </div>
          );
        }

        // Fallback to old concatenated string format for backward compatibility
        const address = order.shippingAddress;
        if (!address || address === "Not specified") {
          return (
            <div className="text-sm text-muted-foreground">Not specified</div>
          );
        }

        // Parse the address string (format: "line1, line2, city, postal_code, country")
        const addressParts = address
          .split(", ")
          .filter((part) => part.trim() && part.trim() !== " ");

        if (addressParts.length === 0) {
          return (
            <div className="text-sm text-muted-foreground">Not specified</div>
          );
        }

        return (
          <div className="max-w-[280px] text-xs leading-relaxed">
            {addressParts.map((part, index) => (
              <div key={index}>{part.trim()}</div>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "trackingNumber",
      header: "Tracking",
      cell: ({ row }) => {
        const tracking = row.original.trackingNumber;
        const carrier = row.original.carrier;

        if (!tracking) {
          return <span className="text-xs text-muted-foreground">None</span>;
        }

        return (
          <div className="flex flex-col">
            <span className="font-mono text-xs">{tracking}</span>
            {carrier && (
              <span className="text-xs text-muted-foreground">{carrier}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "subtotal",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total" />
      ),
      meta: {
        displayName: "Total",
        icon: DollarSign,
        type: "number",
      },
      cell: ({ row }) => {
        const subtotal = row.original.subtotal;
        const shipping = row.original.shipping;
        const total = subtotal + shipping;
        return formatPrice(total);
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const order = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewDetails(order)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => void downloadPickSheet(order)}>
                <FileText className="mr-2 h-4 w-4" />
                Print Pick Sheet
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => onAddTracking(order)}>
                <Truck className="mr-2 h-4 w-4" />
                Add Tracking
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onRefreshAddressFromStripe(order)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Address from Stripe
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => onReadyForPickup(order)}>
                <Package className="mr-2 h-4 w-4" />
                Ready for Pickup
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <MoreVertical className="mr-2 h-4 w-4" />
                  Update Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onUpdateStatus(order)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Select Status
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onCompleteOrder(order)}>
                    <Check className="mr-2 h-4 w-4" />
                    Completed
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCancelOrder(order)}>
                    <X className="mr-2 h-4 w-4" />
                    Cancelled
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
