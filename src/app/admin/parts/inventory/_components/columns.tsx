"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Calendar, CircleDot, Copy, MapPin, MoreHorizontal, Pencil, Tag, Trash } from "lucide-react";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { type AdminInventoryItem } from "~/trpc/shared";

type InventoryColumnsProps = {
  onEdit: (inventory: AdminInventoryItem) => void;
  onDelete: (inventory: AdminInventoryItem) => void;
  onDuplicate: (inventory: AdminInventoryItem) => void;
  onCreateListing?: (inventory: AdminInventoryItem) => void;
};

const statusClass = (status: string) => {
  if (status === "AVAILABLE") return "bg-green-100 text-green-700";
  if (status === "RESERVED") return "bg-yellow-100 text-yellow-700";
  if (status === "SOLD") return "bg-blue-100 text-blue-700";
  if (status === "RETURNED") return "bg-orange-100 text-orange-700";
  return "bg-muted text-foreground";
};

export function getInventoryColumns({
  onEdit,
  onDelete,
  onDuplicate,
  onCreateListing,
}: InventoryColumnsProps): ColumnDef<AdminInventoryItem>[] {
  return [
    {
      accessorKey: "partDetails.name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Part Name" />
      ),
    },
    {
      accessorKey: "partDetails.partNo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Part Number" />
      ),
    },
    {
      accessorKey: "variant",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Variant" />
      ),
      cell: ({ row }) => row.original.variant ?? "",
    },
    {
      accessorKey: "inventoryLocation.name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Location" />
      ),
      meta: {
        displayName: "Location",
        icon: MapPin,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s, value: s };
        },
      },
      cell: ({ row }) => row.original.inventoryLocation?.name ?? "Not assigned",
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      meta: {
        displayName: "Status",
        icon: CircleDot,
        type: "option",
        options: [
          { label: "Available", value: "AVAILABLE" },
          { label: "Reserved", value: "RESERVED" },
          { label: "Sold", value: "SOLD" },
          { label: "Returned", value: "RETURNED" },
        ],
      },
      cell: ({ row }) => (
        <span
          className={`rounded px-2 py-1 text-xs font-medium ${statusClass(row.original.status)}`}
        >
          {row.original.status}
        </span>
      ),
    },
    {
      id: "allocatedTo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Allocated To" />
      ),
      accessorFn: (row) => row.allocatedToListing?.title ?? "Unallocated",
      cell: ({ row }) => row.original.allocatedToListing?.title ?? "Unallocated",
    },
    {
      accessorKey: "donorVin",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Donor VIN" />
      ),
      cell: ({ row }) => row.original.donorVin ?? "",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date Added" />
      ),
      meta: {
        displayName: "Date Added",
        icon: Calendar,
        type: "date",
      },
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const inventory = row.original;
        const canCreateListing =
          inventory.status === "AVAILABLE" && !inventory.allocatedToListingId;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(inventory)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(inventory)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              {canCreateListing && onCreateListing && (
                <DropdownMenuItem onClick={() => onCreateListing(inventory)}>
                  <Tag className="mr-2 h-4 w-4" />
                  Create listing
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(inventory)}
                className="text-destructive focus:text-destructive"
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
