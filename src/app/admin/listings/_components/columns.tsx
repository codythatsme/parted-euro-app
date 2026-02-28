"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Calendar, DollarSign, ExternalLink, MoreHorizontal, Package, Pencil, RotateCcw, Store, Trash } from "lucide-react";
import { Link } from "~/components/link";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Badge } from "~/components/ui/badge";
import { type AdminListingsItem } from "~/trpc/shared";

const formatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

type ListingColumnsProps = {
  onEdit: (listing: AdminListingsItem) => void;
  onDelete: (listing: AdminListingsItem) => void;
  onUnretire: (listing: AdminListingsItem) => void;
  onListOnEbay: (listing: AdminListingsItem) => void;
};

export function getListingColumns({
  onEdit,
  onDelete,
  onUnretire,
  onListOnEbay,
}: ListingColumnsProps): ColumnDef<AdminListingsItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => <Link href={`/listings/${row.original.id}`}>{row.original.title}</Link>,
    },
    {
      id: "components",
      header: "Components",
      accessorFn: (row) =>
        row.components
          .map((component) => `${component.partDetail.partNo} x${component.quantity}`)
          .join(", "),
      cell: ({ row }) => {
        const items = row.original.components;
        if (items.length === 0) {
          return <span className="text-xs text-muted-foreground">No components</span>;
        }
        return (
          <div className="flex flex-col gap-1">
            {items.slice(0, 3).map((component) => (
              <span key={component.id} className="text-xs">
                {component.partDetail.partNo} x{component.quantity}
              </span>
            ))}
            {items.length > 3 && (
              <span className="text-xs text-muted-foreground">
                ...and {items.length - 3} more
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "price",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Price" />
      ),
      meta: {
        displayName: "Price",
        icon: DollarSign,
        type: "number",
      },
      cell: ({ row }) => (
        <span className="font-mono text-xs">{formatter.format(row.original.price)}</span>
      ),
    },
    {
      accessorKey: "stock",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Stock" />
      ),
      meta: {
        displayName: "Stock",
        icon: Package,
        type: "number",
      },
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.stock ?? 0}</span>,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Listed On" />
      ),
      meta: {
        displayName: "Listed On",
        icon: Calendar,
        type: "date",
      },
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      accessorKey: "listedOnEbay",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="eBay" />
      ),
      meta: {
        displayName: "eBay Status",
        icon: Store,
        type: "option",
        transformOptionFn: (val) => ({
          label: val ? "Listed" : "Not listed",
          value: val ? "true" : "false",
        }),
      },
      cell: ({ row }) => (
        <Badge variant={row.original.listedOnEbay ? "default" : "outline"}>
          {row.original.listedOnEbay ? "Listed" : "Not listed"}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const listing = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(listing)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onListOnEbay(listing)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                List on eBay
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {listing.active ? (
                <DropdownMenuItem
                  onClick={() => onDelete(listing)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Retire
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onUnretire(listing)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Unretire
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
