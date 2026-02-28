"use client";

import { type AdminInventoryItem } from "~/trpc/shared";
import {
  PartInventoryForm,
  type PartInventoryFormMode,
} from "../../_components/part-inventory-form";

type InventoryFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: AdminInventoryItem;
  isEditing?: boolean;
  isDuplicating?: boolean;
  prefillPart?: {
    partNo: string;
    name?: string;
  };
};

export function InventoryForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
  isDuplicating = false,
  prefillPart,
}: InventoryFormProps) {
  const mode: PartInventoryFormMode = (() => {
    if (isDuplicating && defaultValues) {
      return { kind: "duplicateInventory", defaults: defaultValues };
    }
    if (isEditing && defaultValues) {
      return { kind: "editInventory", defaults: defaultValues };
    }
    return { kind: "addInventory", prefillPart };
  })();

  return (
    <PartInventoryForm open={open} onOpenChange={onOpenChange} mode={mode} />
  );
}
