"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Switch } from "~/components/ui/switch";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  isAdmin: boolean;
};

export function getUserColumns(): ColumnDef<User>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const name = row.getValue<string>("name");
        return <div>{name || "Unnamed User"}</div>;
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Email" />
      ),
    },
    // {
    //   accessorKey: "emailVerified",
    //   header: ({ column }) => {
    //     const isSorted = column.getIsSorted();
    //     return (
    //       <Button
    //         variant="ghost"
    //         onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    //         className="-ml-4"
    //       >
    //         Verified
    //         {isSorted ? (
    //           isSorted === "asc" ? (
    //             <ArrowUp className="ml-2 h-4 w-4" />
    //           ) : (
    //             <ArrowDown className="ml-2 h-4 w-4" />
    //           )
    //         ) : (
    //           <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    //         )}
    //       </Button>
    //     );
    //   },
    //   cell: ({ row }) => {
    //     const isVerified = !!row.getValue("emailVerified");
    //     return (
    //       <div className="flex justify-center">
    //         {isVerified ? (
    //           <Check className="h-5 w-5 text-green-500" />
    //         ) : (
    //           <X className="h-5 w-5 text-red-500" />
    //         )}
    //       </div>
    //     );
    //   },
    // },
    {
      accessorKey: "isAdmin",
      header: "Admin Status",
      meta: {
        displayName: "Admin",
        icon: Shield,
        type: "option",
        transformOptionFn: (val) => ({
          label: val ? "Yes" : "No",
          value: val ? "true" : "false",
        }),
      },
      cell: ({ row }) => {
        const user = row.original;
        const isAdmin = row.getValue<boolean>("isAdmin");

        const utils = api.useUtils();
        const toggleAdminMutation = api.user.toggleAdmin.useMutation({
          onSuccess: () => {
            toast.success(
              `User ${isAdmin ? "removed from" : "added to"} admin role`,
            );
            void utils.user.getAll.invalidate();
          },
          onError: (error) => {
            toast.error(`Error toggling admin status: ${error.message}`);
          },
        });

        const handleToggleAdmin = () => {
          toggleAdminMutation.mutate({
            userId: user.id,
            isAdmin: !isAdmin,
          });
        };

        return (
          <div className="flex items-center justify-center">
            <Switch
              checked={isAdmin}
              onCheckedChange={handleToggleAdmin}
              disabled={toggleAdminMutation.isPending}
              aria-label="Toggle admin status"
            />
          </div>
        );
      },
    },
  ];
}
