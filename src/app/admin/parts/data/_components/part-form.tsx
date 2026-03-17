"use client";

import {
  PartInventoryForm,
  type PartDefaults,
  type PartInventoryFormMode,
} from "../../_components/part-inventory-form";

type PartFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: PartDefaults;
  isEditing?: boolean;
  isDuplicating?: boolean;
};

export function PartForm({
  open,
  onOpenChange,
  defaultValues,
  isEditing = false,
  isDuplicating = false,
}: PartFormProps) {
  const mode: PartInventoryFormMode =
    isDuplicating && defaultValues
      ? { kind: "duplicatePart", defaults: defaultValues }
      : isEditing && defaultValues
        ? { kind: "editPart", defaults: defaultValues }
        : { kind: "addPart" };

  return (
    <PartInventoryForm open={open} onOpenChange={onOpenChange} mode={mode} />
  );
}
