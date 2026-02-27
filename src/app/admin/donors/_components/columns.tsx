import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "~/components/ui/button";
import { type Car, type Donor, type Image } from "@prisma/client";
import { formatDate, formatCurrency } from "~/lib/utils";
import { Calendar, Car as CarIcon, Hash, Layers, MoreHorizontal, Pencil, Shapes, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";

// Extend Donor type to include the Car relationship
export type DonorWithCar = Donor & {
  car: Car;
  images?: Image[];
};

interface DonorActionsProps {
  onEdit: (donor: DonorWithCar) => void;
  onDelete: (donor: DonorWithCar) => void;
}

// Define the columns for the donors data table
export function getDonorColumns({
  onEdit,
  onDelete,
}: DonorActionsProps): ColumnDef<DonorWithCar>[] {
  return [
    {
      accessorKey: "vin",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="VIN" />
      ),
      cell: ({ row }) => <div className="font-medium">{row.original.vin}</div>,
    },
    {
      id: "make",
      accessorFn: (row) => row.car.make,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Make" />
      ),
      meta: {
        displayName: "Make",
        icon: CarIcon,
        type: "option",
        transformOptionFn: (val) => {
          const s = typeof val === "string" ? val : "";
          return { label: s, value: s };
        },
      },
      cell: ({ row }) => {
        const car = row.original.car;
        return <div>{car.make}</div>;
      },
    },
    {
      id: "series",
      accessorFn: (row) => row.car.series,
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
      cell: ({ row }) => {
        const car = row.original.car;
        return <div>{car.series}</div>;
      },
    },
    {
      id: "generation",
      accessorFn: (row) => row.car.generation,
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
      cell: ({ row }) => {
        const car = row.original.car;
        return <div>{car.generation}</div>;
      },
    },
    {
      id: "model",
      accessorFn: (row) => row.car.model,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Model" />
      ),
      cell: ({ row }) => {
        const car = row.original.car;
        return <div>{car.model}</div>;
      },
    },
    {
      accessorKey: "year",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Year" />
      ),
      meta: {
        displayName: "Year",
        icon: Hash,
        type: "number",
      },
      cell: ({ row }) => <div>{row.original.year}</div>,
    },
    {
      accessorKey: "mileage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Mileage" />
      ),
      cell: ({ row }) => <div>{row.original.mileage.toLocaleString()}</div>,
    },
    {
      accessorKey: "cost",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Cost" />
      ),
      cell: ({ row }) => <div>{formatCurrency(row.original.cost)}</div>,
    },
    {
      accessorKey: "dateInStock",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date In Stock" />
      ),
      meta: {
        displayName: "Date In Stock",
        icon: Calendar,
        type: "date",
      },
      cell: ({ row }) => {
        const date = row.original.dateInStock;
        return date ? <div>{formatDate(date)}</div> : <div>-</div>;
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const donor = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(donor)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(donor)}>
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
