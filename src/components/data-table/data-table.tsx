"use client";
"use no memo";
import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type FilterFn,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  useReactTable,
} from "@tanstack/react-table";
import { Search } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { DataTablePagination } from "./data-table-pagination";
import { useQueryState } from "nuqs";
import { DataTableFilter } from "~/components/data-table-filter";
import {
  deserializeColumnFilters,
  filterFn,
  serializeColumnFilters,
} from "~/lib/filters";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  enableRowSelection?: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  globalFilter: string;
  setGlobalFilter: (value: string | null) => void;
  pageIndex: number;
  setPageIndex: (value: number | null) => void;
  pageSize: number;
  setPageSize: (value: number | null) => void;
  initialColumnVisibility?: VisibilityState;
  getRowCanExpand?: (row: TData) => boolean;
  renderExpandedRow?: (row: Row<TData>) => React.ReactNode;
  globalFilterFn?: FilterFn<TData>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  enableRowSelection = true,
  onSelectionChange,
  globalFilter,
  setGlobalFilter,
  pageIndex,
  setPageIndex,
  pageSize,
  setPageSize,
  initialColumnVisibility,
  getRowCanExpand,
  renderExpandedRow,
  globalFilterFn,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const [filtersParam, setFiltersParam] = useQueryState("filters", {
    defaultValue: "",
  });

  const columnFilters = React.useMemo(
    () =>
      filtersParam
        ? deserializeColumnFilters(filtersParam, columns)
        : [],
    [filtersParam, columns],
  );

  const handleColumnFiltersChange = React.useCallback(
    (
      updater:
        | ColumnFiltersState
        | ((old: ColumnFiltersState) => ColumnFiltersState),
    ) => {
      const next =
        typeof updater === "function" ? updater(columnFilters) : updater;
      void setFiltersParam(
        next.length === 0 ? null : serializeColumnFilters(next),
      );
    },
    [columnFilters, setFiltersParam],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialColumnVisibility ?? {});
  const [rowSelection, setRowSelection] = React.useState({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const columnsWithFilterFns = React.useMemo(
    () =>
      columns.map((col) => {
        if (col.meta?.type && !col.filterFn) {
          return { ...col, filterFn: filterFn(col.meta.type) }
        }
        return col
      }),
    [columns],
  );

  const table = useReactTable({
    data,
    columns: columnsWithFilterFns,
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onGlobalFilterChange: (value: string) => void setGlobalFilter(value),
    ...(globalFilterFn != null && { globalFilterFn }),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) =>
      getRowCanExpand ? getRowCanExpand(row.original) : false,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    autoResetPageIndex: false,
    onPaginationChange: (updater) => {
      const state =
        typeof updater === "function"
          ? updater(table.getState().pagination)
          : updater;
      void setPageIndex(state.pageIndex);
      void setPageSize(state.pageSize);
    },
    enableRowSelection,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnFilters,
      globalFilter: globalFilter || "",
      columnVisibility,
      rowSelection,
      expanded,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
  });

  // When the global search changes, reset to the first page for better UX
  React.useEffect(() => {
    table.setPageIndex(0);
  }, [globalFilter, columnFilters]);

  // Update the parent component when selection changes
  React.useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original);
      onSelectionChange(selectedRows);
    }
  }, [rowSelection, onSelectionChange, table]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full items-start gap-4">
        <div className="min-w-0 flex-1">
          <DataTableFilter table={table} />
          {table.getFilteredSelectedRowModel().rows.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {table.getFilteredSelectedRowModel().rows.length} of{" "}
              {table.getFilteredRowModel().rows.length} row(s) selected
            </p>
          )}
        </div>
        <div className="relative max-w-sm shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={globalFilter || ""}
            onChange={(event) => void setGlobalFilter(event.target.value)}
            className="max-w-sm pl-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const hasSize = header.column.columnDef.size !== undefined;
                  return (
                    <TableHead
                      key={header.id}
                      style={hasSize ? { width: header.getSize() } : undefined}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    id={row.id}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={
                          cell.column.columnDef.size !== undefined
                            ? { width: cell.column.getSize() }
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && renderExpandedRow && (
                    <TableRow>
                      <TableCell colSpan={row.getVisibleCells().length}>
                        {renderExpandedRow(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
