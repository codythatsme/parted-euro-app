"use client";

import { api } from "~/trpc/react";
import { DataTable } from "~/components/data-table/data-table";
import { getUserColumns } from "./_components/columns";
import { keepPreviousData } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useAdminTitle } from "~/hooks/use-admin-title";

export default function UsersAdminPage() {
  useAdminTitle("Users");
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

  // Fetch all users
  const { data: usersData, isLoading } = api.user.getAll.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });

  const users = usersData?.items ?? [];

  const columns = getUserColumns();

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Users Management</h1>
      </div>

      {/* Removed search input div */}

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      )}

      {!isLoading && (
        <DataTable
          columns={columns}
          data={users}
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
          pageIndex={pageIndex}
          setPageIndex={setPageIndex}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      )}
    </div>
  );
}
