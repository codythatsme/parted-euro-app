"use client";
"use no memo";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "~/components/ui/button";
import { type AdminOrdersItem } from "~/trpc/shared";
import { PickSheetDocument } from "~/lib/pick-sheet-document";

export async function downloadPickSheet(order: AdminOrdersItem) {
  const logoSrc = `${window.location.origin}/logo.png`;
  const blob = await pdf(
    <PickSheetDocument
      order={order}
      logoSrc={logoSrc}
      subtotalDollars={order.subtotal}
      shippingDollars={order.shipping ?? 0}
    />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

export function PickSheetButton({ order }: { order: AdminOrdersItem }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await downloadPickSheet(order);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? "Generating\u2026" : "Pick Sheet"}
    </Button>
  );
}
