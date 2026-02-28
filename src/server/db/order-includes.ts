import { type Prisma } from "@prisma/client";

/**
 * Canonical include for an order with its items, listings, images, and allocated parts.
 * Used by the admin orders query, pick sheet PDF, and new-order email.
 */
export const orderWithItemsInclude = {
  orderItems: {
    include: {
      listing: {
        include: {
          images: {
            select: { url: true },
            orderBy: { order: "asc" as const },
            take: 1,
          },
        },
      },
      allocatedParts: {
        include: {
          part: {
            include: {
              donor: { select: { vin: true } },
              inventoryLocation: { select: { id: true, name: true } },
              partDetails: { select: { partNo: true, name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: typeof orderWithItemsInclude;
}>;
