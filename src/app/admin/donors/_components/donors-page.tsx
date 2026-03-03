"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { DataTable } from "~/components/data-table/data-table";
import { getDonorColumns, type DonorWithCar } from "./columns";
import { DonorForm } from "./donor-form";
import { DeleteDonorDialog } from "./delete-donor-dialog";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { Plus } from "lucide-react";
import { useQueryState } from "nuqs";

export function DonorsPage() {
  const [isAddDonorOpen, setIsAddDonorOpen] = useState(false);
  const [isEditDonorOpen, setIsEditDonorOpen] = useState(false);
  const [isDeleteDonorOpen, setIsDeleteDonorOpen] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<DonorWithCar | null>(null);

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

  // Fetch all donors
  const donorsQuery = api.donor.getAll.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });

  // The donor router should already include the car relationship with 'include: { car: true }'
  const donors = donorsQuery.data?.items ?? [];
  const isLoading = donorsQuery.isLoading;

  const handleAddDonor = () => {
    setIsAddDonorOpen(true);
  };

  const handleEditDonor = (donor: DonorWithCar) => {
    setSelectedDonor(donor);
    setIsEditDonorOpen(true);
  };

  const handleEditDialogChange = (open: boolean) => {
    setIsEditDonorOpen(open);
    if (!open) {
      // Reset selected donor when dialog closes
      setSelectedDonor(null);
    }
  };

  const handleDeleteDonor = (donor: DonorWithCar) => {
    setSelectedDonor(donor);
    setIsDeleteDonorOpen(true);
  };

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDonorOpen(open);
    if (!open) {
      // Reset selected donor when dialog closes
      setSelectedDonor(null);
    }
  };

  const columns = getDonorColumns({
    onEdit: handleEditDonor,
    onDelete: handleDeleteDonor,
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Donor Management</h1>
        <Button size="sm" onClick={handleAddDonor}>
          <Plus className="mr-2 h-4 w-4" />
          Add Donor
        </Button>
      </div>

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      )}

      {!isLoading && (
        <DataTable
          columns={columns}
          data={donors}
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
          pageIndex={pageIndex}
          setPageIndex={setPageIndex}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      )}

      <DonorForm open={isAddDonorOpen} onOpenChange={setIsAddDonorOpen} />

      {selectedDonor && (
        <>
          <DonorForm
            key={selectedDonor.vin}
            open={isEditDonorOpen}
            onOpenChange={handleEditDialogChange}
            defaultValues={selectedDonor}
            isEditing
          />
          <DeleteDonorDialog
            open={isDeleteDonorOpen}
            onOpenChange={handleDeleteDialogChange}
            donor={selectedDonor}
          />
        </>
      )}
    </div>
  );
}
