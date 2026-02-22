"use client";

import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { DataTable } from "~/components/data-table/data-table";
import { getListingColumns } from "./_components/columns";
import { ListingForm } from "./_components/listing-form";
import { DeleteListingDialog } from "./_components/delete-listing-dialog";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { Plus, ShoppingCart } from "lucide-react";
import { ListOnEbayDialog } from "./_components/list-on-ebay-dialog";
import { type AdminListingsItem } from "~/trpc/shared";
import { useQueryState } from "nuqs";
import {
  BulkOrderDialog,
  type OrderItem,
} from "./_components/bulk-order-dialog";
import { FinalizeOrderDialog } from "./_components/finalize-order-dialog";
import { OrderToast } from "./_components/order-toast";
import { toast } from "sonner";
import { useAdminTitle } from "~/hooks/use-admin-title";

export default function ListingsAdminPage() {
  useAdminTitle("Listings");
  const [code, setCode] = useQueryState("code");
  const [isAddListingOpen, setIsAddListingOpen] = useState(false);
  const [isEditListingOpen, setIsEditListingOpen] = useState(false);
  const [isDeleteListingOpen, setIsDeleteListingOpen] = useState(false);
  const [isListOnEbayOpen, setIsListOnEbayOpen] = useState(false);
  const [isBulkOrderOpen, setIsBulkOrderOpen] = useState(false);
  const [isFinalizeOrderOpen, setIsFinalizeOrderOpen] = useState(false);
  const [selectedListing, setSelectedListing] =
    useState<AdminListingsItem | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<AdminListingsItem[]>([]);

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

  // Fetch all listings
  const listingsQuery = api.listings.getAllAdmin.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });

  const listings = listingsQuery.data?.items ?? [];
  const isLoading = listingsQuery.isLoading;

  const handleAddListing = () => {
    setIsAddListingOpen(true);
  };

  const handleEditListing = (item: AdminListingsItem) => {
    setSelectedListing(item);
    setIsEditListingOpen(true);
  };

  const handleDeleteListing = (item: AdminListingsItem) => {
    setSelectedListing(item);
    setIsDeleteListingOpen(true);
  };

  const handleDeleteDialogClose = (open: boolean) => {
    setIsDeleteListingOpen(open);
    if (!open) {
      setSelectedListing(null);
    }
  };

  const handleEditDialogClose = (open: boolean) => {
    setIsEditListingOpen(open);
    if (!open) {
      setSelectedListing(null);
    }
  };



  const handleListOnEbayDialogClose = (open: boolean) => {
    setIsListOnEbayOpen(open);
    if (!open) {
      setSelectedListing(null);
    }
  };



  const handleListOnEbay = (item: AdminListingsItem) => {
    setSelectedListing(item);
    setIsListOnEbayOpen(true);
  };

  const handleCreateBulkOrder = () => {
    if (selectedRows.length === 0) {
      toast.error("Please select at least one listing");
      return;
    }
    setIsBulkOrderOpen(true);
  };

  const handleOrderCreate = (newOrderItems: OrderItem[]) => {
    setOrderItems(newOrderItems);
    toast.custom(
      (id) => (
        <OrderToast
          orderItems={newOrderItems}
          onFinalizeClick={() => {
            setIsFinalizeOrderOpen(true);
            toast.dismiss(id);
          }}
        />
      ),
      { id: "order-toast", duration: Infinity },
    );
  };

  const handleOrderComplete = () => {
    setOrderItems([]);
    toast.dismiss("order-toast");
  };

  const columns = getListingColumns({
    onEdit: handleEditListing,
    onDelete: handleDeleteListing,
    onListOnEbay: handleListOnEbay,
  });

  const updateRefreshToken = api.ebay.setTokenSet.useMutation();

  useEffect(() => {
    if (code) {
      const _updateTokenRes = updateRefreshToken.mutateAsync({
        code: code,
      });

      void setCode(null);
    }
  }, [code]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Listings Management</h1>
        <div className="flex space-x-2">
          {orderItems.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFinalizeOrderOpen(true)}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              Order ({orderItems.length})
            </Button>
          )}
          <Button size="sm" onMouseDown={handleAddListing}>
            <Plus className="mr-2 h-4 w-4" />
            Add Listing
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      )}

      {!isLoading && (
        <>
          <DataTable
            columns={columns}
            data={listings}
            onSelectionChange={setSelectedRows}
            globalFilter={globalFilter}
            setGlobalFilter={setGlobalFilter}
            pageIndex={pageIndex}
            setPageIndex={setPageIndex}
            pageSize={pageSize}
            setPageSize={setPageSize}
              />
          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleCreateBulkOrder}
              disabled={selectedRows.length === 0}
            >
              Create Order from Selected ({selectedRows.length})
            </Button>
          </div>
        </>
      )}

      {isAddListingOpen && (
        <ListingForm
          open={isAddListingOpen}
          onOpenChange={setIsAddListingOpen}
        />
      )}

      {selectedListing && (
        <>
          <ListingForm
            open={isEditListingOpen}
            onOpenChange={handleEditDialogClose}
            defaultValues={selectedListing}
            isEditing
          />
          <DeleteListingDialog
            open={isDeleteListingOpen}
            onOpenChange={handleDeleteDialogClose}
            listing={selectedListing}
          />
          <ListOnEbayDialog
            open={isListOnEbayOpen}
            onOpenChange={handleListOnEbayDialogClose}
            listing={selectedListing}
          />
        </>
      )}

      <BulkOrderDialog
        open={isBulkOrderOpen}
        onOpenChange={setIsBulkOrderOpen}
        selectedListings={selectedRows}
        onOrderCreate={handleOrderCreate}
      />

      <FinalizeOrderDialog
        open={isFinalizeOrderOpen}
        onOpenChange={setIsFinalizeOrderOpen}
        orderItems={orderItems}
        listings={listings}
        onOrderComplete={handleOrderComplete}
      />
    </div>
  );
}
