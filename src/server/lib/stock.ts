import { type PartStatus } from "@prisma/client";

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

export type ReservationSelection = {
  selectedPartIds: string[];
  missingRequirements: RequiredPartCount[];
};

const isAvailable = (status: PartStatus): boolean => status === "AVAILABLE";

export const calculateComponentAvailability = (
  input: StockInput,
): ComponentAvailability[] => {
  return input.components.map((component) => {
    const availableParts = input.inventoryParts.filter(
      (part) =>
        part.partDetailsId === component.partDetailId && isAvailable(part.status),
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

export const selectPartsForReservation = (input: {
  components: StockComponent[];
  inventoryParts: Array<StockInventoryPart & { id: string; createdAt: Date }>;
  listingQuantity: number;
}): ReservationSelection => {
  const requiredCounts = calculateRequiredPartCounts(
    input.components,
    input.listingQuantity,
  );
  const selectedPartIds: string[] = [];
  const missingRequirements: RequiredPartCount[] = [];

  for (const requirement of requiredCounts) {
    const candidates = input.inventoryParts
      .filter(
        (part) =>
          part.partDetailsId === requirement.partDetailId && isAvailable(part.status),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, requirement.required);

    if (candidates.length < requirement.required) {
      missingRequirements.push({
        ...requirement,
        required: requirement.required - candidates.length,
      });
      continue;
    }

    selectedPartIds.push(...candidates.map((candidate) => candidate.id));
  }

  return {
    selectedPartIds,
    missingRequirements,
  };
};
