"use client";

import { Copy, MoreHorizontal, Pencil, Plus, Tag, Trash } from "lucide-react";
import { type AdminInventoryItem } from "~/trpc/shared";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { type UnifiedPartRow } from "./columns";

const statusClass = (status: string) => {
  if (status === "AVAILABLE") return "bg-green-100 text-green-700";
  if (status === "RESERVED") return "bg-yellow-100 text-yellow-700";
  if (status === "SOLD") return "bg-blue-100 text-blue-700";
  if (status === "RETURNED") return "bg-orange-100 text-orange-700";
  return "bg-muted text-foreground";
};

type InventoryExpandedPanelProps = {
  part: UnifiedPartRow;
  onAddInventory: (part: UnifiedPartRow) => void;
  onEditInventory: (item: AdminInventoryItem) => void;
  onDeleteInventory: (item: AdminInventoryItem) => void;
  onDuplicateInventory: (item: AdminInventoryItem) => void;
  onCreateListing: (item: AdminInventoryItem) => void;
};

export function InventoryExpandedPanel({
  part,
  onAddInventory,
  onEditInventory,
  onDeleteInventory,
  onDuplicateInventory,
  onCreateListing,
}: InventoryExpandedPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Inventory for <span className="font-medium text-foreground">{part.name}</span>{" "}
          ({part.partNo})
        </p>
        <Button size="sm" onMouseDown={() => onAddInventory(part)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Inventory
        </Button>
      </div>

      {part.inventoryItems.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No inventory items for this part yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Allocated To</TableHead>
                <TableHead>Donor VIN</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {part.inventoryItems.map((item) => {
                const canCreateListing =
                  item.status === "AVAILABLE" && !item.allocatedToListingId;

                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.variant ?? "-"}</TableCell>
                    <TableCell>{item.inventoryLocation?.name ?? "Not assigned"}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>{item.allocatedToListing?.title ?? "Unallocated"}</TableCell>
                    <TableCell>{item.donorVin ?? "-"}</TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditInventory(item)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDuplicateInventory(item)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          {canCreateListing && (
                            <DropdownMenuItem onClick={() => onCreateListing(item)}>
                              <Tag className="mr-2 h-4 w-4" />
                              Create listing
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDeleteInventory(item)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
