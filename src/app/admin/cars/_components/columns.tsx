"use client";

import { type ColumnDef } from "@tanstack/react-table";
import {
  Car,
  Cpu,
  Gauge,
  Layers,
  MoreHorizontal,
  Pencil,
  Shapes,
  Trash,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { type AdminCarItem } from "~/trpc/shared";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";

interface CarColumnsProps {
  onEdit: (car: AdminCarItem) => void;
  onDelete: (car: AdminCarItem) => void;
}

export function getCarColumns({
  onEdit,
  onDelete,
}: CarColumnsProps): ColumnDef<AdminCarItem>[] {
  return [
    {
      accessorKey: "make",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Make" />
      ),
      meta: {
        displayName: "Make",
        icon: Car,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s, value: s };
        },
      },
    },
    {
      accessorKey: "series",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Series" />
      ),
      meta: {
        displayName: "Series",
        icon: Layers,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s, value: s };
        },
      },
    },
    {
      accessorKey: "generation",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Generation" />
      ),
      meta: {
        displayName: "Generation",
        icon: Shapes,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s, value: s };
        },
      },
    },
    {
      accessorKey: "chassisCode",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Chassis" />
      ),
      meta: {
        displayName: "Chassis",
        icon: Cpu,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s || "None", value: s };
        },
      },
    },
    {
      accessorKey: "model",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Model" />
      ),
    },
    {
      accessorKey: "body",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Body" />
      ),
    },
    {
      accessorKey: "engine",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Engine" />
      ),
      meta: {
        displayName: "Engine",
        icon: Gauge,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s || "None", value: s };
        },
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const car = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(car)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(car)}
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
