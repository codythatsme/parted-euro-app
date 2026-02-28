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
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

interface CategoryColumnsProps {
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

export function getCategoryColumns({
  onEdit,
  onDelete,
}: CategoryColumnsProps): ColumnDef<Category>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
    },
    {
      accessorKey: "parentName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Parent Category" />
      ),
      cell: ({ row }) => {
        const parentName = row.getValue<string | null>("parentName");
        return <div>{parentName ?? "None"}</div>;
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created At" />
      ),
      cell: ({ row }) => {
        const createdAt = row.getValue<Date>("createdAt");
        return <div>{createdAt.toLocaleDateString()}</div>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const category = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(category)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(category)}>
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
