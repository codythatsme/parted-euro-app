"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, MoreHorizontal, Pencil, Plus, Tag, Trash } from "lucide-react";
import { type AdminInventoryItem } from "~/trpc/shared";
import { Badge } from "~/components/ui/badge";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusClass = (status: string) => {
  if (status === "AVAILABLE") return "bg-green-100 text-green-700";
  if (status === "RESERVED") return "bg-yellow-100 text-yellow-700";
  if (status === "SOLD") return "bg-blue-100 text-blue-700";
  if (status === "RETURNED") return "bg-orange-100 text-orange-700";
  return "bg-muted text-foreground";
};

type VinGroup = {
  vinKey: string | null;
  displayVin: string;
  items: AdminInventoryItem[];
  qty: number;
};

/** Build VIN groups sorted alphabetically, null-VIN last. */
function buildVinGroups(items: AdminInventoryItem[]): VinGroup[] {
  const map = new Map<string | null, AdminInventoryItem[]>();
  for (const item of items) {
    const key = item.donorVin;
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  const groups: VinGroup[] = [];
  for (const [vinKey, groupItems] of map) {
    groups.push({
      vinKey,
      displayVin: vinKey ?? "No Donor VIN",
      items: groupItems,
      qty: groupItems.length,
    });
  }

  groups.sort((a, b) => {
    if (a.vinKey === null) return 1;
    if (b.vinKey === null) return -1;
    return a.vinKey.localeCompare(b.vinKey);
  });

  return groups;
}

// ---------------------------------------------------------------------------
// Small reusable components (file-local)
// ---------------------------------------------------------------------------

type ItemActionMenuProps = {
  item: AdminInventoryItem;
  onEdit: (item: AdminInventoryItem) => void;
  onDuplicate: (item: AdminInventoryItem) => void;
  onCreateListing: (item: AdminInventoryItem) => void;
  onDelete: (item: AdminInventoryItem) => void;
};

function ItemActionMenu({ item, onEdit, onDuplicate, onCreateListing, onDelete }: ItemActionMenuProps) {
  const canCreateListing = item.status === "AVAILABLE" && !item.allocatedToListingId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(item)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(item)}>
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
          onClick={() => onDelete(item)}
          className="text-destructive focus:text-destructive"
        >
          <Trash className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Renders count-per-status badges for a group of items. */
function StatusSummary({ items }: { items: AdminInventoryItem[] }) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {[...counts.entries()].map(([status, count]) => (
        <span
          key={status}
          className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}
        >
          {count} {status}
        </span>
      ))}
    </div>
  );
}

/** Shows a single value if uniform across items, comma-separated distinct values otherwise. */
function SummaryField({ values }: { values: (string | null | undefined)[] }) {
  const distinct = [...new Set(values.map((v) => v ?? "-"))];
  if (distinct.length === 1) return <>{distinct[0]}</>;
  return <>{distinct.join(", ")}</>;
}

// ---------------------------------------------------------------------------
// Allocated-to cell (reused in sub-rows)
// ---------------------------------------------------------------------------

function AllocatedToCell({ item }: { item: AdminInventoryItem }) {
  if (!item.allocatedToListing) return <>Unallocated</>;

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/listings/${item.allocatedToListing.id}`}
        className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
        target="_blank"
      >
        {item.allocatedToListing.title}
        <span className="ml-1 text-muted-foreground">
          (${item.allocatedToListing.price.toFixed(2)})
        </span>
      </Link>
      <Link
        href={`/admin/listings?edit=${item.allocatedToListing.id}`}
        className="text-muted-foreground hover:text-foreground"
        title="Edit listing"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  const vinGroups = useMemo(
    () => buildVinGroups(part.inventoryItems),
    [part.inventoryItems],
  );

  const [expanded, setExpanded] = useState<Set<string | null>>(() => new Set());

  const toggleGroup = (vinKey: string | null) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(vinKey)) {
        next.delete(vinKey);
      } else {
        next.add(vinKey);
      }
      return next;
    });
  };

  /** Total column count for the grouped table. */
  const colCount = 8;

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
                <TableHead className="w-[32px]" />
                <TableHead>Donor VIN</TableHead>
                <TableHead className="w-[60px]">QTY</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Last Added</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vinGroups.map((group) => {
                const isSingle = group.qty === 1;
                const isExpanded = expanded.has(group.vinKey);
                const singleItem = isSingle ? group.items[0]! : undefined;

                const latestDate = group.items.reduce<Date>(
                  (max, item) => {
                    const d = new Date(item.createdAt);
                    return d > max ? d : max;
                  },
                  new Date(group.items[0]!.createdAt),
                );

                return (
                  <GroupRows
                    key={group.vinKey ?? "__null__"}
                    group={group}
                    isSingle={isSingle}
                    singleItem={singleItem}
                    isExpanded={isExpanded}
                    latestDate={latestDate}
                    colCount={colCount}
                    onToggle={() => toggleGroup(group.vinKey)}
                    onEditInventory={onEditInventory}
                    onDeleteInventory={onDeleteInventory}
                    onDuplicateInventory={onDuplicateInventory}
                    onCreateListing={onCreateListing}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group rows (summary + optional expanded sub-rows)
// ---------------------------------------------------------------------------

type GroupRowsProps = {
  group: VinGroup;
  isSingle: boolean;
  singleItem: AdminInventoryItem | undefined;
  isExpanded: boolean;
  latestDate: Date;
  colCount: number;
  onToggle: () => void;
  onEditInventory: (item: AdminInventoryItem) => void;
  onDeleteInventory: (item: AdminInventoryItem) => void;
  onDuplicateInventory: (item: AdminInventoryItem) => void;
  onCreateListing: (item: AdminInventoryItem) => void;
};

function GroupRows({
  group,
  isSingle,
  singleItem,
  isExpanded,
  latestDate,
  colCount,
  onToggle,
  onEditInventory,
  onDeleteInventory,
  onDuplicateInventory,
  onCreateListing,
}: GroupRowsProps) {
  return (
    <>
      {/* Summary row */}
      <TableRow
        className={!isSingle ? "cursor-pointer hover:bg-muted/50" : undefined}
        onClick={!isSingle ? onToggle : undefined}
      >
        {/* Chevron */}
        <TableCell className="w-[32px] px-2">
          {!isSingle && (
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          )}
        </TableCell>

        {/* Donor VIN */}
        <TableCell className="font-medium">
          {group.displayVin}
        </TableCell>

        {/* QTY */}
        <TableCell>
          <Badge variant="secondary">{group.qty}</Badge>
        </TableCell>

        {/* Status */}
        <TableCell>
          <StatusSummary items={group.items} />
        </TableCell>

        {/* Variant */}
        <TableCell>
          <SummaryField values={group.items.map((i) => i.variant)} />
        </TableCell>

        {/* Location */}
        <TableCell>
          <SummaryField values={group.items.map((i) => i.inventoryLocation?.name)} />
        </TableCell>

        {/* Last Added */}
        <TableCell>
          {latestDate.toLocaleDateString()}
        </TableCell>

        {/* Actions */}
        <TableCell>
          {singleItem && (
            <ItemActionMenu
              item={singleItem}
              onEdit={onEditInventory}
              onDuplicate={onDuplicateInventory}
              onCreateListing={onCreateListing}
              onDelete={onDeleteInventory}
            />
          )}
        </TableCell>
      </TableRow>

      {/* Expanded sub-rows */}
      {!isSingle && isExpanded && (
        <>
          {/* Sub-header */}
          <TableRow className="bg-muted/30">
            <TableCell />
            <TableCell className="text-xs font-medium text-muted-foreground">Status</TableCell>
            <TableCell className="text-xs font-medium text-muted-foreground">Variant</TableCell>
            <TableCell className="text-xs font-medium text-muted-foreground">Location</TableCell>
            <TableCell colSpan={2} className="text-xs font-medium text-muted-foreground">Allocated To</TableCell>
            <TableCell className="text-xs font-medium text-muted-foreground">Date Added</TableCell>
            <TableCell />
          </TableRow>
          {group.items.map((item) => (
            <TableRow key={item.id} className="bg-muted/10">
              {/* Indent spacer */}
              <TableCell />

              {/* Status */}
              <TableCell>
                <span className={`rounded px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>
                  {item.status}
                </span>
              </TableCell>

              {/* Variant */}
              <TableCell>{item.variant ?? "-"}</TableCell>

              {/* Location */}
              <TableCell>{item.inventoryLocation?.name ?? "Not assigned"}</TableCell>

              {/* Allocated To (spans 2 cols to match summary layout) */}
              <TableCell colSpan={2}>
                <AllocatedToCell item={item} />
              </TableCell>

              {/* Date Added */}
              <TableCell>
                {new Date(item.createdAt).toLocaleDateString()}
              </TableCell>

              {/* Actions */}
              <TableCell>
                <ItemActionMenu
                  item={item}
                  onEdit={onEditInventory}
                  onDuplicate={onDuplicateInventory}
                  onCreateListing={onCreateListing}
                  onDelete={onDeleteInventory}
                />
              </TableCell>
            </TableRow>
          ))}
        </>
      )}
    </>
  );
}
