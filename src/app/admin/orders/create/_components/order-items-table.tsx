"use client";

import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "~/components/ui/table";
import { X } from "lucide-react";

export type OrderPartRow = {
  partId: string;
  listingId: string;
  listingTitle: string;
  partNo: string;
  variant: string | null;
  donorVin: string | null;
  priceValue: string;
};

interface OrderItemsTableProps {
  items: OrderPartRow[];
  onPriceChange: (partId: string, value: string) => void;
  onRemove: (partId: string) => void;
}

function parsePrice(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export function OrderItemsTable({
  items,
  onPriceChange,
  onRemove,
}: OrderItemsTableProps) {
  const subtotal = items.reduce(
    (sum, item) => sum + parsePrice(item.priceValue),
    0,
  );

  if (items.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Search and add parts above to build your order.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[45%]">Description</TableHead>
          <TableHead>Part No</TableHead>
          <TableHead>Price</TableHead>
          <TableHead className="text-right">Subtotal</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const price = parsePrice(item.priceValue);
          const description = [
            item.listingTitle,
            item.variant ? `(${item.variant})` : null,
            item.donorVin ? `VIN: ${item.donorVin}` : null,
          ]
            .filter(Boolean)
            .join(" — ");

          return (
            <TableRow key={item.partId}>
              <TableCell className="font-medium">{description}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {item.partNo}
              </TableCell>
              <TableCell>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={item.priceValue}
                  onChange={(e) => onPriceChange(item.partId, e.target.value)}
                  className="w-24"
                />
              </TableCell>
              <TableCell className="text-right">
                ${price.toFixed(2)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemove(item.partId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="font-bold">
            Total
          </TableCell>
          <TableCell className="text-right font-bold">
            ${subtotal.toFixed(2)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
