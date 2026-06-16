import { PartStatus } from "@prisma/client";

export type StockComponent = {
  partDetailId: string;
  quantity: number;
};

export type StockInventoryPart = {
  id?: string;
  partDetailsId: string;
  status: PartStatus;
  createdAt?: Date;
};

export type StockInput = {
  components: StockComponent[];
  inventoryParts: StockInventoryPart[];
};

export type ComponentAvailability = {
  partDetailId: string;
  requiredPerListing: number;
  availableParts: number;
  possibleListings: number;
};

export type RequiredPartCount = {
  partDetailId: string;
  required: number;
  perListing: number;
};

export const SELLABLE_PART_STATUSES: PartStatus[] = [
  PartStatus.AVAILABLE,
  PartStatus.RESERVED,
];

const isAvailable = (status: PartStatus): boolean =>
  SELLABLE_PART_STATUSES.includes(status);

export const calculateComponentAvailability = (
  input: StockInput,
): ComponentAvailability[] => {
  return input.components.map((component) => {
    const availableParts = input.inventoryParts.filter(
      (part) =>
        part.partDetailsId === component.partDetailId &&
        isAvailable(part.status),
    ).length;

    const requiredPerListing = Math.max(1, component.quantity);

    return {
      partDetailId: component.partDetailId,
      requiredPerListing,
      availableParts,
      possibleListings: Math.floor(availableParts / requiredPerListing),
    };
  });
};

export const calculateStock = (input: StockInput): number => {
  if (input.components.length === 0) return 0;
  const availability = calculateComponentAvailability(input);
  return Math.min(...availability.map((item) => item.possibleListings));
};

export const calculateRequiredPartCounts = (
  components: StockComponent[],
  listingQuantity: number,
): RequiredPartCount[] => {
  return components.map((component) => {
    const perListing = Math.max(1, component.quantity);
    return {
      partDetailId: component.partDetailId,
      perListing,
      required: perListing * listingQuantity,
    };
  });
};
