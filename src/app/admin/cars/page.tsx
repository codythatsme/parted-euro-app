"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { DataTable } from "~/components/data-table/data-table";
import { getCarColumns } from "./_components/columns";
import { CarForm } from "./_components/car-form";
import { DeleteCarDialog } from "./_components/delete-car-dialog";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { Plus } from "lucide-react";
import { type AdminCarItem } from "~/trpc/shared";
import { useQueryState } from "nuqs";
import { useAdminTitle } from "~/hooks/use-admin-title";

export default function CarsAdminPage() {
  useAdminTitle("Cars");
  const [isAddCarOpen, setIsAddCarOpen] = useState(false);
  const [isEditCarOpen, setIsEditCarOpen] = useState(false);
  const [isDeleteCarOpen, setIsDeleteCarOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState<AdminCarItem | null>(null);

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

  // Fetch all cars
  const { data, isLoading, isError: _isError } = api.car.getAll.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });

  const cars = data?.items ?? [];

  const handleAddCar = () => {
    setIsAddCarOpen(true);
  };

  const handleEditCar = (car: AdminCarItem) => {
    setSelectedCar(car);
    setIsEditCarOpen(true);
  };

  const handleDeleteCar = (car: AdminCarItem) => {
    setSelectedCar(car);
    setIsDeleteCarOpen(true);
  };

  const columns = getCarColumns({
    onEdit: handleEditCar,
    onDelete: handleDeleteCar,
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Car Management</h1>
        <Button size="sm" onClick={handleAddCar}>
          <Plus className="mr-2 h-4 w-4" />
          Add Car
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
          data={cars}
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
          pageIndex={pageIndex}
          setPageIndex={setPageIndex}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      )}

      <CarForm open={isAddCarOpen} onOpenChange={setIsAddCarOpen} />

      {selectedCar && (
        <>
          <CarForm
            open={isEditCarOpen}
            onOpenChange={setIsEditCarOpen}
            defaultValues={selectedCar}
            isEditing
          />
          <DeleteCarDialog
            open={isDeleteCarOpen}
            onOpenChange={setIsDeleteCarOpen}
            car={selectedCar}
          />
        </>
      )}
    </div>
  );
}
