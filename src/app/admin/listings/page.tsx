"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { DataTable } from "~/components/data-table/data-table";
import { getListingColumns } from "./_components/columns";
import { ListingForm } from "./_components/listing-form";
import { DeleteListingDialog } from "./_components/delete-listing-dialog";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { Plus } from "lucide-react";
import { ListOnEbayDialog } from "./_components/list-on-ebay-dialog";
import { type AdminListingsItem } from "~/trpc/shared";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { useAdminTitle } from "~/hooks/use-admin-title";

export default function ListingsAdminPage() {
  useAdminTitle("Listings");
  const [code, setCode] = useQueryState("code");
  const [isAddListingOpen, setIsAddListingOpen] = useState(false);
  const [isEditListingOpen, setIsEditListingOpen] = useState(false);
  const [isDeleteListingOpen, setIsDeleteListingOpen] = useState(false);
  const [isListOnEbayOpen, setIsListOnEbayOpen] = useState(false);
  const [selectedListing, setSelectedListing] =
    useState<AdminListingsItem | null>(null);

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

  const utils = api.useUtils();
  const unretireMutation = api.listings.unretire.useMutation({
    onSuccess: () => {
      toast.success("Listing unretired");
      void utils.listings.getAllAdmin.invalidate();
    },
    onError: (error) => {
      toast.error(`Error unretiring listing: ${error.message}`);
    },
  });

  const handleUnretire = useCallback(
    (item: AdminListingsItem) => {
      unretireMutation.mutate({ id: item.id });
    },
    [unretireMutation],
  );

  const columns = getListingColumns({
    onEdit: handleEditListing,
    onDelete: handleDeleteListing,
    onUnretire: handleUnretire,
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
        <Button size="sm" onMouseDown={handleAddListing}>
          <Plus className="mr-2 h-4 w-4" />
          Add Listing
        </Button>
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
            globalFilter={globalFilter}
            setGlobalFilter={setGlobalFilter}
            pageIndex={pageIndex}
            setPageIndex={setPageIndex}
            pageSize={pageSize}
            setPageSize={setPageSize}
          />
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

    </div>
  );
}
