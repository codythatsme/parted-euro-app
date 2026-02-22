"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash } from "lucide-react";
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
    },
    {
      accessorKey: "series",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Series" />
      ),
    },
    {
      accessorKey: "generation",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Generation" />
      ),
    },
    {
      accessorKey: "model",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Model" />
      ),
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
