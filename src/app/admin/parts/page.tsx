"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { type FilterFn } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { ListingForm } from "~/app/admin/listings/_components/listing-form";
import { DataTable } from "~/components/data-table/data-table";
import { Button } from "~/components/ui/button";
import { useAdminTitle } from "~/hooks/use-admin-title";
import { api } from "~/trpc/react";
import { type AdminInventoryItem } from "~/trpc/shared";
import { DeletePartDialog } from "./data/_components/delete-part-dialog";
import { PartForm } from "./data/_components/part-form";
import { type UnifiedPartRow, getUnifiedPartColumns } from "./_components/columns";
import { InventoryExpandedPanel } from "./_components/inventory-expanded-panel";
import { DeleteInventoryDialog } from "./inventory/_components/delete-inventory-dialog";
import { InventoryForm } from "./inventory/_components/inventory-form";

const buildInventorySearchText = (item: AdminInventoryItem) =>
  [
    item.partDetails?.partNo,
    item.partDetails?.name,
    item.partDetails?.alternatePartNumbers ?? "",
    item.variant,
    item.donorVin,
    item.inventoryLocation?.name,
    item.allocatedToListing?.title,
    item.status,
  ]
    .filter(Boolean)
    .join(" ");

const partsGlobalFilterFn: FilterFn<UnifiedPartRow> = (row, _columnId, value) => {
  const needle = String(value ?? "").trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    row.original.partNo,
    row.original.name,
    row.original.alternatePartNumbers ?? "",
    row.original.inventorySearchText,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
};

export default function PartsPage() {
  useAdminTitle("Parts");
  const [isAddPartOpen, setIsAddPartOpen] = useState(false);
  const [isEditPartOpen, setIsEditPartOpen] = useState(false);
  const [isDeletePartOpen, setIsDeletePartOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<UnifiedPartRow | null>(null);

  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false);
  const [isEditInventoryOpen, setIsEditInventoryOpen] = useState(false);
  const [isDeleteInventoryOpen, setIsDeleteInventoryOpen] = useState(false);
  const [isDuplicateInventoryOpen, setIsDuplicateInventoryOpen] = useState(false);
  const [isCreateListingOpen, setIsCreateListingOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] =
    useState<AdminInventoryItem | null>(null);
  const [prefilledPart, setPrefilledPart] = useState<{
    partNo: string;
    name: string;
  } | null>(null);

  const [globalFilter, setGlobalFilter] = useQueryState("search", {
    defaultValue: "",
  });
  const [pageIndex, setPageIndex] = useQueryState("page", {
    defaultValue: 0,
    parse: (value) => Number(value),
    serialize: (value) => value.toString(),
  });
  const [pageSize, setPageSize] = useQueryState("size", {
    defaultValue: 10,
    parse: (value) => Number(value),
    serialize: (value) => value.toString(),
  });

  const partsQuery = api.part.getAll.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });
  const inventoryQuery = api.inventory.getAll.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });

  const partRows = useMemo<UnifiedPartRow[]>(() => {
    const allParts = partsQuery.data?.items ?? [];
    const allInventory = inventoryQuery.data ?? [];

    const inventoryByPartNo = new Map<string, AdminInventoryItem[]>();
    for (const item of allInventory) {
      const key = item.partDetails?.partNo ?? item.partDetailsId;
      if (!inventoryByPartNo.has(key)) {
        inventoryByPartNo.set(key, []);
      }
      inventoryByPartNo.get(key)?.push(item);
    }

    return allParts.map((part) => {
      const inventoryItems = inventoryByPartNo.get(part.partNo) ?? [];
      const inventoryCounts = {
        total: inventoryItems.length,
        available: inventoryItems.filter((item) => item.status === "AVAILABLE")
          .length,
        reserved: inventoryItems.filter((item) => item.status === "RESERVED")
          .length,
        sold: inventoryItems.filter((item) => item.status === "SOLD").length,
        returned: inventoryItems.filter((item) => item.status === "RETURNED")
          .length,
      };

      let lastInventoryAdded: Date | null = null;
      for (const item of inventoryItems) {
        const d = new Date(item.createdAt);
        if (!lastInventoryAdded || d > lastInventoryAdded) {
          lastInventoryAdded = d;
        }
      }

      return {
        ...part,
        inventoryItems,
        inventoryCounts,
        inventorySearchText: inventoryItems.map(buildInventorySearchText).join(" "),
        lastInventoryAdded,
      };
    });
  }, [inventoryQuery.data, partsQuery.data?.items]);

  const isLoading = partsQuery.isLoading || inventoryQuery.isLoading;

  const handleEditPart = (part: UnifiedPartRow) => {
    setSelectedPart(part);
    setIsEditPartOpen(true);
  };

  const handleDeletePart = (part: UnifiedPartRow) => {
    setSelectedPart(part);
    setIsDeletePartOpen(true);
  };

  const handleAddInventoryForPart = (part: UnifiedPartRow) => {
    setPrefilledPart({
      partNo: part.partNo,
      name: part.name,
    });
    setIsAddInventoryOpen(true);
  };

  const handleEditInventory = (item: AdminInventoryItem) => {
    setSelectedInventory(item);
    setIsEditInventoryOpen(true);
  };

  const handleDeleteInventory = (item: AdminInventoryItem) => {
    setSelectedInventory(item);
    setIsDeleteInventoryOpen(true);
  };

  const handleDuplicateInventory = (item: AdminInventoryItem) => {
    setSelectedInventory(item);
    setIsDuplicateInventoryOpen(true);
  };

  const handleCreateListing = (item: AdminInventoryItem) => {
    setSelectedInventory(item);
    setIsCreateListingOpen(true);
  };

  const columns = getUnifiedPartColumns({
    onEditPart: handleEditPart,
    onDeletePart: handleDeletePart,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Parts</h1>
        <Button size="sm" onMouseDown={() => setIsAddPartOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Part
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-20 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={partRows}
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
          pageIndex={pageIndex}
          setPageIndex={setPageIndex}
          pageSize={pageSize}
          setPageSize={setPageSize}
          enableRowSelection={false}
          globalFilterFn={partsGlobalFilterFn}
          initialColumnVisibility={{ inventorySearchText: false, allocationStatus: false }}
          initialSorting={[{ id: "lastInventoryAdded", desc: true }]}
          getRowCanExpand={() => true}
          renderExpandedRow={(row) => (
            <InventoryExpandedPanel
              part={row.original}
              onAddInventory={handleAddInventoryForPart}
              onEditInventory={handleEditInventory}
              onDeleteInventory={handleDeleteInventory}
              onDuplicateInventory={handleDuplicateInventory}
              onCreateListing={handleCreateListing}
            />
          )}
        />
      )}

      <PartForm open={isAddPartOpen} onOpenChange={setIsAddPartOpen} />

      {selectedPart && (
        <>
          <PartForm
            open={isEditPartOpen}
            onOpenChange={setIsEditPartOpen}
            defaultValues={selectedPart}
            isEditing
          />
          <DeletePartDialog
            open={isDeletePartOpen}
            onOpenChange={setIsDeletePartOpen}
            part={selectedPart}
          />
        </>
      )}

      <InventoryForm
        open={isAddInventoryOpen}
        onOpenChange={(open) => {
          setIsAddInventoryOpen(open);
          if (!open) setPrefilledPart(null);
        }}
        prefillPart={prefilledPart ?? undefined}
      />

      {selectedInventory && (
        <>
          <InventoryForm
            open={isEditInventoryOpen}
            onOpenChange={(open) => {
              setIsEditInventoryOpen(open);
            }}
            defaultValues={selectedInventory}
            isEditing
          />
          <InventoryForm
            open={isDuplicateInventoryOpen}
            onOpenChange={(open) => {
              setIsDuplicateInventoryOpen(open);
            }}
            defaultValues={selectedInventory}
            isDuplicating
          />
          <DeleteInventoryDialog
            open={isDeleteInventoryOpen}
            onOpenChange={(open) => {
              setIsDeleteInventoryOpen(open);
              if (!open) setSelectedInventory(null);
            }}
            inventory={selectedInventory}
          />
          {isCreateListingOpen && (
            <ListingForm
              open={isCreateListingOpen}
              onOpenChange={(open) => {
                setIsCreateListingOpen(open);
                if (!open) setSelectedInventory(null);
              }}
              initialPart={{
                ids: [selectedInventory.id],
                name: selectedInventory.partDetails?.name,
                partNo: selectedInventory.partDetails?.partNo,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
