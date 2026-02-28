"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ChevronRight, Hash, MapPin, MoreHorizontal, Tag, Type } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";
import { type AdminInventoryItem, type RouterOutputs } from "~/trpc/shared";

type PartDefinition = RouterOutputs["part"]["getAll"]["items"][number];

export type UnifiedPartRow = PartDefinition & {
  inventoryItems: AdminInventoryItem[];
  inventoryCounts: {
    total: number;
    available: number;
    reserved: number;
    sold: number;
    returned: number;
  };
  inventorySearchText: string;
  lastInventoryAdded: Date | null;
};

type UnifiedColumnsProps = {
  onEditPart: (part: UnifiedPartRow) => void;
  onDeletePart: (part: UnifiedPartRow) => void;
};

export const getUnifiedPartColumns = ({
  onEditPart,
  onDeletePart,
}: UnifiedColumnsProps): ColumnDef<UnifiedPartRow>[] => [
  {
    id: "expander",
    header: "",
    size: 40,
    cell: ({ row }) => (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={row.getToggleExpandedHandler()}
        aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform ${row.getIsExpanded() ? "rotate-90" : ""}`}
        />
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "partNo",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Part Number" />
    ),
    meta: {
      displayName: "Part Number",
      icon: Hash,
      type: "text",
    },
  },
  {
    accessorKey: "name",
    size: 300,
    minSize: 200,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    meta: {
      displayName: "Name",
      icon: Type,
      type: "text",
    },
  },
  {
    id: "inventoryCounts",
    header: "Inventory",
    accessorFn: (row) => row.inventoryCounts.total,
    cell: ({ row }) => {
      const counts = row.original.inventoryCounts;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{counts.total} total</Badge>
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            {counts.available} available
          </Badge>
          {counts.reserved > 0 && (
            <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
              {counts.reserved} reserved
            </Badge>
          )}
          {counts.sold > 0 && (
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              {counts.sold} sold
            </Badge>
          )}
          {counts.returned > 0 && (
            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
              {counts.returned} returned
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "lastInventoryAdded",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Added" />
    ),
    cell: ({ row }) => {
      const value = row.original.lastInventoryAdded;
      if (!value) return "-";
      return new Date(value).toLocaleDateString();
    },
    sortingFn: (rowA, rowB, columnId) => {
      const a = rowA.original.lastInventoryAdded;
      const b = rowB.original.lastInventoryAdded;
      if (!a && !b) return 0;
      // Always sort nulls last regardless of sort direction
      const isDesc = rowA
        .getAllCells()
        .find((c) => c.column.id === columnId)
        ?.column.getIsSorted() === "desc";
      if (!a) return isDesc ? -1 : 1;
      if (!b) return isDesc ? 1 : -1;
      return a.getTime() - b.getTime();
    },
  },
  {
    accessorKey: "alternatePartNumbers",
    header: "Alt. Part Numbers",
    accessorFn: (row) => row.alternatePartNumbers ?? "",
    cell: ({ getValue }) => {
      const value = getValue<string>();
      return value || "-";
    },
  },
  {
    accessorKey: "dimensions",
    size: 120,
    header: "Dimensions (LxWxH)",
    cell: ({ row }) => {
      const part = row.original;
      return `${part.length}x${part.width}x${part.height}`;
    },
  },
  {
    accessorKey: "weight",
    size: 80,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Weight" />
    ),
    cell: ({ row }) => `${row.original.weight} kg`,
  },
  {
    accessorKey: "costPrice",
    size: 80,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Cost" />
    ),
    cell: ({ row }) => {
      const value = row.original.costPrice;
      return value ? `$${value.toFixed(2)}` : "-";
    },
  },
  {
    id: "inventorySearchText",
    accessorFn: (row) => row.inventorySearchText,
    header: "",
    cell: () => null,
    enableSorting: false,
  },
  {
    id: "location",
    accessorFn: (row) => {
      const names = row.inventoryItems
        .map((i) => i.inventoryLocation?.name ?? "Not assigned");
      return [...new Set(names)];
    },
    header: "",
    cell: () => null,
    enableSorting: false,
    meta: {
      displayName: "Location",
      icon: MapPin,
      type: "multiOption",
      transformOptionFn: (value: string) => ({ label: value, value }),
    },
  },
  {
    id: "allocationStatus",
    accessorFn: (row) => {
      if (row.inventoryCounts.total === 0) return "NO_INVENTORY";
      const availableItems = row.inventoryItems.filter(
        (i) => i.status === "AVAILABLE",
      );
      if (availableItems.length === 0) return "ALL_ALLOCATED";
      return availableItems.some((i) => !i.allocatedToListingId)
        ? "HAS_UNALLOCATED"
        : "ALL_ALLOCATED";
    },
    header: "",
    cell: () => null,
    enableSorting: false,
    meta: {
      displayName: "Listed/Unlisted",
      icon: Tag,
      type: "option",
      options: [
        { label: "No inventory", value: "NO_INVENTORY" },
        { label: "Unlisted", value: "HAS_UNALLOCATED" },
        { label: "All listed", value: "ALL_ALLOCATED" },
      ],
    },
  },
  {
    id: "actions",
    size: 40,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEditPart(row.original)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDeletePart(row.original)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];
